const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Run all pending migrations. Migration files must be named NNN_name.sql or NNN_name.js
 * and are run in numeric order. Applied names are stored in schema_migrations.
 * @param {import('better-sqlite3').Database} db
 */
function runMigrations(db) {
    try {
        const entries = fs.readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
            .filter((e) => e.isFile() && /^\d{3}_/.test(e.name))
            .map((e) => e.name)
            .sort();

        const applied = new Set(
            db.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name)
        );

        for (const name of entries) {
            if (applied.has(name)) continue;

            const filePath = path.join(MIGRATIONS_DIR, name);
            const ext = path.extname(name);

            if (ext === '.sql') {
                const sql = fs.readFileSync(filePath, 'utf8').trim();
                if (sql) {
                    db.exec(sql);
                }
            } else if (ext === '.js') {
                const fn = require(filePath);
                if (typeof fn === 'function') {
                    fn(db);
                }
            }

            db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(name);
        }
    } catch (err) {
        if (err.code === 'ENOENT' && err.path === MIGRATIONS_DIR) {
            return;
        }
        throw err;
    }
}

module.exports = { runMigrations };
