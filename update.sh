#!/bin/bash

# 🎸 Demà Band Website - Update Script
# Run this script from the project directory on your server to pull the latest
# code and restart the app with PM2. Your database and uploads are never touched.

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

print_status()  { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_error()   { echo -e "${RED}[ERROR]${NC} $1"; }

echo "🎸 Demà Website — Updating..."
echo "==============================="

# Determine project directory (script location)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
print_status "Working directory: $SCRIPT_DIR"

# Pull latest code
print_status "Pulling latest code from GitHub..."
git pull origin main
print_success "Code updated"

# Install/update dependencies
print_status "Installing dependencies..."
npm install --omit=dev
print_success "Dependencies up to date"

# Restart with PM2
if command -v pm2 &> /dev/null; then
    print_status "Restarting application with PM2..."
    pm2 restart dema-website
    sleep 3

    if pm2 list | grep -q "online"; then
        print_success "Application restarted and running"
    else
        print_error "Application failed to start. Check logs with: pm2 logs dema-website"
        exit 1
    fi

    # Quick health check
    if curl -sf http://localhost:3000/api/health | grep -q '"ok":true'; then
        print_success "Health check passed ✅"
    else
        echo "⚠️  Health check did not return ok. Check logs: pm2 logs dema-website"
    fi

    echo ""
    echo "✅ Update complete!"
    echo ""
    echo "Useful commands:"
    echo "  pm2 status                         # Application status"
    echo "  pm2 logs dema-website              # View logs"
    echo "  curl http://localhost:3000/api/health  # Health check"
else
    print_error "PM2 not found. Restart the app manually."
    echo "  node server.js   (foreground)"
    echo "  Or install PM2:  npm install -g pm2 && pm2 start ecosystem.config.json"
    exit 1
fi
