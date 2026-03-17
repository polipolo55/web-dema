#!/bin/bash
# 🎸 Demà Band Website — Complete Oracle Linux + Podman deploy/update script
# Works on a fresh VM and is safe to re-run for updates.
# Run as the opc user (or any non-root user with sudo).

set -e

# ── Configuration ────────────────────────────────────────────────────────────
APP_NAME="dema-web"
REPO_URL="https://github.com/polipolo55/web-dema.git"
WEB_DIR="$HOME/web-dema"
DATA_DIR="$WEB_DIR/data"
PORT=3000
SUDO="sudo"

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()      { echo -e "${GREEN}[OK]${NC} $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
die()     { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

echo "🎸 Demà Band Website — Oracle Linux + Podman Deploy"
echo "===================================================="

# ── 1. Install prerequisites ─────────────────────────────────────────────────
info "Installing prerequisites (podman, git, nginx, certbot)..."
$SUDO dnf install -y podman git nginx certbot python3-certbot-nginx
ok "Prerequisites installed"

# ── 2. Firewall ──────────────────────────────────────────────────────────────
info "Configuring firewall..."
$SUDO systemctl enable --now firewalld
$SUDO firewall-cmd --permanent --add-service=ssh
$SUDO firewall-cmd --permanent --add-service=http
$SUDO firewall-cmd --permanent --add-service=https
$SUDO firewall-cmd --reload
ok "Firewall configured (ssh, http, https)"

# ── 3. SELinux — allow nginx to proxy to localhost ───────────────────────────
info "Configuring SELinux for nginx reverse proxy..."
$SUDO setsebool -P httpd_can_network_connect 1
ok "SELinux configured"

# ── 4. Clone or update repository ────────────────────────────────────────────
if [ -d "$WEB_DIR/.git" ]; then
    info "Repository exists — pulling latest code..."
    git -C "$WEB_DIR" pull origin main
    ok "Code updated"
else
    info "Cloning repository to $WEB_DIR..."
    git clone "$REPO_URL" "$WEB_DIR"
    ok "Repository cloned"
fi

cd "$WEB_DIR"

# ── 5. Environment file ──────────────────────────────────────────────────────
if [ ! -f ".env" ]; then
    warn ".env file not found — creating from .env.example"
    [ -f ".env.example" ] || die ".env.example missing from repository"
    cp .env.example .env
    # Enable production settings required behind nginx
    sed -i 's/^# NODE_ENV=.*/NODE_ENV=production/' .env
    sed -i 's/^# TRUST_PROXY=.*/TRUST_PROXY=1/' .env
    # If the lines were fully commented out (not just the value), append them
    grep -q "^NODE_ENV=" .env  || echo "NODE_ENV=production" >> .env
    grep -q "^TRUST_PROXY=" .env || echo "TRUST_PROXY=1" >> .env
    echo ""
    warn "⚠️  IMPORTANT: Set a secure ADMIN_PASSWORD in .env before the site goes live!"
    warn "    Edit now:  nano $WEB_DIR/.env"
    echo ""
    read -p "Press Enter to continue once you've set the password (or Ctrl-C to abort)..." _
else
    ok ".env file exists"
    # Ensure TRUST_PROXY is set (needed when behind nginx)
    if ! grep -q "^TRUST_PROXY=" .env; then
        echo "TRUST_PROXY=1" >> .env
        info "Added TRUST_PROXY=1 to .env"
    fi
    if ! grep -q "^NODE_ENV=production" .env; then
        echo "NODE_ENV=production" >> .env
        info "Added NODE_ENV=production to .env"
    fi
fi

# ── 6. Create persistent data directory ─────────────────────────────────────
mkdir -p "$DATA_DIR"
ok "Data directory ready: $DATA_DIR"

# ── 7. Build container image ─────────────────────────────────────────────────
info "Building container image..."
podman build -t $APP_NAME . || die "Container build failed"
ok "Image built"

# ── 8. Stop and remove old container ─────────────────────────────────────────
if podman ps -a --format "{{.Names}}" | grep -q "^${APP_NAME}$"; then
    info "Stopping existing container..."
    podman stop $APP_NAME
    podman rm $APP_NAME
fi

# ── 9. Run database migration (safe, only when DB is empty) ──────────────────
info "Running JSON → DB migration (safe/idempotent)..."
podman run --rm \
    --env-file .env \
    -e DATABASE_PATH=/app/data/band.db \
    -v "$DATA_DIR":/app/data:Z \
    $APP_NAME \
    node scripts/migrate-json-to-db.js --source=/app/data/band-info.json --if-empty --backup \
    || die "Migration failed — aborting to protect data"
ok "Migration done"

# ── 10. Start container ───────────────────────────────────────────────────────
info "Starting container..."
podman run -d \
    --name $APP_NAME \
    -p 127.0.0.1:$PORT:3000 \
    --env-file .env \
    -v "$DATA_DIR":/app/data:Z \
    --restart always \
    $APP_NAME \
    || die "Container failed to start"
ok "Container running on 127.0.0.1:$PORT"

# ── 11. Systemd user service (auto-start on boot) ────────────────────────────
info "Setting up systemd auto-start..."
mkdir -p ~/.config/systemd/user
podman generate systemd --new --name $APP_NAME > ~/.config/systemd/user/$APP_NAME.service
systemctl --user daemon-reload
systemctl --user enable $APP_NAME.service
loginctl enable-linger "$USER" 2>/dev/null || true
ok "Auto-start enabled (systemd user service)"

# ── 12. Nginx reverse proxy ───────────────────────────────────────────────────
PUBLIC_IP=$(curl -s --max-time 5 ifconfig.me 2>/dev/null || echo "unknown")
info "Detected public IP: $PUBLIC_IP"

echo ""
read -p "Enter your domain name (e.g. demaband.com), or leave blank to use IP only: " DOMAIN

info "Writing nginx config..."
# Remove legacy config left by old PM2 deploy scripts to avoid conflicts
$SUDO rm -f /etc/nginx/conf.d/dema-website.conf
$SUDO tee /etc/nginx/conf.d/dema-web.conf > /dev/null << NGINXEOF
server {
    listen 80;
    server_name ${DOMAIN:-$PUBLIC_IP} ${DOMAIN:+www.$DOMAIN};

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN";
    add_header X-Content-Type-Options "nosniff";
    add_header X-XSS-Protection "1; mode=block";
    add_header Referrer-Policy "strict-origin-when-cross-origin";

    client_max_body_size 200M;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Static assets — long cache
    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|mp3|mp4|webm|woff2?)$ {
        proxy_pass http://127.0.0.1:$PORT;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css application/json application/javascript text/xml image/svg+xml;
}
NGINXEOF

$SUDO nginx -t || die "Nginx config has errors"
$SUDO systemctl enable --now nginx
$SUDO systemctl reload nginx
ok "Nginx configured and running"

# ── 13. SSL certificate (optional) ───────────────────────────────────────────
if [ -n "$DOMAIN" ]; then
    echo ""
    read -p "Set up HTTPS with Let's Encrypt now? DNS must already point to $PUBLIC_IP. (y/n): " SSL_NOW
    if [ "$SSL_NOW" = "y" ] || [ "$SSL_NOW" = "Y" ]; then
        $SUDO certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" \
            --non-interactive --agree-tos --email "contacte@$DOMAIN" \
            || warn "Certbot failed — you can retry later: sudo certbot --nginx -d $DOMAIN"
        # Auto-renew via cron
        ($SUDO crontab -l 2>/dev/null; echo "0 3 * * * /usr/bin/certbot renew --quiet") | $SUDO crontab -
        ok "SSL certificate configured with auto-renewal"
    else
        warn "SSL skipped. Run later: sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
    fi
fi

# ── 14. Health check ──────────────────────────────────────────────────────────
info "Waiting for app to be ready..."
sleep 4
if curl -sf http://127.0.0.1:$PORT/api/health | grep -q '"ok":true'; then
    ok "App health check passed ✅"
else
    warn "App not responding yet — check logs: podman logs $APP_NAME"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "🎉 Deployment complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
[ -n "$DOMAIN" ] && echo "   🌐 https://$DOMAIN  (once DNS + SSL are set)"
echo "   🌐 http://$PUBLIC_IP"
echo ""
echo "📋 Useful commands:"
echo "   podman logs -f $APP_NAME       # live app logs"
echo "   podman ps                       # container status"
echo "   sudo systemctl status nginx     # nginx status"
echo "   curl http://127.0.0.1:$PORT/api/health  # health check"
echo ""
echo "🔄 To update the site later, just run this script again."

