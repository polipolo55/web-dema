/**
 * Discography rework: rename legacy releases/tracks tables (never dropped),
 * then recreate the new-shape tables via runSchema.
 */
module.exports = function (db) {
    const releasesCols = db.prepare('PRAGMA table_info(releases)').all();
    const isLegacyReleases = releasesCols.some((col) => col.name === 'tracks_json');
    if (isLegacyReleases) {
        db.exec('ALTER TABLE releases RENAME TO releases_legacy');
    }

    const tracksTable = db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tracks'"
    ).get();
    if (tracksTable) {
        db.exec('ALTER TABLE tracks RENAME TO tracks_legacy');
    }

    const { runSchema } = require('../schema');
    runSchema(db);
};
