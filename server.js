const express = require('express');
const path = require('path');
const config = require('./src/config');
const BandDatabase = require('./src/database');
const { rateLimit } = require('./src/middleware');

const app = express();
app.set('trust proxy', config.server.trustProxy);

const PORT = config.server.port;
const STATIC_ROOT = path.join(__dirname, config.server.staticRoot);

// Initialize database
let db;

const ADMIN_PASSWORD = config.auth.adminPassword;
if (!ADMIN_PASSWORD) {
    console.warn('⚠️  WARNING: ADMIN_PASSWORD environment variable not set. Admin write actions will be blocked.');
}

// Middleware
app.use(express.json({ limit: config.server.jsonBodyLimit }));
app.use(express.static(STATIC_ROOT));
app.use(rateLimit);

// Security headers
app.use((req, res, next) => {
    const cspDirectives = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "media-src 'self' blob:",
        "connect-src 'self'",
        "font-src 'self' data:",
        "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'"
    ].join('; ');

    res.setHeader('Content-Security-Policy', cspDirectives);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// Admin Interface Route
app.get('/admin', (req, res) => {
    res.sendFile(path.join(STATIC_ROOT, 'admin.html'));
});

// Graceful shutdown
const shutdown = () => {
    console.log('Shutting down server...');
    if (db) db.close();
    process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

async function startServer() {
    try {
        db = new BandDatabase();
        await db.initialize();

        // Mount routes that require DB
        app.use('/api', require('./src/routes/api')(db));
        app.use('/admin', require('./src/routes/admin')(db));

        app.listen(PORT, () => {
            console.log(`🎸 Demà website running on http://localhost:${PORT}`);
            console.log(`🔧 Admin panel: http://localhost:${PORT}/admin`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
