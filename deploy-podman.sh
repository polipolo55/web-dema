#!/bin/bash

# Configuration
APP_NAME="dema-web"
PORT=3000
DATA_DIR="./data"

echo "🚀 Deploying $APP_NAME with Podman..."

# Ensure we have the code (assuming this script is in the repo root)
if [ ! -f "Containerfile" ]; then
    echo "❌ Error: Containerfile not found. Are you in the project root?"
    exit 1
fi

# Build the image
echo "🔨 Building container image..."
podman build -t $APP_NAME .

if [ $? -ne 0 ]; then
    echo "❌ Build failed!"
    exit 1
fi

# Stop existing container if running
if podman ps -a --format "{{.Names}}" | grep -q "^$APP_NAME$"; then
    echo "🛑 Stopping existing container..."
    podman stop $APP_NAME
    podman rm $APP_NAME
fi

# Create data directory if it doesn't exist
mkdir -p $DATA_DIR

# Prepare env arguments
ENV_ARGS=""
if [ -f ".env" ]; then
    ENV_ARGS="--env-file .env"
else
    echo "⚠️  Warning: .env file not found. Starting container without it."
fi

# Run one-time migration from legacy JSON to DB only when DB is empty
echo "🧬 Running one-time JSON -> DB migration (safe mode)..."
podman run --rm \
    $ENV_ARGS \
    -e DATABASE_PATH=/app/data/band.db \
    -v $(pwd)/data:/app/data:Z \
    $APP_NAME \
    node scripts/migrate-json-to-db.js --source=/app/data/band-info.json --if-empty --backup

if [ $? -ne 0 ]; then
    echo "❌ Migration step failed. Aborting deploy to avoid partial upgrade."
    exit 1
fi

# Run the new container
echo "▶️  Starting new container..."
# mapping data and gallery to host folders for persistence
podman run -d \
    --name $APP_NAME \
    -p $PORT:3000 \
    $ENV_ARGS \
    -v $(pwd)/data:/app/data:Z \
    --restart always \
    $APP_NAME

if [ $? -eq 0 ]; then
    echo "✅ Deployment successful! App running on port $PORT"
    echo "📜 Logs can be viewed with: podman logs -f $APP_NAME"

    # Set up systemd user service so the container auto-starts on boot (Oracle Linux rootless podman)
    echo ""
    echo "🔁 Setting up auto-start on boot..."
    mkdir -p ~/.config/systemd/user
    podman generate systemd --new --name $APP_NAME > ~/.config/systemd/user/$APP_NAME.service
    systemctl --user daemon-reload
    systemctl --user enable $APP_NAME.service
    # Keep the user session alive across reboots (required for rootless podman)
    loginctl enable-linger $USER 2>/dev/null || true
    echo "✅ Auto-start configured (systemd user service: $APP_NAME.service)"
else
    echo "❌ Deployment failed!"
    exit 1
fi
