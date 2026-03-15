/**
 * Database schema - all CREATE TABLE IF NOT EXISTS in one place.
 * @param {import('better-sqlite3').Database} db
 */
function runSchema(db) {
    db.exec(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            name TEXT PRIMARY KEY,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
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

    db.exec(`
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

    db.exec(`
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

    db.exec(`
        CREATE TABLE IF NOT EXISTS gallery_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            enabled BOOLEAN DEFAULT 1,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
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

    db.exec(`
        CREATE TABLE IF NOT EXISTS tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            title TEXT,
            sort_order INTEGER,
            mime_type TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Ensure gallery has columns added by legacy ensureGalleryColumns (idempotent for existing DBs)
    const galleryColumns = db.prepare('PRAGMA table_info(gallery)').all();
    const columnNames = new Set(galleryColumns.map((col) => col.name));
    if (!columnNames.has('media_type')) {
        db.exec("ALTER TABLE gallery ADD COLUMN media_type TEXT DEFAULT 'photo'");
    }
    if (!columnNames.has('thumbnail')) {
        db.exec('ALTER TABLE gallery ADD COLUMN thumbnail TEXT');
    }
    if (!columnNames.has('mime_type')) {
        db.exec('ALTER TABLE gallery ADD COLUMN mime_type TEXT');
    }
}

module.exports = { runSchema };
