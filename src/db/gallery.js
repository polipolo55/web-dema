/**
 * @param {import('better-sqlite3').Database} db
 */
function getGallery(db) {
    const settings = db.prepare('SELECT enabled FROM gallery_settings WHERE id = 1').get();
    const photos = db.prepare('SELECT * FROM gallery ORDER BY order_num ASC, created_at ASC').all();

    return {
        gallery: {
            enabled: settings ? Boolean(settings.enabled) : true,
            photos: photos.map((photo) => ({
                id: photo.id,
                filename: photo.filename,
                title: photo.title,
                description: photo.description,
                order: photo.order_num,
                mediaType:
                    photo.media_type ||
                    (photo.mime_type && photo.mime_type.startsWith('video') ? 'video' : 'photo'),
                thumbnail: photo.thumbnail,
                mimeType: photo.mime_type
            }))
        }
    };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} filename
 */
function getPhotoByFilename(db, filename) {
    return db.prepare('SELECT * FROM gallery WHERE filename = ? OR thumbnail = ?').get(filename, filename);
}

/**
 * @param {import('better-sqlite3').Database} db
 */
function getNextGalleryOrder(db) {
    const row = db.prepare('SELECT MAX(order_num) AS maxOrder FROM gallery').get();
    return (row?.maxOrder || 0) + 1;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number|string|undefined} order
 */
function normalizeOrderValue(db, order) {
    const parsed = parseInt(order, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return getNextGalleryOrder(db);
    }
    return parsed;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{
 *   id: string,
 *   filename: string,
 *   title?: string,
 *   description?: string,
 *   order?: number,
 *   mediaType?: string,
 *   thumbnail?: string | null,
 *   mimeType?: string | null
 * }} photoData
 */
function addPhoto(db, photoData) {
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

    const effectiveOrder = normalizeOrderValue(db, order);
    const stmt = db.prepare(`
        INSERT INTO gallery (id, filename, title, description, order_num, media_type, thumbnail, mime_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(id, filename, title, description, effectiveOrder, mediaType, thumbnail, mimeType);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} id
 * @param {{
 *   filename?: string,
 *   title?: string,
 *   description?: string,
 *   order?: number,
 *   mediaType?: string,
 *   thumbnail?: string | null,
 *   mimeType?: string | null
 * }} photoData
 */
function updatePhoto(db, id, photoData) {
    const {
        filename,
        title,
        description,
        order,
        mediaType = 'photo',
        thumbnail = null,
        mimeType = null
    } = photoData;

    const effectiveOrder = normalizeOrderValue(db, order);
    const stmt = db.prepare(`
        UPDATE gallery
        SET filename = ?, title = ?, description = ?, order_num = ?, media_type = ?, thumbnail = ?, mime_type = ?
        WHERE id = ?
    `);
    return stmt.run(filename, title, description, effectiveOrder, mediaType, thumbnail, mimeType, id);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} id
 */
function deletePhoto(db, id) {
    const result = db.prepare('DELETE FROM gallery WHERE id = ?').run(id);
    return result.changes > 0;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {boolean} enabled
 */
function updateGallerySettings(db, enabled) {
    db.prepare(`
        INSERT OR REPLACE INTO gallery_settings (id, enabled, updated_at)
        VALUES (1, ?, CURRENT_TIMESTAMP)
    `).run(enabled ? 1 : 0);
    return getGallery(db);
}

/**
 * Reorder gallery by updating order_num for all photos in one transaction.
 * @param {import('better-sqlite3').Database} db
 * @param {Array<{ id: string, order: number }>} ordered - array of { id, order } in desired order
 */
function reorderPhotos(db, ordered) {
    const stmt = db.prepare('UPDATE gallery SET order_num = ? WHERE id = ?');
    db.transaction((list) => {
        for (const { id, order } of list) {
            stmt.run(order, id);
        }
    })(ordered);
    return getGallery(db);
}

module.exports = {
    getGallery,
    getPhotoByFilename,
    getNextGalleryOrder,
    normalizeOrderValue,
    addPhoto,
    updatePhoto,
    deletePhoto,
    updateGallerySettings,
    reorderPhotos
};
