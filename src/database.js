const Database = require('better-sqlite3');
const fs = require('fs').promises;
const path = require('path');
const config = require('./config');

/**
 * Band Database - manages SQLite database for tour dates, gallery, and content
 */
class BandDatabase {
    /**
     * Initialize database connection
     */
    constructor() {
        this.db = null;
        this.dbPath = config.database.path;
    }

    /**
     * Initialize database and create tables
     */
    async initialize() {
        try {
            // Ensure data directory exists
            await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
            
            this.db = new Database(this.dbPath);
            
            // Enable WAL mode for better concurrent access
            this.db.exec('PRAGMA journal_mode = WAL');
            
            this.createTables();
            this.seedInitialData();
            
            console.log('Database initialized successfully');
        } catch (error) {
            console.error('Database initialization failed:', error);
            throw error;
        }
    }

    createTables() {
        // Tours table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS tours (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                city TEXT NOT NULL,
                venue TEXT NOT NULL,
                ticketLink TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Countdown table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS countdown (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                title TEXT,
                description TEXT,
                releaseDate TEXT,
                enabled BOOLEAN DEFAULT FALSE,
                completedTitle TEXT,
                completedDescription TEXT,
                preReleaseMessage TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Gallery table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS gallery (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                title TEXT,
                description TEXT,
                order_num INTEGER,
                media_type TEXT DEFAULT 'photo',
                thumbnail TEXT,
                mime_type TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Gallery settings table
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS gallery_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                enabled BOOLEAN DEFAULT 1,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Settings table for general band info
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        this.db.exec(`
            CREATE TABLE IF NOT EXISTS releases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                type TEXT,
                year INTEGER,
                recorded TEXT,
                studio TEXT,
                released TEXT,
                release_date TEXT,
                cover TEXT,
                description TEXT,
                status TEXT,
                spotify TEXT,
                youtube TEXT,
                apple_music TEXT,
                tracks_json TEXT DEFAULT '[]',
                sort_order INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        this.ensureGalleryColumns();
    }

    ensureGalleryColumns() {
        const columns = this.db.prepare('PRAGMA table_info(gallery)').all();
        const columnNames = new Set(columns.map(col => col.name));

        const addColumn = (name, definition) => {
            if (!columnNames.has(name)) {
                this.db.exec(`ALTER TABLE gallery ADD COLUMN ${definition}`);
            }
        };

        addColumn('media_type', "media_type TEXT DEFAULT 'photo'");
        addColumn('thumbnail', 'thumbnail TEXT');
        addColumn('mime_type', 'mime_type TEXT');
    }

    // Tours methods
    getTours() {
        return this.db.prepare('SELECT * FROM tours ORDER BY date DESC').all();
    }

    addTour(tourData) {
        const stmt = this.db.prepare(`
            INSERT INTO tours (date, city, venue, ticketLink) 
            VALUES (?, ?, ?, ?)
        `);
        const result = stmt.run(tourData.date, tourData.city, tourData.venue, tourData.ticketLink || '');
        return { id: result.lastInsertRowid, ...tourData };
    }

    updateTour(id, tourData) {
        const stmt = this.db.prepare(`
            UPDATE tours 
            SET date = ?, city = ?, venue = ?, ticketLink = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `);
        const result = stmt.run(tourData.date, tourData.city, tourData.venue, tourData.ticketLink || '', id);
        return result.changes > 0;
    }

    deleteTour(id) {
        const stmt = this.db.prepare('DELETE FROM tours WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }

    // Countdown methods
    getCountdown() {
        return this.db.prepare('SELECT * FROM countdown WHERE id = 1').get() || {};
    }

    updateCountdown(countdownData) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO countdown (id, title, description, releaseDate, enabled, completedTitle, completedDescription, preReleaseMessage, updated_at)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `);
        stmt.run(
            countdownData.title || '',
            countdownData.description || '',
            countdownData.releaseDate || '',
            countdownData.enabled ? 1 : 0,
            countdownData.completedTitle || '',
            countdownData.completedDescription || '',
            countdownData.preReleaseMessage || ''
        );
        return this.getCountdown();
    }

    // Gallery methods
    getGallery() {
        const settings = this.db.prepare('SELECT enabled FROM gallery_settings WHERE id = 1').get();
        const photos = this.db.prepare('SELECT * FROM gallery ORDER BY order_num ASC, created_at ASC').all();
        
        return {
            gallery: {
                enabled: settings ? Boolean(settings.enabled) : true,
                photos: photos.map(photo => ({
                    id: photo.id,
                    filename: photo.filename,
                    title: photo.title,
                    description: photo.description,
                    order: photo.order_num,
                    mediaType: photo.media_type || (photo.mime_type && photo.mime_type.startsWith('video') ? 'video' : 'photo'),
                    thumbnail: photo.thumbnail,
                    mimeType: photo.mime_type
                }))
            }
        };
    }

    addPhoto(photoData) {
        const {
            id,
            filename,
            title,
            description,
            order,
            mediaType = 'photo',
            thumbnail = null,
            mimeType = null
        } = photoData;

        const effectiveOrder = this.normalizeOrderValue(order);
        const stmt = this.db.prepare(`
            INSERT INTO gallery (id, filename, title, description, order_num, media_type, thumbnail, mime_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(id, filename, title, description, effectiveOrder, mediaType, thumbnail, mimeType);
    }

    updatePhoto(id, photoData) {
        const {
            filename,
            title,
            description,
            order,
            mediaType = 'photo',
            thumbnail = null,
            mimeType = null
        } = photoData;

        const effectiveOrder = this.normalizeOrderValue(order);
        const stmt = this.db.prepare(`
            UPDATE gallery 
            SET filename = ?, title = ?, description = ?, order_num = ?, media_type = ?, thumbnail = ?, mime_type = ?
            WHERE id = ?
        `);
        return stmt.run(filename, title, description, effectiveOrder, mediaType, thumbnail, mimeType, id);
    }

    deletePhoto(id) {
        const stmt = this.db.prepare('DELETE FROM gallery WHERE id = ?');
        const result = stmt.run(id);
        return result.changes > 0;
    }

    updateGallerySettings(enabled) {
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO gallery_settings (id, enabled, updated_at) 
            VALUES (1, ?, CURRENT_TIMESTAMP)
        `);
        stmt.run(enabled ? 1 : 0);
        return this.getGallery();
    }

    // Backup method
    async createBackup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `./backups/band-backup-${timestamp}.db`;
        
        await fs.mkdir('./backups', { recursive: true });
        await fs.copyFile(this.dbPath, backupPath);
        
        return backupPath;
    }

    normalizeOrderValue(order) {
        const parsed = parseInt(order, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            return this.getNextGalleryOrder();
        }
        return parsed;
    }

    getNextGalleryOrder() {
        const row = this.db.prepare('SELECT MAX(order_num) AS maxOrder FROM gallery').get();
        return (row?.maxOrder || 0) + 1;
    }

    seedInitialData() {
        const bandInfoExists = this.db.prepare('SELECT value FROM settings WHERE key = ?').get('band_info_json');
        const windowConfigExists = this.db.prepare('SELECT value FROM settings WHERE key = ?').get('window_config_json');
        const releaseCountRow = this.db.prepare('SELECT COUNT(*) AS count FROM releases').get();
        const hasReleases = (releaseCountRow?.count || 0) > 0;

        if (!bandInfoExists) {
            const payload = this.normalizeBandInfoBase({});
            this.saveBandInfoBase(payload);
        }

        if (!windowConfigExists) {
            this.saveWindowConfig(this.getDefaultWindowConfig());
        }

        if (!hasReleases) {
            this.replaceAllReleases([]);
        }
    }

    getDefaultWindowConfig() {
        return {
            startupWindows: ['about', 'tour', 'video', 'testelis'],
            windowLayouts: {}
        };
    }

    normalizeWindowConfig(input) {
        const allowedWindowIds = new Set([
            'about',
            'music',
            'tour',
            'contact',
            'gallery',
            'users',
            'countdown',
            'recycle',
            'video',
            'testelis',
            'stats'
        ]);

        const startupWindows = Array.isArray(input?.startupWindows)
            ? input.startupWindows
                .filter((item) => typeof item === 'string' && allowedWindowIds.has(item))
            : [];

        const normalizeLayoutNumber = (value, min, max) => {
            if (value === null || value === undefined || value === '') {
                return null;
            }

            const parsed = Number(value);
            if (!Number.isFinite(parsed)) {
                return null;
            }

            const rounded = Math.round(parsed);
            if (rounded < min || rounded > max) {
                return null;
            }

            return rounded;
        };

        const incomingLayouts = input?.windowLayouts && typeof input.windowLayouts === 'object'
            ? input.windowLayouts
            : {};

        const windowLayouts = {};
        for (const [windowId, layout] of Object.entries(incomingLayouts)) {
            if (!allowedWindowIds.has(windowId) || !layout || typeof layout !== 'object') {
                continue;
            }

            const normalizedLayout = {
                x: normalizeLayoutNumber(layout.x, -2000, 4000),
                y: normalizeLayoutNumber(layout.y, -2000, 4000),
                width: normalizeLayoutNumber(layout.width, 220, 3000),
                height: normalizeLayoutNumber(layout.height, 180, 2400)
            };

            const hasAnyValue = Object.values(normalizedLayout).some((value) => value !== null);
            if (hasAnyValue) {
                windowLayouts[windowId] = normalizedLayout;
            }
        }

        const uniqueStartupWindows = [...new Set(startupWindows)];

        return {
            startupWindows: uniqueStartupWindows.length > 0
                ? uniqueStartupWindows
                : this.getDefaultWindowConfig().startupWindows,
            windowLayouts
        };
    }

    getWindowConfig() {
        const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get('window_config_json');
        if (!row?.value) {
            const defaults = this.getDefaultWindowConfig();
            this.saveWindowConfig(defaults);
            return defaults;
        }

        try {
            return this.normalizeWindowConfig(JSON.parse(row.value));
        } catch (error) {
            const defaults = this.getDefaultWindowConfig();
            this.saveWindowConfig(defaults);
            return defaults;
        }
    }

    saveWindowConfig(config) {
        const normalized = this.normalizeWindowConfig(config || {});
        this.db.prepare(`
            INSERT INTO settings (key, value, updated_at)
            VALUES ('window_config_json', ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `).run(JSON.stringify(normalized));
        return normalized;
    }

    getBandInfoBase() {
        const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get('band_info_json');
        if (!row?.value) {
            const base = this.normalizeBandInfoBase({});
            this.saveBandInfoBase(base);
            return base;
        }

        try {
            return this.normalizeBandInfoBase(JSON.parse(row.value));
        } catch (error) {
            const base = this.normalizeBandInfoBase({});
            this.saveBandInfoBase(base);
            return base;
        }
    }

    saveBandInfoBase(data) {
        const normalized = this.normalizeBandInfoBase(data);
        this.db.prepare(`
            INSERT INTO settings (key, value, updated_at)
            VALUES ('band_info_json', ?, CURRENT_TIMESTAMP)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
        `).run(JSON.stringify(normalized));
        return normalized;
    }

    getBandInfo() {
        const base = this.getBandInfoBase();
        return {
            ...base,
            discography: {
                releases: this.getReleases()
            }
        };
    }

    updateBandInfo(data) {
        const current = this.getBandInfoBase();
        const merged = this.mergeBandInfoBase(current, data || {});
        const base = this.saveBandInfoBase(merged);

        if (Array.isArray(data?.discography?.releases)) {
            this.replaceAllReleases(data.discography.releases);
        }

        return {
            ...base,
            discography: {
                releases: this.getReleases()
            }
        };
    }

    getReleases() {
        const rows = this.db.prepare(`
            SELECT * FROM releases
            ORDER BY
                CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END,
                sort_order ASC,
                CASE WHEN release_date IS NULL OR release_date = '' THEN 1 ELSE 0 END,
                release_date DESC,
                year DESC,
                id DESC
        `).all();

        return rows.map((row) => this.mapReleaseRow(row));
    }

    addRelease(releaseData) {
        const release = this.normalizeRelease(releaseData);
        if (!release.title) {
            throw new Error('Release title is required');
        }
        const sortOrder = this.getNextReleaseOrder();

        const result = this.db.prepare(`
            INSERT INTO releases (
                title, type, year, recorded, studio, released, release_date, cover,
                description, status, spotify, youtube, apple_music, tracks_json, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
            release.title,
            release.type,
            release.year,
            release.recorded,
            release.studio,
            release.released,
            release.releaseDate,
            release.cover,
            release.description,
            release.status,
            release.streaming.spotify,
            release.streaming.youtube,
            release.streaming.appleMusic,
            JSON.stringify(release.tracks),
            sortOrder
        );

        const row = this.db.prepare('SELECT * FROM releases WHERE id = ?').get(result.lastInsertRowid);
        return this.mapReleaseRow(row);
    }

    updateRelease(id, releaseData) {
        const release = this.normalizeRelease(releaseData);
        if (!release.title) {
            throw new Error('Release title is required');
        }
        const result = this.db.prepare(`
            UPDATE releases
            SET
                title = ?,
                type = ?,
                year = ?,
                recorded = ?,
                studio = ?,
                released = ?,
                release_date = ?,
                cover = ?,
                description = ?,
                status = ?,
                spotify = ?,
                youtube = ?,
                apple_music = ?,
                tracks_json = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `).run(
            release.title,
            release.type,
            release.year,
            release.recorded,
            release.studio,
            release.released,
            release.releaseDate,
            release.cover,
            release.description,
            release.status,
            release.streaming.spotify,
            release.streaming.youtube,
            release.streaming.appleMusic,
            JSON.stringify(release.tracks),
            id
        );

        if (result.changes === 0) {
            return null;
        }

        const row = this.db.prepare('SELECT * FROM releases WHERE id = ?').get(id);
        return this.mapReleaseRow(row);
    }

    deleteRelease(id) {
        const result = this.db.prepare('DELETE FROM releases WHERE id = ?').run(id);
        return result.changes > 0;
    }

    reorderRelease(releaseId, targetIndex) {
        const current = this.getReleases();
        const fromIndex = current.findIndex((release) => Number(release.id) === Number(releaseId));

        if (fromIndex === -1) {
            return { success: false, error: 'Release not found' };
        }

        if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= current.length) {
            return { success: false, error: 'Invalid target index' };
        }

        if (fromIndex === targetIndex) {
            return { success: true, releases: current };
        }

        const reordered = [...current];
        const [moved] = reordered.splice(fromIndex, 1);
        reordered.splice(targetIndex, 0, moved);

        const tx = this.db.transaction((items) => {
            const stmt = this.db.prepare('UPDATE releases SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
            items.forEach((item, index) => {
                stmt.run(index + 1, item.id);
            });
        });

        tx(reordered);
        return { success: true, releases: this.getReleases() };
    }

    replaceAllReleases(releases = []) {
        const tx = this.db.transaction((incoming) => {
            this.db.prepare('DELETE FROM releases').run();

            const insert = this.db.prepare(`
                INSERT INTO releases (
                    title, type, year, recorded, studio, released, release_date, cover,
                    description, status, spotify, youtube, apple_music, tracks_json, sort_order
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            incoming.forEach((item, index) => {
                const release = this.normalizeRelease(item);
                if (!release.title) {
                    return;
                }
                insert.run(
                    release.title,
                    release.type,
                    release.year,
                    release.recorded,
                    release.studio,
                    release.released,
                    release.releaseDate,
                    release.cover,
                    release.description,
                    release.status,
                    release.streaming.spotify,
                    release.streaming.youtube,
                    release.streaming.appleMusic,
                    JSON.stringify(release.tracks),
                    index + 1
                );
            });
        });

        tx(Array.isArray(releases) ? releases : []);
        return this.getReleases();
    }

    getNextReleaseOrder() {
        const row = this.db.prepare('SELECT MAX(sort_order) AS maxOrder FROM releases').get();
        return (row?.maxOrder || 0) + 1;
    }

    mapReleaseRow(row) {
        if (!row) {
            return null;
        }

        let tracks = [];
        try {
            const parsed = JSON.parse(row.tracks_json || '[]');
            if (Array.isArray(parsed)) {
                tracks = parsed
                    .map((track) => ({
                        title: typeof track?.title === 'string' ? track.title : '',
                        duration: typeof track?.duration === 'string' ? track.duration : ''
                    }))
                    .filter((track) => track.title);
            }
        } catch (error) {
            tracks = [];
        }

        return {
            id: row.id,
            title: row.title,
            type: row.type || '',
            year: row.year || undefined,
            recorded: row.recorded || '',
            studio: row.studio || '',
            released: row.released || '',
            releaseDate: row.release_date || undefined,
            cover: row.cover || '',
            description: row.description || '',
            status: row.status || '',
            tracks,
            streaming: {
                spotify: row.spotify || '',
                youtube: row.youtube || '',
                appleMusic: row.apple_music || ''
            }
        };
    }

    normalizeBandInfoBase(input) {
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
                members: existing.contact?.members && typeof existing.contact.members === 'object' ? existing.contact.members : {},
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
                videos: existing.media?.videos && typeof existing.media.videos === 'object' ? existing.media.videos : {}
            },
            upcoming: {
                release: {
                    title: sanitizeBaseText(existing.upcoming?.release?.title || 'Pròxim Llançament', 300),
                    description: sanitizeBaseText(existing.upcoming?.release?.description || 'Estem treballant en algo nou...', 1000),
                    note: sanitizeBaseText(existing.upcoming?.release?.note || 'Estigues atent!', 500)
                }
            }
        };
    }

    mergeBandInfoBase(current, patch) {
        const safeCurrent = this.normalizeBandInfoBase(current || {});
        const incoming = patch && typeof patch === 'object' ? patch : {};

        const merge = (base, update) => {
            if (Array.isArray(update)) {
                return update;
            }

            if (update && typeof update === 'object') {
                const result = { ...(base && typeof base === 'object' ? base : {}) };
                for (const key of Object.keys(update)) {
                    result[key] = merge(result[key], update[key]);
                }
                return result;
            }

            if (update === undefined) {
                return base;
            }

            return update;
        };

        const merged = merge(safeCurrent, incoming);
        return this.normalizeBandInfoBase(merged);
    }

    normalizeRelease(input) {
        const incoming = input && typeof input === 'object' ? input : {};
        const normalizeText = (value, maxLength = 1000) => {
            if (typeof value !== 'string') return '';
            return value.replace(/<[^>]*>?/gm, '').trim().slice(0, maxLength);
        };

        const tracks = Array.isArray(incoming.tracks)
            ? incoming.tracks
                .map((track) => ({
                    title: normalizeText(track?.title || '', 200),
                    duration: normalizeText(track?.duration || '', 50)
                }))
                .filter((track) => track.title)
            : [];

        const parsedYear = Number(incoming.year);

        return {
            title: normalizeText(incoming.title || '', 200),
            type: normalizeText(incoming.type || '', 50),
            year: Number.isInteger(parsedYear) && parsedYear > 0 ? parsedYear : null,
            recorded: normalizeText(incoming.recorded || '', 200),
            studio: normalizeText(incoming.studio || '', 200),
            released: normalizeText(incoming.released || '', 200),
            releaseDate: typeof incoming.releaseDate === 'string' && incoming.releaseDate.trim() ? incoming.releaseDate.trim() : null,
            cover: normalizeText(incoming.cover || '', 400),
            description: normalizeText(incoming.description || '', 2000),
            status: normalizeText(incoming.status || '', 50),
            tracks,
            streaming: {
                spotify: normalizeText(incoming.streaming?.spotify || '', 1000),
                youtube: normalizeText(incoming.streaming?.youtube || '', 1000),
                appleMusic: normalizeText(incoming.streaming?.appleMusic || '', 1000)
            }
        };
    }

    close() {
        if (this.db) {
            this.db.close();
        }
    }
}

module.exports = BandDatabase;
