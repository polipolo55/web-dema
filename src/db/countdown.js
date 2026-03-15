/**
 * @param {import('better-sqlite3').Database} db
 */
function getCountdown(db) {
    return db.prepare('SELECT * FROM countdown WHERE id = 1').get() || {};
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{
 *   title?: string,
 *   description?: string,
 *   releaseDate?: string,
 *   enabled?: boolean,
 *   completedTitle?: string,
 *   completedDescription?: string,
 *   preReleaseMessage?: string
 * }} countdownData
 */
function updateCountdown(db, countdownData) {
    const stmt = db.prepare(`
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
    return getCountdown(db);
}

module.exports = {
    getCountdown,
    updateCountdown
};
