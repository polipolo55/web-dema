/**
 * @param {import('better-sqlite3').Database} db
 */
function getTracks(db) {
    const rows = db.prepare(
        'SELECT * FROM tracks ORDER BY sort_order ASC, id ASC'
    ).all();
    return rows.map((row) => ({
        id: row.id,
        filename: row.filename,
        title: row.title || row.filename,
        sortOrder: row.sort_order,
        mimeType: row.mime_type,
        src: null
    }));
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 */
function getTrackById(db, id) {
    return db.prepare('SELECT * FROM tracks WHERE id = ?').get(id);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {string} filename
 */
function getTrackByFilename(db, filename) {
    return db.prepare('SELECT * FROM tracks WHERE filename = ?').get(filename);
}

/**
 * @param {import('better-sqlite3').Database} db
 */
function getNextTrackOrder(db) {
    const row = db.prepare('SELECT MAX(sort_order) AS maxOrder FROM tracks').get();
    return (row?.maxOrder || 0) + 1;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ filename: string, title?: string, mimeType?: string }} data
 */
function addTrack(db, data) {
    const sortOrder = getNextTrackOrder(db);
    const result = db.prepare(`
        INSERT INTO tracks (filename, title, sort_order, mime_type)
        VALUES (?, ?, ?, ?)
    `).run(
        data.filename,
        data.title || data.filename,
        sortOrder,
        data.mimeType || null
    );
    const row = db.prepare('SELECT * FROM tracks WHERE id = ?').get(result.lastInsertRowid);
    return {
        id: row.id,
        filename: row.filename,
        title: row.title || row.filename,
        sortOrder: row.sort_order,
        mimeType: row.mime_type
    };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 */
function deleteTrack(db, id) {
    const result = db.prepare('DELETE FROM tracks WHERE id = ?').run(id);
    return result.changes > 0;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} trackId
 * @param {number} targetIndex
 */
function reorderTrack(db, trackId, targetIndex) {
    const current = getTracks(db);
    const fromIndex = current.findIndex((t) => Number(t.id) === Number(trackId));
    if (fromIndex === -1) return { success: false, error: 'Track not found' };
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= current.length) {
        return { success: false, error: 'Invalid target index' };
    }
    if (fromIndex === targetIndex) return { success: true, tracks: getTracks(db) };

    const reordered = [...current];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    const tx = db.transaction((items) => {
        const stmt = db.prepare('UPDATE tracks SET sort_order = ? WHERE id = ?');
        items.forEach((item, index) => {
            stmt.run(index + 1, item.id);
        });
    });
    tx(reordered);
    return { success: true, tracks: getTracks(db) };
}

module.exports = {
    getTracks,
    getTrackById,
    getTrackByFilename,
    getNextTrackOrder,
    addTrack,
    deleteTrack,
    reorderTrack
};
