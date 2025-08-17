#!/bin/bash

# 🎸 Demà Band Website - Automated Hostinger VPS Deployment Script
# Run this script on your Hostinger VPS after initial server setup

set -e  # Exit on any error

echo "🎸 Welcome to Demà Band Website Deployment!"
echo "============================================"

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

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "Please run this script as root (use sudo)"
    exit 1
fi

print_status "Starting deployment process..."

# Update system
print_status "Updating system packages..."
apt update && apt upgrade -y
print_success "System updated"

# Install Node.js
print_status "Installing Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
    print_success "Node.js installed: $(node --version)"
else
    print_success "Node.js already installed: $(node --version)"
fi

# Install PM2
print_status "Installing PM2..."
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
    print_success "PM2 installed"
else
    print_success "PM2 already installed"
fi

# Install Nginx
print_status "Installing Nginx..."
if ! command -v nginx &> /dev/null; then
    apt install nginx -y
    systemctl start nginx
    systemctl enable nginx
    print_success "Nginx installed and started"
else
    print_success "Nginx already installed"
fi

# Install Certbot for SSL
print_status "Installing Certbot for SSL..."
if ! command -v certbot &> /dev/null; then
    apt install certbot python3-certbot-nginx -y
    print_success "Certbot installed"
else
    print_success "Certbot already installed"
fi

# Create web directory
print_status "Creating web directory..."
mkdir -p /var/www
cd /var/www

# Check if website directory exists
if [ -d "web-dema" ]; then
    print_warning "web-dema directory already exists. Backing up..."
    mv web-dema web-dema-backup-$(date +%Y%m%d-%H%M%S)
fi

# Ask user for deployment method
echo ""
echo "How would you like to deploy the website?"
echo "1) Git clone from GitHub (recommended)"
echo "2) I'll upload files manually via FTP"
read -p "Choose option (1 or 2): " deploy_method

if [ "$deploy_method" = "1" ]; then
    print_status "Cloning from GitHub..."
    git clone https://github.com/polipolo55/web-dema.git
    cd web-dema
    print_success "Repository cloned"
elif [ "$deploy_method" = "2" ]; then
    print_warning "Please upload your files to /var/www/web-dema/ using FTP"
    mkdir -p web-dema
    cd web-dema
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

# Ask for domain name
echo ""
read -p "Enter your domain name (e.g., demaband.com): " domain_name

if [ -z "$domain_name" ]; then
    print_error "Domain name cannot be empty"
    exit 1
fi

# Create Nginx configuration
print_status "Creating Nginx configuration..."
cat > /etc/nginx/sites-available/dema-website << EOF
server {
    listen 80;
    server_name $domain_name www.$domain_name;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy "strict-origin-when-cross-origin";

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
    }

    # Serve static assets with long cache
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|mp3|mp4|webm)$ {
        proxy_pass http://localhost:3000;
        expires 1y;
        add_header Cache-Control "public, immutable";
        add_header Access-Control-Allow-Origin "*";
    }

    # Gzip compression
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
}
EOF

# Enable the site
ln -sf /etc/nginx/sites-available/dema-website /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Test Nginx configuration
if nginx -t; then
    systemctl reload nginx
    print_success "Nginx configuration created and reloaded"
else
    print_error "Nginx configuration has errors"
    exit 1
fi

# Start the application
print_status "Starting the application with PM2..."
pm2 start ecosystem.config.json
pm2 save
pm2 startup

print_success "Application started with PM2"

# Configure UFW firewall
print_status "Configuring firewall..."
if command -v ufw &> /dev/null; then
    ufw allow ssh
    ufw allow 'Nginx Full'
    ufw --force enable
    print_success "Firewall configured"
fi

# Setup SSL certificate
echo ""
echo "🔒 SSL Certificate Setup"
echo "Do you want to setup SSL certificate now? (recommended)"
read -p "Setup SSL? (y/n): " setup_ssl

if [ "$setup_ssl" = "y" ] || [ "$setup_ssl" = "Y" ]; then
    print_status "Setting up SSL certificate..."
    certbot --nginx -d $domain_name -d www.$domain_name --non-interactive --agree-tos --email admin@$domain_name
    
    # Setup auto-renewal
    (crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | crontab -
    print_success "SSL certificate configured with auto-renewal"
else
    print_warning "SSL setup skipped. You can run this later:"
    echo "certbot --nginx -d $domain_name -d www.$domain_name"
fi

# Final checks
print_status "Running final checks..."
sleep 5

if pm2 list | grep -q "online"; then
    print_success "Application is running"
else
    print_error "Application is not running. Check logs with: pm2 logs"
fi

if curl -s -o /dev/null -w "%{http_code}" localhost:3000 | grep -q "200"; then
    print_success "Application responding on port 3000"
else
    print_warning "Application not responding on port 3000"
fi

echo ""
echo "🎉 Deployment Complete!"
echo "======================="
echo ""
echo "Your Demà Band website should now be accessible at:"
if [ "$setup_ssl" = "y" ] || [ "$setup_ssl" = "Y" ]; then
    echo "🌐 https://$domain_name"
    echo "🌐 https://www.$domain_name"
else
    echo "🌐 http://$domain_name"
    echo "🌐 http://www.$domain_name"
fi
echo ""
echo "⚠️  IMPORTANT NEXT STEPS:"
echo "1. Edit your .env file: nano .env"
echo "2. Change the ADMIN_PASSWORD to something secure"
echo "3. Restart the application: pm2 restart dema-website"
echo ""
echo "📊 Useful commands:"
echo "- Check status: pm2 status"
echo "- View logs: pm2 logs dema-website"
echo "- Restart app: pm2 restart dema-website"
echo "- Check Nginx: systemctl status nginx"
echo ""
echo "🎸 Rock on! Your website is live!"

# Show current status
echo ""
echo "Current Status:"
echo "==============="
pm2 status
echo ""
echo "Application logs (last 10 lines):"
pm2 logs dema-website --lines 10
