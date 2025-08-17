# Hostinger Deployment Instructions for Demà Band Website

## Overview
This is a Node.js/Express application that serves a retro-style OS interface for the Demà band website.

## Server Requirements
- Node.js 16+ 
- npm
- At least 512MB RAM
- Support for WebSocket connections (if using real-time features)

## Environment Variables
Copy `.env.example` to `.env` and set:
- `ADMIN_PASSWORD`: Secure password for admin access
- `PORT`: Will be set by Hostinger (usually 3000 or 8000)

## Deployment Steps for Hostinger VPS/Cloud

### Option 1: VPS Hosting (Recommended)
1. Purchase Hostinger VPS plan
2. Connect via SSH
3. Upload files via FTP/SFTP or git clone
4. Run: `npm install --production`
5. Set up environment variables
6. Configure process manager (PM2)
7. Set up nginx reverse proxy

### Option 2: Shared Hosting (Limited)
- Only works if Hostinger supports Node.js on shared plans
- Upload files via File Manager
- May have limitations on port access and process management

## File Structure for Upload
```
web-dema/
├── server.js          # Main server file
├── package.json       # Dependencies
├── .env              # Environment config (create from .env.example)
├── index.html        # Main page
├── admin.html        # Admin interface
├── assets/           # Images, icons, media
├── data/             # JSON data files
└── all other files...
```

## Security Notes
- Change default admin password
- Enable HTTPS
- Keep dependencies updated
- Consider rate limiting for production
