const rateLimit = require('express-rate-limit');
const cookieSession = require('cookie-session');
const config = require('./config');

// Persistent admin session via signed cookie (survives server restart)
const cookieSessionMiddleware = cookieSession({
    name: config.auth.sessionCookieName,
    secret: config.auth.sessionSecret,
    maxAge: config.auth.sessionTtlMs,
    sameSite: 'strict',
    httpOnly: true,
    secure: config.env.isProduction
});

function isAuthenticated(req) {
    return Boolean(req.session && req.session.auth === true);
}

const requireAuth = (req, res, next) => {
    if (!config.auth.adminPassword) {
        return res.status(500).json({
            error: 'Server configuration error: Admin password not configured'
        });
    }
    if (isAuthenticated(req)) {
        return next();
    }
    req.session = null;
    return res.status(401).json({ error: 'Unauthorized' });
};

const rateLimitMiddleware = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests' }
});

const sanitizeString = (str, maxLength = 200) => {
    if (typeof str !== 'string') return '';
    return str.replace(/<[^>]*>?/gm, '').substring(0, maxLength);
};

const validateTourData = (data) => {
    const required = ['date', 'city', 'venue'];
    for (const field of required) {
        if (!data[field] || typeof data[field] !== 'string' || data[field].trim() === '') {
            return `Field '${field}' is required and must be a non-empty string`;
        }
    }
    const maxLengths = { city: 100, venue: 200, date: 50 };
    for (const [field, maxLength] of Object.entries(maxLengths)) {
        if (data[field] && data[field].length > maxLength) {
            return `Field '${field}' must be less than ${maxLength} characters`;
        }
    }
    return null;
};

function errorMiddleware(err, req, res, next) {
    console.error('Request error:', err);
    const status = err.status || err.statusCode || 500;
    const message = err.message || 'Internal server error';
    if (res.headersSent) return next(err);
    res.status(status).json({ error: message });
}

module.exports = {
    cookieSessionMiddleware,
    requireAuth,
    isAuthenticated,
    rateLimit: rateLimitMiddleware,
    sanitizeString,
    validateTourData,
    errorMiddleware
};
