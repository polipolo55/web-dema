const Database = require('better-sqlite3');
const fs = require('fs').promises;
const path = require('path');

/**
 * Band Database - manages SQLite database for tour dates, gallery, and content
 */
class BandDatabase {
    /**
     * Initialize database connection
     */
    constructor() {
        this.db = null;
        this.dbPath = process.env.NODE_ENV === 'production' 
            ? '/app/data/band.db'  // Persistent path in production
            : './data/band.db';    // Local development
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

    close() {
        if (this.db) {
            this.db.close();
        }
    }
}

module.exports = BandDatabase;
