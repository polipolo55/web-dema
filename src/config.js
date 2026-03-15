require('dotenv').config();

function parseInteger(value, fallback) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function parseTrustProxy(value) {
    if (value === undefined || value === null || value === '') {
        return false;
    }

    if (value === 'true') return true;
    if (value === 'false') return false;

    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
        return parsed;
    }

    return value;
}

function inferDefaultDatabasePath(nodeEnv) {
    return nodeEnv === 'production' ? '/app/data/band.db' : './data/band.db';
}

function inferDefaultGalleryPath(nodeEnv) {
    return nodeEnv === 'production' ? '/app/data/gallery' : './public/assets/gallery';
}

function inferDefaultTracksPath(nodeEnv) {
    return nodeEnv === 'production' ? '/app/data/tracks' : './public/assets/audio/tracks';
}

function buildConfig() {
    const nodeEnv = process.env.NODE_ENV || 'development';

    const config = {
        env: {
            nodeEnv,
            isProduction: nodeEnv === 'production'
        },
        server: {
            port: parseInteger(process.env.PORT, 3001),
            staticRoot: 'public',
            jsonBodyLimit: process.env.JSON_BODY_LIMIT || '1mb',
            trustProxy: parseTrustProxy(process.env.TRUST_PROXY)
        },
        auth: {
            adminPassword: process.env.ADMIN_PASSWORD || '',
            sessionCookieName: process.env.ADMIN_SESSION_COOKIE_NAME || 'dema_admin_session',
            sessionTtlMs: parseInteger(process.env.ADMIN_SESSION_TTL_MS, 8 * 60 * 60 * 1000),
            sessionSecret: process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || 'dema-session-secret'
        },
        database: {
            path: process.env.DATABASE_PATH || inferDefaultDatabasePath(nodeEnv)
        },
        uploads: {
            galleryPath: process.env.GALLERY_PATH || inferDefaultGalleryPath(nodeEnv),
            tracksPath: process.env.TRACKS_PATH || inferDefaultTracksPath(nodeEnv)
        },
        rateLimit: {
            windowMs: parseInteger(process.env.RATE_LIMIT_WINDOW_MS, 60 * 1000),
            max: parseInteger(process.env.RATE_LIMIT_MAX, 100)
        }
    };

    if (config.env.isProduction && !config.auth.adminPassword) {
        throw new Error('ADMIN_PASSWORD must be set in production.');
    }

    return config;
}

module.exports = buildConfig();
