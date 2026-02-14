const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const config = require('./config');

const adminSessions = new Map();

function parseCookies(req) {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return {};

    return cookieHeader
        .split(';')
        .map((part) => part.trim())
        .filter(Boolean)
        .reduce((acc, part) => {
            const eqIndex = part.indexOf('=');
            if (eqIndex <= 0) return acc;
            const key = part.slice(0, eqIndex).trim();
            const value = decodeURIComponent(part.slice(eqIndex + 1).trim());
            if (key) acc[key] = value;
            return acc;
        }, {});
}

function getSessionCookieName() {
    return config.auth.sessionCookieName;
}

function cleanupExpiredSessions() {
    const now = Date.now();
    for (const [token, expiresAt] of adminSessions.entries()) {
        if (!expiresAt || expiresAt <= now) {
            adminSessions.delete(token);
        }
    }
}

function getValidSessionTokenFromRequest(req) {
    cleanupExpiredSessions();
    const cookies = parseCookies(req);
    const token = cookies[getSessionCookieName()];
    if (!token) return null;

    const expiresAt = adminSessions.get(token);
    if (!expiresAt || expiresAt <= Date.now()) {
        adminSessions.delete(token);
        return null;
    }

    return token;
}

function isAuthenticated(req) {
    return Boolean(getValidSessionTokenFromRequest(req));
}

function buildCookieHeader(token, maxAgeSeconds) {
    const attributes = [
        `${getSessionCookieName()}=${encodeURIComponent(token)}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Strict',
        `Max-Age=${maxAgeSeconds}`
    ];

    if (config.env.isProduction) {
        attributes.push('Secure');
    }

    return attributes.join('; ');
}

function setAdminSessionCookie(res, token) {
    const maxAgeSeconds = Math.max(1, Math.floor(config.auth.sessionTtlMs / 1000));
    res.setHeader('Set-Cookie', buildCookieHeader(token, maxAgeSeconds));
}

function clearAdminSessionCookie(res) {
    res.setHeader('Set-Cookie', buildCookieHeader('', 0));
}

function createSessionToken() {
    return crypto.randomBytes(48).toString('base64url');
}

function createAdminSession() {
    cleanupExpiredSessions();
    const token = createSessionToken();
    const expiresAt = Date.now() + config.auth.sessionTtlMs;
    adminSessions.set(token, expiresAt);
    return token;
}

function destroyAdminSession(req) {
    const token = getValidSessionTokenFromRequest(req);
    if (token) {
        adminSessions.delete(token);
    }
}

// Session-based authentication middleware
const requireAuth = (req, res, next) => {
    const ADMIN_PASSWORD = config.auth.adminPassword;
    if (!ADMIN_PASSWORD) {
        return res.status(500).json({
            error: 'Server configuration error: Admin password not configured'
        });
    }

    if (isAuthenticated(req)) {
        return next();
    }

    clearAdminSessionCookie(res);
    return res.status(401).json({ error: 'Unauthorized' });
};

// Rate limiting middleware
const limiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    message: { error: 'Too many requests' }
});

const sanitizeString = (str, maxLength = 200) => {
    if (typeof str !== 'string') return '';
    return str.replace(/<[^>]*>?/gm, '').substring(0, maxLength);
};

const validateTourData = (data) => {
    const required = ['date', 'city', 'venue'];

    // Check for required fields
    for (const field of required) {
        if (!data[field] || typeof data[field] !== 'string' || data[field].trim() === '') {
            return `Field '${field}' is required and must be a non-empty string`;
        }
    }

    // Check field length limits
    const maxLengths = { city: 100, venue: 200, date: 50 };
    for (const [field, maxLength] of Object.entries(maxLengths)) {
        if (data[field] && data[field].length > maxLength) {
            return `Field '${field}' must be less than ${maxLength} characters`;
        }
    }

    return null;
};

module.exports = {
    requireAuth,
    isAuthenticated,
    createAdminSession,
    destroyAdminSession,
    setAdminSessionCookie,
    clearAdminSessionCookie,
    rateLimit: limiter,
    sanitizeString,
    validateTourData
};
