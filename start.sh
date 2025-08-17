#!/bin/bash

# Production startup script for Hostinger
# This script ensures the environment is properly set up

echo "🚀 Starting Demà Band Website..."

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  Warning: .env file not found, copying from .env.example"
    cp .env.example .env
    echo "📝 Please edit .env with your production values!"
fi

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install --production
fi

# Start the application
echo "🎸 Starting server..."
node server.js
