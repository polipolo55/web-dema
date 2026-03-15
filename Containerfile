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

# Single volume for DB and uploads (gallery, tracks under /app/data)
VOLUME ["/app/data"]

# Start command
CMD ["node", "server.js"]
