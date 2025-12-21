#!/bin/bash

# Configuration
APP_NAME="dema-web"
PORT=3000
DATA_DIR="./data"
GALLERY_DIR="./public/assets/gallery"

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

# Create data directories if they don't exist
mkdir -p $DATA_DIR
mkdir -p $GALLERY_DIR

# Prepare env arguments
ENV_ARGS=""
if [ -f ".env" ]; then
    ENV_ARGS="--env-file .env"
else
    echo "⚠️  Warning: .env file not found. Starting container without it."
fi

# Run the new container
echo "▶️  Starting new container..."
# mapping data and gallery to host folders for persistence
podman run -d \
    --name $APP_NAME \
    -p $PORT:3000 \
    $ENV_ARGS \
    -v $(pwd)/data:/app/data:Z \
    -v $(pwd)/public/assets/gallery:/app/public/assets/gallery:Z \
    --restart unless-stopped \
    $APP_NAME

if [ $? -eq 0 ]; then
    echo "✅ Deployment successful! App running on port $PORT"
    echo "📜 Logs can be viewed with: podman logs -f $APP_NAME"
else
    echo "❌ Deployment failed!"
    exit 1
fi
