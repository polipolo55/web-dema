// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const path = require('path');
const BandDatabase = require('./src/database');
const { rateLimit } = require('./src/middleware');

const app = express();
const PORT = process.env.PORT || 3001;
const STATIC_ROOT = path.join(__dirname, 'public');

// Initialize database
let db;
(async () => {
    db = new BandDatabase();
    await db.initialize();

    // Mount routes that require DB
    app.use('/api', require('./src/routes/api')(db));
    // Mount admin routes (prefixed with /admin in logic or explicit here?)
    // In original code: /admin/delete-photo etc.
    // So we mount at /admin
    app.use('/admin', require('./src/routes/admin')(db));
})();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
    console.warn('⚠️  WARNING: ADMIN_PASSWORD environment variable not set!');
}

// Middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.static(STATIC_ROOT));
app.use(rateLimit);

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// Admin Interface Route
app.get('/admin', (req, res) => {
    const password = req.query.password;
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).send(`
            <!DOCTYPE html>
            <html>
            <head><title>Access Denied</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h2>Access Denied</h2>
                <p>Contact the band for admin access</p>
                <a href="/">Back to website</a>
            </body>
            </html>
        `);
    }
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

app.listen(PORT, () => {
    console.log(`🎸 Demà website running on http://localhost:${PORT}`);
    console.log(`🔧 Admin panel: http://localhost:${PORT}/admin?password=${ADMIN_PASSWORD}`);
});
