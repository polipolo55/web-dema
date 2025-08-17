#!/bin/bash

# 🎸 Demà Band Website - Minimal Oracle Linux Deployment
# This script avoids problematic full system updates

set -e

echo "🎸 Minimal Demà Band Website Deployment on Oracle Linux!"
echo "======================================================"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

SUDO="sudo"

print_status "Skipping full system update to avoid connection issues..."
print_warning "You can update the system later with: sudo dnf update -y"

# Install only essential packages (no full update)
print_status "Installing essential packages..."
$SUDO dnf install -y curl wget git gcc-c++ make openssl-devel nginx certbot python3-certbot-nginx
print_success "Essential packages installed"

# Install Node.js
print_status "Installing Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_18.x | $SUDO bash -
    $SUDO dnf install -y nodejs
    print_success "Node.js installed: $(node --version)"
else
    print_success "Node.js already installed: $(node --version)"
fi

# Install PM2
print_status "Installing PM2..."
if ! command -v pm2 &> /dev/null; then
    $SUDO npm install -g pm2
    print_success "PM2 installed"
else
    print_success "PM2 already installed"
fi

# Start and enable Nginx
print_status "Starting Nginx..."
$SUDO systemctl start nginx
$SUDO systemctl enable nginx
print_success "Nginx started"

# Configure firewall
print_status "Configuring firewall..."
$SUDO systemctl start firewalld
$SUDO systemctl enable firewalld
$SUDO firewall-cmd --permanent --add-service=ssh
$SUDO firewall-cmd --permanent --add-service=http
$SUDO firewall-cmd --permanent --add-service=https
$SUDO firewall-cmd --reload
print_success "Firewall configured"

# Configure SELinux
print_status "Configuring SELinux..."
$SUDO setsebool -P httpd_can_network_connect 1
$SUDO setsebool -P httpd_can_network_relay 1
print_success "SELinux configured"

# Set up website directory
print_status "Setting up website..."
WEB_DIR="/home/opc/web-dema"
mkdir -p "$WEB_DIR"
cd "$WEB_DIR"

# Clone repository
print_status "Cloning website repository..."
if [ -d ".git" ]; then
    print_warning "Repository already exists, pulling updates..."
    git pull origin main
else
    git clone https://github.com/polipolo55/web-dema.git .
fi
print_success "Repository ready"

# Install dependencies
print_status "Installing Node.js dependencies..."
npm install --production
print_success "Dependencies installed"

# Setup environment
print_status "Setting up environment..."
if [ ! -f ".env" ]; then
    cp .env.example .env
    print_warning "Created .env file - PLEASE EDIT IT!"
    echo "Run: nano .env and change ADMIN_PASSWORD"
fi

# Create logs directory
mkdir -p logs

# Get public IP
PUBLIC_IP=$(curl -s ifconfig.me)
print_status "Public IP: $PUBLIC_IP"

# Ask for domain
echo ""
read -p "Enter your domain name (e.g., demaband.com): " domain_name

# Create Nginx config
print_status "Creating Nginx configuration..."
$SUDO tee /etc/nginx/conf.d/dema-website.conf > /dev/null << EOF
server {
    listen 80;
    server_name $domain_name www.$domain_name $PUBLIC_IP;

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
}
EOF

# Test and reload Nginx
if $SUDO nginx -t; then
    $SUDO systemctl reload nginx
    print_success "Nginx configured"
else
    print_error "Nginx configuration error"
    exit 1
fi

# Start application
print_status "Starting application..."
pm2 start ecosystem.config.json
pm2 save
pm2 startup systemd -u opc --hp /home/opc
print_success "Application started"

echo ""
echo "🎉 Minimal Deployment Complete!"
echo "==============================="
echo ""
echo "🌐 Your website should be accessible at:"
echo "   http://$domain_name"
echo "   http://$PUBLIC_IP"
echo ""
echo "📋 Next steps:"
echo "1. Configure DNS in Hostinger: A record @ → $PUBLIC_IP"
echo "2. Edit .env file: nano .env (change ADMIN_PASSWORD!)"
echo "3. Restart app: pm2 restart dema-website"
echo "4. Setup SSL: sudo certbot --nginx -d $domain_name"
echo ""
echo "🎸 Your website is now running!"
