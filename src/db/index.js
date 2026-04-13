const Database = require('better-sqlite3');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const { runSchema } = require('./schema');
const { runMigrations } = require('./migrate');
const tours = require('./tours');
const countdown = require('./countdown');
const gallery = require('./gallery');
const settings = require('./settings');
const releases = require('./releases');
const tracksModule = require('./tracks');

/**
 * Create and initialize the database connection, run schema and migrations,
 * seed initial data, and return a facade used by the API and admin routes.
 */
async function createDb() {
    const dbPath = config.database.path;
    await fs.mkdir(path.dirname(dbPath), { recursive: true });
    if (config.uploads) {
        await fs.mkdir(config.uploads.galleryPath, { recursive: true });
        await fs.mkdir(config.uploads.tracksPath, { recursive: true });
    }

    const db = new Database(dbPath);
    db.exec('PRAGMA journal_mode = WAL');

    runSchema(db);
    runMigrations(db);
    seedInitialData(db);

    console.log('Database initialized successfully');

    function seedInitialData(database) {
        const bandInfoExists = database.prepare('SELECT value FROM settings WHERE key = ?').get('band_info_json');
        const windowConfigExists = database.prepare('SELECT value FROM settings WHERE key = ?').get('window_config_json');
        const releaseCountRow = database.prepare('SELECT COUNT(*) AS count FROM releases').get();
        const hasReleases = (releaseCountRow?.count || 0) > 0;

        if (!bandInfoExists) {
            settings.saveBandInfoBase(database, settings.normalizeBandInfoBase({}));
        }
        if (!windowConfigExists) {
            settings.saveWindowConfig(database, settings.getDefaultWindowConfig());
        }
        if (!hasReleases) {
            releases.replaceAllReleases(database, []);
        }
    }

    async function createBackup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(process.cwd(), 'backups');
        const backupPath = path.join(backupDir, `band-backup-${timestamp}.db`);
        await fs.mkdir(backupDir, { recursive: true });
        await fs.copyFile(dbPath, backupPath);
        return backupPath;
    }

    return {
        db,
        dbPath,

        getTours: () => tours.getTours(db),
        addTour: (data) => tours.addTour(db, data),
        updateTour: (id, data) => tours.updateTour(db, id, data),
        deleteTour: (id) => tours.deleteTour(db, id),

        getCountdown: () => countdown.getCountdown(db),
        updateCountdown: (data) => countdown.updateCountdown(db, data),

        getGallery: () => gallery.getGallery(db),
        addPhoto: (data) => gallery.addPhoto(db, data),
        updatePhoto: (id, data) => gallery.updatePhoto(db, id, data),
        deletePhoto: (id) => gallery.deletePhoto(db, id),
        updateGallerySettings: (enabled) => gallery.updateGallerySettings(db, enabled),
        getNextGalleryOrder: () => gallery.getNextGalleryOrder(db),
        normalizeOrderValue: (order) => gallery.normalizeOrderValue(db, order),
        reorderPhotos: (ordered) => gallery.reorderPhotos(db, ordered),
        getPhotoByFilename: (filename) => gallery.getPhotoByFilename(db, filename),

        createBackup,

        getWindowConfig: () => settings.getWindowConfig(db),
        saveWindowConfig: (config) => settings.saveWindowConfig(db, config),
        getDefaultWindowConfig: settings.getDefaultWindowConfig,
        getMobileConfig: () => settings.getMobileConfig(db),
        saveMobileConfig: (config) => settings.saveMobileConfig(db, config),
        getDefaultMobileConfig: settings.getDefaultMobileConfig,
        getBandInfoBase: () => settings.getBandInfoBase(db),
        saveBandInfoBase: (data) => settings.saveBandInfoBase(db, data),

        getBandInfo() {
            const base = settings.getBandInfoBase(db);
            return {
                ...base,
                discography: { releases: releases.getReleases(db) }
            };
        },
        updateBandInfo(data) {
            const current = settings.getBandInfoBase(db);
            const merged = settings.mergeBandInfoBase(current, data || {});
            const base = settings.saveBandInfoBase(db, merged);
            if (Array.isArray(data?.discography?.releases)) {
                releases.replaceAllReleases(db, data.discography.releases);
            }
            return {
                ...base,
                discography: { releases: releases.getReleases(db) }
            };
        },

        getReleases: () => releases.getReleases(db),
        addRelease: (data) => releases.addRelease(db, data),
        updateRelease: (id, data) => releases.updateRelease(db, id, data),
        deleteRelease: (id) => releases.deleteRelease(db, id),
        reorderRelease: (releaseId, targetIndex) => releases.reorderRelease(db, releaseId, targetIndex),
        replaceAllReleases: (releasesList) => releases.replaceAllReleases(db, releasesList),

        getTracks: () => tracksModule.getTracks(db),
        getTrackById: (id) => tracksModule.getTrackById(db, id),
        getTrackByFilename: (filename) => tracksModule.getTrackByFilename(db, filename),
        addTrack: (data) => tracksModule.addTrack(db, data),
        deleteTrack: (id) => tracksModule.deleteTrack(db, id),
        reorderTrack: (trackId, targetIndex) => tracksModule.reorderTrack(db, trackId, targetIndex),
        getNextTrackOrder: () => tracksModule.getNextTrackOrder(db),

        close() {
            if (db) db.close();
        }
    };
}

module.exports = { createDb };
