/**
 * @param {import('better-sqlite3').Database} db
 */
function getTours(db) {
    return db.prepare('SELECT * FROM tours ORDER BY date DESC').all();
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ date: string, city: string, venue: string, ticketLink?: string }} tourData
 */
function addTour(db, tourData) {
    const stmt = db.prepare(`
        INSERT INTO tours (date, city, venue, ticketLink, time)
        VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
        tourData.date,
        tourData.city,
        tourData.venue,
        tourData.ticketLink || '',
        tourData.time || null
    );
    return { id: result.lastInsertRowid, ...tourData };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 * @param {{ date: string, city: string, venue: string, ticketLink?: string }} tourData
 */
function updateTour(db, id, tourData) {
    const stmt = db.prepare(`
        UPDATE tours
        SET date = ?, city = ?, venue = ?, ticketLink = ?, time = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `);
    const result = stmt.run(
        tourData.date,
        tourData.city,
        tourData.venue,
        tourData.ticketLink || '',
        tourData.time || null,
        id
    );
    return result.changes > 0;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 */
function deleteTour(db, id) {
    const result = db.prepare('DELETE FROM tours WHERE id = ?').run(id);
    return result.changes > 0;
}

module.exports = {
    getTours,
    addTour,
    updateTour,
    deleteTour
};
