const Database = require('better-sqlite3');
const fs = require('fs').promises;
const path = require('path');

class BandDatabase {
    constructor() {
        this.db = null;
        this.dbPath = process.env.NODE_ENV === 'production' 
            ? '/app/data/band.db'  // Persistent path in production
            : './data/band.db';    // Local development
    }

    async initialize() {
        try {
            // Ensure data directory exists
            await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
            
            this.db = new Database(this.dbPath);
            
            // Enable WAL mode for better concurrent access
            this.db.exec('PRAGMA journal_mode = WAL');
            
            this.createTables();
            await this.migrateFromJSON();
            
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
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT NOT NULL,
                title TEXT,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
    }

    async migrateFromJSON() {
        try {
            // Migrate tours
            const toursData = await fs.readFile('./data/tours.json', 'utf8');
            const tours = JSON.parse(toursData);
            
            const existingTours = this.db.prepare('SELECT COUNT(*) as count FROM tours').get();
            if (existingTours.count === 0) {
                const insertTour = this.db.prepare(`
                    INSERT INTO tours (date, city, venue, ticketLink) 
                    VALUES (?, ?, ?, ?)
                `);

                for (const tour of tours.tours) {
                    insertTour.run(tour.date, tour.city, tour.venue, tour.ticketLink || '');
                }
                console.log(`Migrated ${tours.tours.length} tours`);
            }

            // Migrate countdown
            try {
                const countdownData = await fs.readFile('./data/countdown.json', 'utf8');
                const countdown = JSON.parse(countdownData);
                
                const existingCountdown = this.db.prepare('SELECT COUNT(*) as count FROM countdown').get();
                if (existingCountdown.count === 0 && countdown.release) {
                    this.db.prepare(`
                        INSERT OR REPLACE INTO countdown (id, title, description, releaseDate, enabled, completedTitle, completedDescription, preReleaseMessage)
                        VALUES (1, ?, ?, ?, ?, ?, ?, ?)
                    `).run(
                        countdown.release.title || '',
                        countdown.release.description || '',
                        countdown.release.releaseDate || '',
                        countdown.release.enabled ? 1 : 0,
                        countdown.release.completedTitle || '',
                        countdown.release.completedDescription || '',
                        countdown.release.preReleaseMessage || ''
                    );
                    console.log('Migrated countdown data');
                } else if (existingCountdown.count > 0) {
                    console.log('Countdown data already exists in database');
                }
            } catch (err) {
                console.log('Error migrating countdown data:', err.message);
            }

        } catch (error) {
            console.log('JSON files not found or already migrated');
        }
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

    // Backup method
    async createBackup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `./backups/band-backup-${timestamp}.db`;
        
        await fs.mkdir('./backups', { recursive: true });
        await fs.copyFile(this.dbPath, backupPath);
        
        return backupPath;
    }

    close() {
        if (this.db) {
            this.db.close();
        }
    }
}

module.exports = BandDatabase;
