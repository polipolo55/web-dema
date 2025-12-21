const rateLimit = require('express-rate-limit');

// Simple authentication middleware
const requireAuth = (req, res, next) => {
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
    if (!ADMIN_PASSWORD) {
        return res.status(500).json({
            error: 'Server configuration error: Admin password not configured'
        });
    }

    // Check Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    if (authHeader && (authHeader === `Bearer ${ADMIN_PASSWORD}` || authHeader === ADMIN_PASSWORD)) {
        return next();
    }

    // Check query parameter (legacy support for simple access)
    if (req.query.password === ADMIN_PASSWORD) {
        return next();
    }

    // Check body (sometimes used in forms)
    if (req.body && req.body.password === ADMIN_PASSWORD) {
        return next();
    }

    return res.status(401).json({ error: 'Unauthorized' });
};

// Rate limiting middleware
const limiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // Limit each IP to 100 requests per windowMs
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
    rateLimit: limiter,
    sanitizeString,
    validateTourData
};
