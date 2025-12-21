FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application source
COPY . .

# Expose port
EXPOSE 3000

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Create volume mount point for persistent data
VOLUME ["/app/data", "/app/public/assets/gallery"]

# Start command
CMD ["node", "server.js"]
