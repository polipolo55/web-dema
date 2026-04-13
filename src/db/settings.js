function getDefaultWindowConfig() {
    return {
        startupWindows: ['about', 'tour', 'video', 'testelis'],
        windowLayouts: {}
    };
}

const ALLOWED_WINDOW_IDS = new Set([
    'about', 'music', 'player', 'tour', 'contact', 'gallery', 'users', 'countdown',
    'recycle', 'video', 'testelis', 'stats'
]);

/**
 * @param {unknown} input
 */
function normalizeWindowConfig(input) {
    const allowedWindowIds = ALLOWED_WINDOW_IDS;

    const startupWindows = Array.isArray(input?.startupWindows)
        ? input.startupWindows.filter(
            (item) => typeof item === 'string' && allowedWindowIds.has(item)
        )
        : [];

    const normalizeLayoutNumber = (value, min, max) => {
        if (value === null || value === undefined || value === '') return null;
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return null;
        const rounded = Math.round(parsed);
        if (rounded < min || rounded > max) return null;
        return rounded;
    };

    const incomingLayouts =
        input?.windowLayouts && typeof input.windowLayouts === 'object'
            ? input.windowLayouts
            : {};
    const windowLayouts = {};
    for (const [windowId, layout] of Object.entries(incomingLayouts)) {
        if (!allowedWindowIds.has(windowId) || !layout || typeof layout !== 'object') continue;
        const normalizedLayout = {
            x: normalizeLayoutNumber(layout.x, -2000, 4000),
            y: normalizeLayoutNumber(layout.y, -2000, 4000),
            width: normalizeLayoutNumber(layout.width, 220, 3000),
            height: normalizeLayoutNumber(layout.height, 180, 2400)
        };
        const hasAnyValue = Object.values(normalizedLayout).some((v) => v !== null);
        if (hasAnyValue) windowLayouts[windowId] = normalizedLayout;
    }

    const uniqueStartupWindows = [...new Set(startupWindows)];
    return {
        startupWindows:
            uniqueStartupWindows.length > 0
                ? uniqueStartupWindows
                : getDefaultWindowConfig().startupWindows,
        windowLayouts
    };
}

/**
 * @param {unknown} input
 */
function normalizeBandInfoBase(input) {
    const existing = input && typeof input === 'object' ? input : {};
    const sanitizeBaseText = (value, maxLength = 1000) => {
        if (typeof value !== 'string') return '';
        return value.replace(/<[^>]*>?/gm, '').trim().slice(0, maxLength);
    };

    const normalizeMembers = (members) => {
        if (!Array.isArray(members)) return [];
        return members
            .map((member) => ({
                name: sanitizeBaseText(member?.name, 200),
                role: sanitizeBaseText(member?.role, 200)
            }))
            .filter((member) => member.name);
    };

    const normalizeDescriptions = (descriptions) => {
        if (Array.isArray(descriptions)) {
            return descriptions
                .filter((line) => typeof line === 'string' && line.trim() !== '')
                .map((line) => sanitizeBaseText(line, 3000));
        }
        if (typeof descriptions === 'string') {
            return descriptions
                .split(/\n\n+/)
                .map((line) => sanitizeBaseText(line, 3000))
                .filter(Boolean);
        }
        return [];
    };

    return {
        band: {
            name: sanitizeBaseText(existing.band?.name || '', 200),
            origin: sanitizeBaseText(existing.band?.origin || '', 300),
            genre: sanitizeBaseText(existing.band?.genre || '', 200),
            formed: sanitizeBaseText(existing.band?.formed || '', 50),
            description: normalizeDescriptions(existing.band?.description),
            members: normalizeMembers(existing.band?.members)
        },
        contact: {
            email: sanitizeBaseText(existing.contact?.email || '', 320),
            website: sanitizeBaseText(existing.contact?.website || '', 500),
            members:
                existing.contact?.members && typeof existing.contact.members === 'object'
                    ? existing.contact.members
                    : {},
            location: sanitizeBaseText(existing.contact?.location || '', 500)
        },
        social: {
            instagram: {
                handle: sanitizeBaseText(existing.social?.instagram?.handle || '', 200),
                url: sanitizeBaseText(existing.social?.instagram?.url || '', 1000)
            },
            youtube: {
                handle: sanitizeBaseText(existing.social?.youtube?.handle || '', 200),
                url: sanitizeBaseText(existing.social?.youtube?.url || '', 1000)
            },
            tiktok: {
                handle: sanitizeBaseText(existing.social?.tiktok?.handle || '', 200),
                url: sanitizeBaseText(existing.social?.tiktok?.url || '', 1000)
            },
            spotify: {
                url: sanitizeBaseText(existing.social?.spotify?.url || '', 1000)
            },
            appleMusic: {
                url: sanitizeBaseText(existing.social?.appleMusic?.url || '', 1000)
            }
        },
        media: {
            bandPhoto: sanitizeBaseText(existing.media?.bandPhoto || '', 500),
            videos:
                existing.media?.videos && typeof existing.media.videos === 'object'
                    ? existing.media.videos
                    : {}
        },
        upcoming: {
            release: {
                title: sanitizeBaseText(
                    existing.upcoming?.release?.title || 'Pròxim Llançament',
                    300
                ),
                description: sanitizeBaseText(
                    existing.upcoming?.release?.description || 'Estem treballant en algo nou...',
                    1000
                ),
                note: sanitizeBaseText(
                    existing.upcoming?.release?.note || 'Estigues atent!',
                    500
                )
            }
        }
    };
}

/**
 * @param {unknown} current
 * @param {unknown} patch
 */
function mergeBandInfoBase(current, patch) {
    const safeCurrent = normalizeBandInfoBase(current || {});
    const incoming = patch && typeof patch === 'object' ? patch : {};

    const merge = (base, update) => {
        if (Array.isArray(update)) return update;
        if (update && typeof update === 'object') {
            const result = { ...(base && typeof base === 'object' ? base : {}) };
            for (const key of Object.keys(update)) {
                result[key] = merge(result[key], update[key]);
            }
            return result;
        }
        if (update === undefined) return base;
        return update;
    };

    return normalizeBandInfoBase(merge(safeCurrent, incoming));
}

/**
 * @param {import('better-sqlite3').Database} db
 */
function getWindowConfig(db) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('window_config_json');
    if (!row?.value) {
        const defaults = getDefaultWindowConfig();
        saveWindowConfig(db, defaults);
        return defaults;
    }
    try {
        return normalizeWindowConfig(JSON.parse(row.value));
    } catch {
        const defaults = getDefaultWindowConfig();
        saveWindowConfig(db, defaults);
        return defaults;
    }
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {ReturnType<typeof normalizeWindowConfig>} config
 */
function saveWindowConfig(db, config) {
    const normalized = normalizeWindowConfig(config || {});
    db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('window_config_json', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(JSON.stringify(normalized));
    return normalized;
}

/**
 * @param {import('better-sqlite3').Database} db
 */
function getBandInfoBase(db) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('band_info_json');
    if (!row?.value) {
        const base = normalizeBandInfoBase({});
        saveBandInfoBase(db, base);
        return base;
    }
    try {
        return normalizeBandInfoBase(JSON.parse(row.value));
    } catch {
        const base = normalizeBandInfoBase({});
        saveBandInfoBase(db, base);
        return base;
    }
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {ReturnType<typeof normalizeBandInfoBase>} data
 */
function saveBandInfoBase(db, data) {
    const normalized = normalizeBandInfoBase(data);
    db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('band_info_json', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(JSON.stringify(normalized));
    return normalized;
}

// --- Mobile Config ---

const DEFAULT_MOBILE_WINDOWS = ['countdown', 'tour', 'about', 'music', 'video', 'gallery', 'contact'];

function getDefaultMobileConfig() {
    return {
        mobileWindows: [...DEFAULT_MOBILE_WINDOWS],
        mobileWindowOrder: [...DEFAULT_MOBILE_WINDOWS]
    };
}

function normalizeMobileConfig(input) {
    const allowedWindowIds = ALLOWED_WINDOW_IDS;

    const mobileWindows = Array.isArray(input?.mobileWindows)
        ? input.mobileWindows.filter(
            (item) => typeof item === 'string' && allowedWindowIds.has(item)
        )
        : [];

    const mobileWindowOrder = Array.isArray(input?.mobileWindowOrder)
        ? input.mobileWindowOrder.filter(
            (item) => typeof item === 'string' && allowedWindowIds.has(item)
        )
        : [];

    const uniqueWindows = [...new Set(mobileWindows)];
    const uniqueOrder = [...new Set(mobileWindowOrder)];

    return {
        mobileWindows: uniqueWindows.length > 0
            ? uniqueWindows
            : getDefaultMobileConfig().mobileWindows,
        mobileWindowOrder: uniqueOrder.length > 0
            ? uniqueOrder
            : uniqueWindows.length > 0 ? uniqueWindows : getDefaultMobileConfig().mobileWindowOrder
    };
}

/**
 * @param {import('better-sqlite3').Database} db
 */
function getMobileConfig(db) {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('mobile_config_json');
    if (!row?.value) {
        const defaults = getDefaultMobileConfig();
        saveMobileConfig(db, defaults);
        return defaults;
    }
    try {
        return normalizeMobileConfig(JSON.parse(row.value));
    } catch {
        const defaults = getDefaultMobileConfig();
        saveMobileConfig(db, defaults);
        return defaults;
    }
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {ReturnType<typeof normalizeMobileConfig>} config
 */
function saveMobileConfig(db, config) {
    const normalized = normalizeMobileConfig(config || {});
    db.prepare(`
        INSERT INTO settings (key, value, updated_at)
        VALUES ('mobile_config_json', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(JSON.stringify(normalized));
    return normalized;
}

module.exports = {
    getDefaultWindowConfig,
    normalizeWindowConfig,
    normalizeBandInfoBase,
    mergeBandInfoBase,
    getWindowConfig,
    saveWindowConfig,
    getBandInfoBase,
    saveBandInfoBase,
    getDefaultMobileConfig,
    normalizeMobileConfig,
    getMobileConfig,
    saveMobileConfig
};
