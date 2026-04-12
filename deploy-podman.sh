#!/bin/bash
# Dema Band Website — Oracle Linux + Podman deploy/update script
# Handles first-run setup and subsequent updates. Safe to re-run.
# Run as the opc user (or any non-root user with sudo).
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────
APP_NAME="dema-web"
REPO_URL="https://github.com/polipolo55/web-dema.git"
WEB_DIR="$HOME/web-dema"
DATA_DIR="$WEB_DIR/data"
BACKUP_DIR="$HOME/backups"
DOMAIN="demabcn.cat"
PORT=3000
MAX_BACKUPS=5

# ── Helpers ───────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()  { echo -e "${BLUE}[.]${NC} $1"; }
ok()    { echo -e "${GREEN}[+]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
die()   { echo -e "${RED}[x]${NC} $1"; exit 1; }
step()  { echo -e "\n${BLUE}── $1 ──${NC}"; }

echo ""
echo "  Dema Band Website — Deploy"
echo "  ==========================="

# ── 1. Prerequisites (only installs what's missing) ──────────────────────
step "Prerequisites"
NEEDED=()
for pkg in podman git nginx certbot python3-certbot-nginx; do
    rpm -q "$pkg" &>/dev/null || NEEDED+=("$pkg")
done
if [ ${#NEEDED[@]} -gt 0 ]; then
    info "Installing: ${NEEDED[*]}"
    sudo dnf install -y "${NEEDED[@]}"
else
    ok "All packages already installed"
fi

# ── 2. Firewall & SELinux (idempotent) ───────────────────────────────────
step "Firewall & SELinux"
systemctl is-active --quiet firewalld || sudo systemctl enable --now firewalld
for svc in ssh http https; do
    sudo firewall-cmd --permanent --add-service="$svc" &>/dev/null || true
done
sudo firewall-cmd --reload &>/dev/null
sudo setsebool -P httpd_can_network_connect 1 &>/dev/null || true
ok "Firewall and SELinux ready"

# ── 3. Stop running container (clean DB state for backup) ────────────────
step "Stopping current deployment"
systemctl --user stop "$APP_NAME" 2>/dev/null || true
if podman ps -a --format "{{.Names}}" | grep -q "^${APP_NAME}$"; then
    podman stop "$APP_NAME" &>/dev/null || true
    podman rm "$APP_NAME" &>/dev/null || true
fi
ok "Old container stopped"

# ── 4. Backup database ──────────────────────────────────────────────────
step "Database backup"
if [ -f "$DATA_DIR/band.db" ]; then
    mkdir -p "$BACKUP_DIR"
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    cp "$DATA_DIR/band.db" "$BACKUP_DIR/band-${TIMESTAMP}.db"
    ok "Backed up to band-${TIMESTAMP}.db"
    # Prune old backups, keep only the last MAX_BACKUPS
    ls -t "$BACKUP_DIR"/band-*.db 2>/dev/null | tail -n +$((MAX_BACKUPS + 1)) | xargs rm -f 2>/dev/null || true
    BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/band-*.db 2>/dev/null | wc -l)
    info "$BACKUP_COUNT backup(s) kept (max $MAX_BACKUPS)"
else
    info "No database yet (first deploy)"
fi

# ── 5. Clone or update code ─────────────────────────────────────────────
step "Source code"
if [ -d "$WEB_DIR/.git" ]; then
    cd "$WEB_DIR"
    # Preserve database files across git reset (band.db was previously
    # tracked and causes merge conflicts — hard reset is the clean fix)
    TMPDIR_DB=$(mktemp -d)
    for f in band.db band.db-shm band.db-wal; do
        [ -f "$DATA_DIR/$f" ] && cp "$DATA_DIR/$f" "$TMPDIR_DB/"
    done
    git fetch origin main
    git reset --hard origin/main
    # Restore database files
    for f in band.db band.db-shm band.db-wal; do
        [ -f "$TMPDIR_DB/$f" ] && mv "$TMPDIR_DB/$f" "$DATA_DIR/"
    done
    rm -rf "$TMPDIR_DB"
    ok "Code updated to $(git rev-parse --short HEAD)"
else
    git clone "$REPO_URL" "$WEB_DIR"
    cd "$WEB_DIR"
    ok "Repository cloned"
fi

# ── 6. Environment file ─────────────────────────────────────────────────
step "Configuration"
if [ ! -f .env ]; then
    [ -f .env.example ] || die ".env.example missing from repository"
    cp .env.example .env
    cat >> .env << 'ENVEOF'
NODE_ENV=production
TRUST_PROXY=1
ENVEOF
    echo "ADMIN_SESSION_SECRET=$(openssl rand -hex 32)" >> .env
    warn "Created .env from template — you MUST set ADMIN_PASSWORD before going live:"
    warn "  nano $WEB_DIR/.env"
    die "Configure .env and re-run this script"
fi
ok ".env exists (not modified)"

# Ensure data subdirectories exist
mkdir -p "$DATA_DIR"/{gallery,tracks}

# ── 7. Build container image ────────────────────────────────────────────
step "Container build"
podman build -t "$APP_NAME:latest" . || die "Build failed"
ok "Image built: $APP_NAME:latest"

# ── 8. Quadlet systemd service (replaces deprecated podman generate systemd) ─
step "Systemd service (Quadlet)"
# Clean up legacy generated service from old deploy script
LEGACY_SVC="$HOME/.config/systemd/user/$APP_NAME.service"
if [ -f "$LEGACY_SVC" ]; then
    systemctl --user disable "$APP_NAME.service" &>/dev/null || true
    rm -f "$LEGACY_SVC"
    info "Removed legacy systemd service"
fi

QUADLET_DIR="$HOME/.config/containers/systemd"
mkdir -p "$QUADLET_DIR"
cat > "$QUADLET_DIR/$APP_NAME.container" << EOF
[Unit]
Description=Dema Band Website
After=local-fs.target

[Container]
Image=localhost/$APP_NAME:latest
PublishPort=127.0.0.1:$PORT:3000
EnvironmentFile=$WEB_DIR/.env
Volume=$DATA_DIR:/app/data:Z

[Service]
Restart=on-failure
RestartSec=5
TimeoutStartSec=30

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
ok "Quadlet configured"

# ── 9. Start container ──────────────────────────────────────────────────
step "Starting app"
systemctl --user start "$APP_NAME" || die "Failed to start — check: journalctl --user -u $APP_NAME"
systemctl --user enable "$APP_NAME" &>/dev/null || true
loginctl enable-linger "$USER" &>/dev/null || true
ok "Container running via systemd"

# ── 10. Nginx reverse proxy ─────────────────────────────────────────────
step "Nginx"
NGINX_CONF="/etc/nginx/conf.d/dema-web.conf"

# Remove legacy config name from old deploy script
sudo rm -f /etc/nginx/conf.d/dema-website.conf

# Only write nginx config if it doesn't exist yet — certbot modifies it
# in-place for SSL, so we must not overwrite it on subsequent deploys.
if [ ! -f "$NGINX_CONF" ]; then
    info "Writing initial nginx config..."
    sudo tee "$NGINX_CONF" > /dev/null << 'NGINXEOF'
server {
    listen 80;
    server_name demabcn.cat www.demabcn.cat;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    client_max_body_size 200M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location ~* \.(jpg|jpeg|png|gif|ico|css|js|svg|mp3|mp4|webm|woff2?)$ {
        proxy_pass http://127.0.0.1:3000;
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
    sudo nginx -t || die "Nginx config has errors"
    ok "Nginx config written"
else
    ok "Nginx config exists (preserved — may contain certbot SSL directives)"
fi

sudo systemctl enable --now nginx &>/dev/null
sudo systemctl reload nginx
ok "Nginx running"

# ── 11. SSL certificate ─────────────────────────────────────────────────
step "SSL"
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
    info "Requesting certificate for $DOMAIN..."
    sudo certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN" \
        --non-interactive --agree-tos --email "contacte@$DOMAIN" \
        || warn "Certbot failed — retry later: sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN"
    # Add auto-renewal cron if not already present
    if ! sudo crontab -l 2>/dev/null | grep -q certbot; then
        (sudo crontab -l 2>/dev/null; echo "0 3 * * * /usr/bin/certbot renew --quiet") | sudo crontab -
        ok "SSL auto-renewal configured"
    fi
else
    ok "SSL certificate exists"
fi

# ── 12. Health check ────────────────────────────────────────────────────
step "Health check"
HEALTHY=false
for i in $(seq 1 15); do
    if curl -sf http://127.0.0.1:$PORT/api/health | grep -q '"ok":true'; then
        HEALTHY=true
        break
    fi
    sleep 2
done

if $HEALTHY; then
    ok "App is healthy"
else
    warn "App not responding after 30s — check: journalctl --user -u $APP_NAME -n 50"
fi

# ── 13. Cleanup ──────────────────────────────────────────────────────────
podman image prune -f &>/dev/null || true

# ── Done ──────────────────────────────────────────────────────────────────
echo ""
echo "  Deploy complete — https://$DOMAIN"
echo ""
echo "  Logs:     journalctl --user -u $APP_NAME -f"
echo "  Status:   systemctl --user status $APP_NAME"
echo "  Health:   curl http://127.0.0.1:$PORT/api/health"
echo "  Backups:  ls ~/backups/"
echo ""
