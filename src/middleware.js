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

const loginRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts. Try again in 15 minutes.' }
});

const sanitizeString = (str, maxLength = 200) => {
    if (typeof str !== 'string') return '';
    return str.replace(/<[^>]*>?/gm, '').substring(0, maxLength);
};

const validateTourData = (data) => {
    const required = ['date', 'city', 'venue'];
    for (const field of required) {
        if (!data[field] || typeof data[field] !== 'string' || data[field].trim() === '') {
            return `El camp '${field}' és obligatori`;
        }
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) {
        return "La data ha de tenir el format AAAA-MM-DD";
    }
    const maxLengths = { city: 100, venue: 200 };
    for (const [field, maxLength] of Object.entries(maxLengths)) {
        if (data[field] && data[field].length > maxLength) {
            return `El camp '${field}' ha de tenir menys de ${maxLength} caràcters`;
        }
    }
    return null;
};

function errorMiddleware(err, req, res, next) {
    console.error('Request error:', err);
    const status = err.status || err.statusCode || 500;
    const message = (config.env.isProduction && status >= 500)
        ? 'Internal server error'
        : (err.message || 'Internal server error');
    if (res.headersSent) return next(err);
    res.status(status).json({ error: message });
}

module.exports = {
    cookieSessionMiddleware,
    requireAuth,
    isAuthenticated,
    rateLimit: rateLimitMiddleware,
    loginRateLimit,
    sanitizeString,
    validateTourData,
    errorMiddleware
};
