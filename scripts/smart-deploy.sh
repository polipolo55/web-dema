#!/bin/bash

# Smart deployment script for Demà website
# This script handles database preservation during deployments

set -e  # Exit on any error

# Configuration
DEPLOY_DIR="/var/www/dema"
BACKUP_DIR="/var/backups/dema"
DB_FILE="data/band.db"
REPO_URL="https://github.com/polipolo55/web-dema.git"

echo "🚀 Starting smart deployment for Demà website..."

# Create directories if they don't exist
mkdir -p "$DEPLOY_DIR"
mkdir -p "$BACKUP_DIR"

# Step 1: Backup existing database if it exists
if [ -f "$DEPLOY_DIR/$DB_FILE" ]; then
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BACKUP_PATH="$BACKUP_DIR/band_backup_$TIMESTAMP.db"
    
    echo "📦 Backing up existing database to $BACKUP_PATH"
    cp "$DEPLOY_DIR/$DB_FILE" "$BACKUP_PATH"
    
    # Keep only last 10 backups
    cd "$BACKUP_DIR"
    ls -t band_backup_*.db | tail -n +11 | xargs -r rm
else
    echo "📝 No existing database found - fresh deployment"
fi

# Step 2: Clone/update repository to temporary location
TEMP_DIR="/tmp/dema_deploy_$$"
echo "📥 Downloading latest code to $TEMP_DIR"

if [ -d "$TEMP_DIR" ]; then
    rm -rf "$TEMP_DIR"
fi

git clone "$REPO_URL" "$TEMP_DIR"
cd "$TEMP_DIR"

# Step 3: Install dependencies
echo "📦 Installing dependencies..."
npm ci --production

# Step 4: Restore database if it exists
if [ -f "$DEPLOY_DIR/$DB_FILE" ]; then
    echo "🔄 Preserving existing database"
    mkdir -p "$(dirname "$TEMP_DIR/$DB_FILE")"
    cp "$DEPLOY_DIR/$DB_FILE" "$TEMP_DIR/$DB_FILE"
else
    echo "🆕 Initializing new database from JSON data"
fi

# Step 5: Copy environment file if it exists
if [ -f "$DEPLOY_DIR/.env" ]; then
    echo "🔐 Preserving environment configuration"
    cp "$DEPLOY_DIR/.env" "$TEMP_DIR/.env"
fi

# Step 5.5: Detect the appropriate web server user
if id "www-data" &>/dev/null; then
    WEB_USER="www-data"
elif id "apache" &>/dev/null; then
    WEB_USER="apache"
elif id "nginx" &>/dev/null; then
    WEB_USER="nginx"
else
    WEB_USER="root"
    echo "⚠️  Warning: No standard web user found, using root"
fi
echo "🔐 Detected web user: $WEB_USER"

# Step 6: Setup systemd service
echo "🔧 Setting up systemd service"
if [ -f "$TEMP_DIR/dema-web.service" ]; then
    # Update service file with detected web user
    sed -i "s/User=apache/User=$WEB_USER/" "$TEMP_DIR/dema-web.service"
    sudo cp "$TEMP_DIR/dema-web.service" /etc/systemd/system/
    sudo systemctl daemon-reload
    echo "✅ Service file installed"
fi

# Stop the existing service if running
if systemctl is-active --quiet dema-web; then
    echo "⏹️ Stopping existing service"
    sudo systemctl stop dema-web
fi

# Step 7: Replace deployment directory
echo "🔄 Updating deployment files"
if [ -d "$DEPLOY_DIR.old" ]; then
    rm -rf "$DEPLOY_DIR.old"
fi

if [ -d "$DEPLOY_DIR" ]; then
    mv "$DEPLOY_DIR" "$DEPLOY_DIR.old"
fi

mv "$TEMP_DIR" "$DEPLOY_DIR"

# Step 8: Set proper permissions
echo "🔐 Setting permissions for user: $WEB_USER"
sudo chown -R "$WEB_USER:$WEB_USER" "$DEPLOY_DIR"
sudo chmod -R 755 "$DEPLOY_DIR"
sudo chmod 664 "$DEPLOY_DIR/$DB_FILE" 2>/dev/null || true

# Step 9: Start the service
echo "▶️ Starting service"
sudo systemctl start dema-web
sudo systemctl enable dema-web

# Step 10: Verify deployment
sleep 3
if systemctl is-active --quiet dema-web; then
    echo "✅ Deployment successful!"
    echo "🌐 Website should be available shortly"
    
    # Cleanup old deployment
    rm -rf "$DEPLOY_DIR.old"
else
    echo "❌ Service failed to start, rolling back..."
    sudo systemctl stop dema-web || true
    
    if [ -d "$DEPLOY_DIR.old" ]; then
        rm -rf "$DEPLOY_DIR"
        mv "$DEPLOY_DIR.old" "$DEPLOY_DIR"
        sudo systemctl start dema-web
        echo "🔙 Rolled back to previous version"
    fi
    exit 1
fi

# Step 11: Show status
echo ""
echo "📊 Deployment Status:"
echo "   Service: $(systemctl is-active dema-web)"
echo "   Database: $([[ -f "$DEPLOY_DIR/$DB_FILE" ]] && echo "✅ Present" || echo "❌ Missing")"
echo "   Latest backup: $(ls -t "$BACKUP_DIR"/band_backup_*.db 2>/dev/null | head -n1 || echo "None")"
echo ""
echo "🎉 Demà website deployment complete!"
