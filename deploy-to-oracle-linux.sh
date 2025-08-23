#!/bin/bash

# 🎸 Demà Band Website - Oracle Linux Deployment Script
# Optimized for Oracle Linux on Oracle Cloud Infrastructure
# Run this script on your OCI Oracle Linux instance

set -e  # Exit on any error

echo "🎸 Welcome to Demà Band Website Deployment on Oracle Linux! v2"
echo "=========================================================="

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

# Check if running on Oracle Linux
if ! grep -q "Oracle Linux" /etc/os-release; then
    print_warning "This script is optimized for Oracle Linux. Detected: $(cat /etc/os-release | grep PRETTY_NAME)"
    read -p "Continue anyway? (y/n): " continue_anyway
    if [ "$continue_anyway" != "y" ]; then
        exit 1
    fi
fi

print_status "Detected Oracle Linux - perfect for Oracle OCI!"

# Check if running as opc user (Oracle Linux default) or root
if [ "$USER" != "opc" ] && [ "$USER" != "root" ]; then
    print_warning "Running as user: $USER. Oracle Linux typically uses 'opc' user."
fi

# Switch to sudo for installations if not root
if [ "$EUID" -ne 0 ]; then
    print_status "Will use sudo for system operations..."
    SUDO="sudo"
else
    SUDO=""
fi

print_status "Starting Oracle Linux deployment process..."

# Enable Oracle Linux repositories
print_status "Enabling Oracle Linux repositories..."
$SUDO dnf config-manager --enable ol8_codeready_builder ol8_developer_EPEL || true
$SUDO dnf config-manager --enable ol9_codeready_builder ol9_developer_EPEL || true
print_success "Repositories configured"

# Update system (important for OCI instances)
print_status "Updating system packages..."
$SUDO dnf update -y
print_success "System updated"

# Install essential packages for Oracle Linux (including SQLite3 dev tools)
print_status "Installing essential packages..."
$SUDO dnf groupinstall -y "Development Tools"
$SUDO dnf install -y curl wget git gcc-c++ make openssl-devel sqlite-devel python3-devel
print_success "Essential packages installed"

# Install Node.js (using NodeSource repository for Oracle Linux)
print_status "Installing Node.js for Oracle Linux..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | $SUDO bash -
    $SUDO dnf install -y nodejs
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
    $SUDO dnf install -y nginx
    $SUDO systemctl start nginx
    $SUDO systemctl enable nginx
    print_success "Nginx installed and started"
else
    print_success "Nginx already installed"
fi

# Install Certbot for SSL (Oracle Linux specific)
print_status "Installing Certbot for SSL..."
if ! command -v certbot &> /dev/null; then
    $SUDO dnf install -y certbot python3-certbot-nginx
    print_success "Certbot installed"
else
    print_success "Certbot already installed"
fi

# Configure Oracle Linux Firewall (firewalld)
print_status "Configuring Oracle Linux firewall (firewalld)..."
$SUDO systemctl start firewalld
$SUDO systemctl enable firewalld
$SUDO firewall-cmd --permanent --add-service=ssh
$SUDO firewall-cmd --permanent --add-service=http
$SUDO firewall-cmd --permanent --add-service=https
$SUDO firewall-cmd --permanent --add-port=22/tcp
$SUDO firewall-cmd --permanent --add-port=80/tcp
$SUDO firewall-cmd --permanent --add-port=443/tcp
$SUDO firewall-cmd --reload
print_success "Oracle Linux firewall configured"

# Set SELinux to permissive (for web applications)
print_status "Configuring SELinux for web applications..."
$SUDO setsebool -P httpd_can_network_connect 1
$SUDO setsebool -P httpd_can_network_relay 1
print_success "SELinux configured for web applications"

# Create web directory (in opc user home or /var/www)
print_status "Setting up web directory..."
if [ "$USER" = "opc" ]; then
    WEB_DIR="/home/opc/web-dema"
    print_status "Using opc user home directory: $WEB_DIR"
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
if [ "$USER" = "opc" ]; then
    $SUDO chown -R opc:opc "$WEB_DIR"
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
    echo "scp -i /path/to/your/key.pem -r /path/to/web-dema/* opc@$(curl -s ifconfig.me):$WEB_DIR/"
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

# Install dependencies (including native modules like better-sqlite3)
print_status "Installing Node.js dependencies (including database drivers)..."
npm install --omit=dev
print_success "Dependencies installed"

# Create database directory for production
print_status "Setting up database directory..."
# Create the database directory that matches the production path in database.js
$SUDO mkdir -p /app/data
# Set proper ownership - if running as opc user, give opc ownership
if [ "$USER" = "opc" ]; then
    $SUDO chown -R opc:opc /app/data
else
    $SUDO chown -R $USER:$USER /app/data
fi
# Ensure the directory is writable
$SUDO chmod 755 /app/data
print_success "Database directory created at /app/data with proper permissions"

# Setup environment file
print_status "Setting up environment configuration..."
if [ ! -f ".env" ]; then
    if [ -f ".env.example" ]; then
        cp .env.example .env
        # Set production environment
        echo "NODE_ENV=production" >> .env
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
    # Ensure NODE_ENV is set to production
    if ! grep -q "NODE_ENV=production" .env; then
        echo "NODE_ENV=production" >> .env
        print_status "Added NODE_ENV=production to .env"
    fi
fi

# Initialize database
print_status "Initializing database..."
# Backup existing database if it exists
if [ -f "/app/data/band.db" ]; then
    print_warning "Existing database found, creating backup..."
    cp "/app/data/band.db" "/app/data/band.db.backup.$(date +%Y%m%d-%H%M%S)"
fi

# Ensure NODE_ENV is set for this initialization
export NODE_ENV=production

# Run database migration/initialization with better error handling
print_status "Running database initialization..."
if node -e "
const BandDatabase = require('./database');
const db = new BandDatabase();
db.initialize()
  .then(() => {
    console.log('✅ Database initialized successfully');
    console.log('Database path:', db.dbPath);
    process.exit(0);
  })
  .catch(e => {
    console.error('❌ Database initialization failed:', e.message);
    console.error('Database path expected:', db.dbPath);
    process.exit(1);
  })
"; then
    print_success "Database initialized successfully"
else
    print_error "Database initialization failed. Check the error above."
    echo "Troubleshooting steps:"
    echo "1. Check if /app/data directory exists and is writable"
    echo "2. Check NODE_ENV is set to 'production'"
    echo "3. Verify better-sqlite3 compiled correctly"
    exit 1
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

# Create Nginx configuration for Oracle Linux

print_status "Creating Nginx configuration for Oracle Linux..."
$SUDO tee /etc/nginx/conf.d/dema-website.conf > /dev/null << EOF
# Oracle Linux optimized Nginx configuration
server {
    listen 80;
    server_name $domain_name www.$domain_name $PUBLIC_IP;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy "strict-origin-when-cross-origin";
    add_header X-Forwarded-For \$proxy_add_x_forwarded_for;

    # Rate limiting (Oracle Linux specific)
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

# Ensure NODE_ENV is set in the environment
export NODE_ENV=production

# Start with PM2
pm2 start ecosystem.config.json
pm2 save

# Wait a moment for the application to start
sleep 3

# Check if the application started successfully
if pm2 list | grep -q "online"; then
    print_success "Application started with PM2"
else
    print_error "Application failed to start. Checking logs..."
    pm2 logs dema-website --lines 20
    exit 1
fi

# Setup PM2 startup (Oracle Linux specific)
if [ "$USER" = "opc" ]; then
    PM2_STARTUP_CMD=$(pm2 startup systemd -u opc --hp /home/opc 2>/dev/null | grep "sudo env" | head -1)
else
    PM2_STARTUP_CMD=$(pm2 startup systemd 2>/dev/null | grep "sudo env" | head -1)
fi

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
        $SUDO certbot --nginx -d $domain_name -d www.$domain_name --non-interactive --agree-tos --email contacte@$domain_name
        
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

# Check PM2 status
if pm2 list | grep -q "online"; then
    print_success "Application is running with PM2"
else
    print_error "Application is not running. Check logs with: pm2 logs"
fi

# Check HTTP response
if curl -s -o /dev/null -w "%{http_code}" localhost:3000 | grep -q "200"; then
    print_success "Application responding on port 3000"
else
    print_warning "Application not responding on port 3000. Checking logs..."
    pm2 logs dema-website --lines 10
fi

# Check database file exists and is accessible
if [ -f "/app/data/band.db" ]; then
    print_success "Database file exists at /app/data/band.db"
    # Check file size (should be > 0 if properly initialized)
    DB_SIZE=$(stat -f%z "/app/data/band.db" 2>/dev/null || stat -c%s "/app/data/band.db" 2>/dev/null || echo "0")
    if [ "$DB_SIZE" -gt "1024" ]; then
        print_success "Database appears to be properly initialized (${DB_SIZE} bytes)"
    else
        print_warning "Database file is very small (${DB_SIZE} bytes) - may not be initialized"
    fi
else
    print_error "Database file missing at /app/data/band.db"
fi

# Display important information
echo ""
echo "🎉 Oracle Linux Deployment Complete!"
echo "===================================="
echo ""
echo "🖥️  Server Information:"
echo "   Public IP: $PUBLIC_IP"
echo "   OS: Oracle Linux $(cat /etc/oracle-release 2>/dev/null || echo 'Unknown version')"
echo "   Architecture: $(uname -m)"
echo "   User: $USER"
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
echo "5. Check database: ls -la /app/data/ (should show band.db file)"
echo ""
echo "📊 Useful Oracle Linux commands:"
echo "   pm2 status              # Check application status"
echo "   pm2 logs dema-website   # View application logs"
echo "   pm2 restart dema-website # Restart application"
echo "   sudo systemctl status nginx # Check Nginx status"
echo "   sudo firewall-cmd --list-all # Check firewall status"
echo "   sudo dnf update         # Update system packages"
echo "   ls -la /app/data/       # Check database files"
echo ""
echo "🔍 Troubleshooting:"
echo "   - Check OCI Security Lists (port 80, 443 open)"
echo "   - Verify firewalld: sudo firewall-cmd --list-services"
echo "   - Check SELinux: getenforce (should be Enforcing or Permissive)"
echo "   - Check logs: pm2 logs dema-website"
echo "   - Test direct access: curl http://localhost:3000"
echo ""
echo "📊 Database troubleshooting:"
echo "   - Check database file: ls -la /app/data/band.db"
echo "   - Check database permissions: ls -la /app/data/"
echo "   - Run database test: NODE_ENV=production node scripts/test-database.js"
echo "   - Test database manually: NODE_ENV=production node -e \"const BandDatabase = require('./database'); const db = new BandDatabase(); db.initialize().then(() => console.log('DB OK')).catch(console.error)\""
echo "   - Check environment: echo \$NODE_ENV"
echo "   - Check Node.js version: node --version"
echo ""
echo "🎸 Rock on! Your Demà website is ready on Oracle Linux!"

# Show current status
echo ""
echo "Current Status:"
echo "==============="
pm2 status
echo ""
echo "Oracle Linux Version: $(cat /etc/oracle-release 2>/dev/null || echo 'Unknown')"
echo "Public IP: $PUBLIC_IP"
echo "Domain configured: $domain_name"
echo "Database status: $([[ -f "/app/data/band.db" ]] && echo "✅ Present" || echo "❌ Missing")"
echo "Firewall status:"
$SUDO firewall-cmd --list-services
echo ""
echo "Next: Configure DNS in Hostinger to point $domain_name to $PUBLIC_IP"
