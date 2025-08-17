#!/bin/bash

# 🎸 Demà Band Website - Oracle OCI VPS Deployment Script
# Optimized for Oracle Cloud Infrastructure
# Run this script on your OCI Ubuntu instance

set -e  # Exit on any error

echo "🎸 Welcome to Demà Band Website Deployment on Oracle OCI!"
echo "======================================================="

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running on Ubuntu (OCI default)
if ! command -v apt &> /dev/null; then
    print_error "This script is designed for Ubuntu. Are you on the right OS?"
    exit 1
fi

print_status "Detected Ubuntu - perfect for Oracle OCI!"

# Check if running as ubuntu user (OCI default)
if [ "$USER" != "ubuntu" ] && [ "$USER" != "root" ]; then
    print_warning "Running as user: $USER. OCI typically uses 'ubuntu' user."
fi

# Switch to sudo for installations if not root
if [ "$EUID" -ne 0 ]; then
    print_status "Will use sudo for system operations..."
    SUDO="sudo"
else
    SUDO=""
fi

print_status "Starting Oracle OCI deployment process..."

# Update system (important for OCI instances)
print_status "Updating system packages..."
$SUDO apt update && $SUDO apt upgrade -y
print_success "System updated"

# Install essential packages
print_status "Installing essential packages..."
$SUDO apt install -y curl wget git build-essential
print_success "Essential packages installed"

# Install Node.js (ARM-optimized for OCI)
print_status "Installing Node.js for ARM architecture..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | $SUDO -E bash -
    $SUDO apt-get install -y nodejs
    print_success "Node.js installed: $(node --version) on $(uname -m)"
else
    print_success "Node.js already installed: $(node --version)"
fi

# Install PM2
print_status "Installing PM2 process manager..."
if ! command -v pm2 &> /dev/null; then
    $SUDO npm install -g pm2
    print_success "PM2 installed"
else
    print_success "PM2 already installed"
fi

# Install Nginx
print_status "Installing Nginx..."
if ! command -v nginx &> /dev/null; then
    $SUDO apt install nginx -y
    $SUDO systemctl start nginx
    $SUDO systemctl enable nginx
    print_success "Nginx installed and started"
else
    print_success "Nginx already installed"
fi

# Install Certbot for SSL
print_status "Installing Certbot for SSL..."
if ! command -v certbot &> /dev/null; then
    $SUDO apt install certbot python3-certbot-nginx -y
    print_success "Certbot installed"
else
    print_success "Certbot already installed"
fi

# Configure Ubuntu Firewall (UFW) - OCI specific
print_status "Configuring Ubuntu firewall (UFW)..."
$SUDO ufw --force reset
$SUDO ufw default deny incoming
$SUDO ufw default allow outgoing
$SUDO ufw allow ssh
$SUDO ufw allow 22/tcp
$SUDO ufw allow 80/tcp
$SUDO ufw allow 443/tcp
$SUDO ufw --force enable
print_success "Ubuntu firewall configured"

# Create web directory (in ubuntu user home or /var/www)
print_status "Setting up web directory..."
if [ "$USER" = "ubuntu" ]; then
    WEB_DIR="/home/ubuntu/web-dema"
    print_status "Using ubuntu user home directory: $WEB_DIR"
else
    WEB_DIR="/var/www/web-dema"
    print_status "Using standard web directory: $WEB_DIR"
fi

# Backup existing directory if it exists
if [ -d "$WEB_DIR" ]; then
    print_warning "web-dema directory already exists. Backing up..."
    mv "$WEB_DIR" "${WEB_DIR}-backup-$(date +%Y%m%d-%H%M%S)"
fi

# Create directory and set permissions
$SUDO mkdir -p "$WEB_DIR"
if [ "$USER" = "ubuntu" ]; then
    $SUDO chown -R ubuntu:ubuntu "$WEB_DIR"
fi
cd "$WEB_DIR"

# Ask user for deployment method
echo ""
echo "How would you like to deploy the website?"
echo "1) Git clone from GitHub (recommended)"
echo "2) I'll upload files manually via SFTP"
read -p "Choose option (1 or 2): " deploy_method

if [ "$deploy_method" = "1" ]; then
    print_status "Cloning from GitHub..."
    git clone https://github.com/polipolo55/web-dema.git .
    print_success "Repository cloned"
elif [ "$deploy_method" = "2" ]; then
    print_warning "Please upload your files to $WEB_DIR using SFTP"
    echo "Example command from your local machine:"
    echo "scp -i /path/to/your/key.pem -r /path/to/web-dema/* ubuntu@$(curl -s ifconfig.me):$WEB_DIR/"
    echo ""
    echo "Press Enter when you have uploaded all files..."
    read -p ""
else
    print_error "Invalid option selected"
    exit 1
fi

# Check if package.json exists
if [ ! -f "package.json" ]; then
    print_error "package.json not found. Make sure you're in the correct directory and all files are uploaded."
    exit 1
fi

# Install dependencies
print_status "Installing Node.js dependencies..."
npm install --production
print_success "Dependencies installed"

# Setup environment file
print_status "Setting up environment configuration..."
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        print_warning "Created .env from .env.example"
        echo ""
        echo "⚠️  IMPORTANT: You need to edit the .env file with your settings!"
        echo "Run: nano .env"
        echo "Change the ADMIN_PASSWORD to something secure!"
    else
        print_error ".env.example not found"
        exit 1
    fi
else
    print_success ".env file already exists"
fi

# Create logs directory
mkdir -p logs

# Get the public IP address
PUBLIC_IP=$(curl -s ifconfig.me)
print_status "Detected public IP: $PUBLIC_IP"

# Ask for domain name
echo ""
read -p "Enter your domain name (e.g., demaband.com): " domain_name

if [ -z "$domain_name" ]; then
    print_error "Domain name cannot be empty"
    exit 1
fi

# Update ecosystem.config.json with correct path
if [ -f "ecosystem.config.json" ]; then
    sed -i "s|\"script\": \"server.js\"|\"script\": \"$WEB_DIR/server.js\"|g" ecosystem.config.json
fi

# Create Nginx configuration for OCI
print_status "Creating Nginx configuration for Oracle OCI..."
$SUDO tee /etc/nginx/sites-available/dema-website > /dev/null << EOF
# Oracle OCI optimized Nginx configuration
server {
    listen 80;
    server_name $domain_name www.$domain_name $PUBLIC_IP;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy "strict-origin-when-cross-origin";
    add_header X-Forwarded-For \$proxy_add_x_forwarded_for;

    # Rate limiting (OCI specific)
    limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;
    limit_req zone=api burst=20 nodelay;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Serve static assets with long cache and compression
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|mp3|mp4|webm)$ {
        proxy_pass http://localhost:3000;
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header Access-Control-Allow-Origin "*";
    }

    # Gzip compression (important for OCI bandwidth)
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types
        text/plain
        text/css
        text/xml
        text/javascript
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;

    # Client max body size
    client_max_body_size 10M;
}
EOF

# Enable the site
$SUDO ln -sf /etc/nginx/sites-available/dema-website /etc/nginx/sites-enabled/
$SUDO rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
if $SUDO nginx -t; then
    $SUDO systemctl reload nginx
    print_success "Nginx configuration created and reloaded"
else
    print_error "Nginx configuration has errors"
    exit 1
fi

# Start the application with PM2
print_status "Starting the application with PM2..."
export PATH=$PATH:/usr/bin/node
pm2 start ecosystem.config.json
pm2 save

# Setup PM2 startup (OCI specific)
PM2_STARTUP_CMD=$(pm2 startup ubuntu -u $USER --hp /home/ubuntu 2>/dev/null | grep "sudo env" | head -1)
if [ ! -z "$PM2_STARTUP_CMD" ]; then
    print_status "Setting up PM2 auto-startup..."
    eval $PM2_STARTUP_CMD
    print_success "PM2 auto-startup configured"
fi

print_success "Application started with PM2"

# Setup SSL certificate
echo ""
echo "🔒 SSL Certificate Setup"
echo "⚠️  Make sure your domain DNS is already pointing to this server IP: $PUBLIC_IP"
echo "Check DNS with: nslookup $domain_name"
echo ""
read -p "Is your domain DNS already configured? (y/n): " dns_ready

if [ "$dns_ready" = "y" ] || [ "$dns_ready" = "Y" ]; then
    read -p "Setup SSL certificate now? (y/n): " setup_ssl
    
    if [ "$setup_ssl" = "y" ] || [ "$setup_ssl" = "Y" ]; then
        print_status "Setting up SSL certificate..."
        $SUDO certbot --nginx -d $domain_name -d www.$domain_name --non-interactive --agree-tos --email admin@$domain_name
        
        # Setup auto-renewal
        ($SUDO crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | $SUDO crontab -
        print_success "SSL certificate configured with auto-renewal"
    else
        print_warning "SSL setup skipped. You can run this later:"
        echo "$SUDO certbot --nginx -d $domain_name -d www.$domain_name"
    fi
else
    print_warning "Configure your DNS first, then run:"
    echo "$SUDO certbot --nginx -d $domain_name -d www.$domain_name"
fi

# Final checks
print_status "Running final checks..."
sleep 5

if pm2 list | grep -q "online"; then
    print_success "Application is running with PM2"
else
    print_error "Application is not running. Check logs with: pm2 logs"
fi

if curl -s -o /dev/null -w "%{http_code}" localhost:3000 | grep -q "200"; then
    print_success "Application responding on port 3000"
else
    print_warning "Application not responding on port 3000"
fi

# Display important information
echo ""
echo "🎉 Oracle OCI Deployment Complete!"
echo "=================================="
echo ""
echo "🖥️  Server Information:"
echo "   Public IP: $PUBLIC_IP"
echo "   Architecture: $(uname -m)"
echo "   OS: $(lsb_release -d | cut -f2)"
echo ""
echo "🌐 Your website should be accessible at:"
if [ "$setup_ssl" = "y" ] || [ "$setup_ssl" = "Y" ]; then
    echo "   https://$domain_name"
    echo "   https://www.$domain_name"
else
    echo "   http://$domain_name"
    echo "   http://www.$domain_name"
fi
echo "   http://$PUBLIC_IP (direct IP access)"
echo ""
echo "⚠️  IMPORTANT NEXT STEPS:"
echo "1. Configure DNS in Hostinger hPanel:"
echo "   - A record: @ → $PUBLIC_IP"
echo "   - A record: www → $PUBLIC_IP"
echo "2. Edit your .env file: nano .env"
echo "3. Change the ADMIN_PASSWORD to something secure"
echo "4. Restart the application: pm2 restart dema-website"
echo ""
echo "📊 Useful Oracle OCI commands:"
echo "   pm2 status              # Check application status"
echo "   pm2 logs dema-website   # View application logs"
echo "   pm2 restart dema-website # Restart application"
echo "   sudo systemctl status nginx # Check Nginx status"
echo "   sudo ufw status         # Check firewall status"
echo ""
echo "🔍 Troubleshooting:"
echo "   - Check OCI Security Lists (port 80, 443 open)"
echo "   - Verify Ubuntu firewall: sudo ufw status"
echo "   - Check logs: pm2 logs"
echo "   - Test direct access: curl http://localhost:3000"
echo ""
echo "🎸 Rock on! Your Demà website is ready on Oracle OCI!"

# Show current status
echo ""
echo "Current Status:"
echo "==============="
pm2 status
echo ""
echo "Public IP: $PUBLIC_IP"
echo "Domain configured: $domain_name"
echo ""
echo "Next: Configure DNS in Hostinger to point $domain_name to $PUBLIC_IP"
