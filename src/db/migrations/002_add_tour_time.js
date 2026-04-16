module.exports = function (db) {
    const columns = db.prepare('PRAGMA table_info(tours)').all();
    if (!columns.some((col) => col.name === 'time')) {
        db.exec('ALTER TABLE tours ADD COLUMN time TEXT');
    }
};
