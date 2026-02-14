#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const BandDatabase = require('../src/database');

function getArgValue(name, fallback = '') {
    const prefix = `${name}=`;
    const found = process.argv.find((arg) => arg.startsWith(prefix));
    return found ? found.slice(prefix.length) : fallback;
}

function hasArg(name) {
    return process.argv.includes(name);
}

async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch (error) {
        return false;
    }
}

async function createBackupIfRequested(dbPath, sourcePath) {
    if (!hasArg('--backup')) {
        return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    if (await fileExists(dbPath)) {
        const dbBackupPath = `${dbPath}.backup.${timestamp}`;
        await fs.copyFile(dbPath, dbBackupPath);
        console.log(`🗂️  DB backup created: ${dbBackupPath}`);
    }

    if (await fileExists(sourcePath)) {
        const jsonBackupPath = `${sourcePath}.backup.${timestamp}`;
        await fs.copyFile(sourcePath, jsonBackupPath);
        console.log(`🗂️  JSON backup created: ${jsonBackupPath}`);
    }
}

function isDbConsideredNonEmpty(db) {
    const releasesCount = db.getReleases().length;
    const bandInfo = db.getBandInfo();
    const bandName = (bandInfo?.band?.name || '').trim();
    const descriptionCount = Array.isArray(bandInfo?.band?.description) ? bandInfo.band.description.length : 0;

    return releasesCount > 0 || bandName.length > 0 || descriptionCount > 0;
}

async function main() {
    const sourcePath = getArgValue('--source', path.join(process.cwd(), 'data', 'band-info.json'));
    const dbPath = process.env.DATABASE_PATH || '/app/data/band.db';

    if (!(await fileExists(sourcePath))) {
        console.log(`ℹ️  Source JSON not found at ${sourcePath}. Nothing to migrate.`);
        process.exit(0);
    }

    const db = new BandDatabase();
    await db.initialize();

    if (hasArg('--if-empty') && isDbConsideredNonEmpty(db)) {
        console.log('ℹ️  Database already has content. Migration skipped (--if-empty).');
        db.close();
        process.exit(0);
    }

    const raw = await fs.readFile(sourcePath, 'utf8');
    const payload = JSON.parse(raw);

    await createBackupIfRequested(dbPath, sourcePath);

    const migrated = db.updateBandInfo(payload);
    const releaseCount = Array.isArray(migrated?.discography?.releases) ? migrated.discography.releases.length : 0;
    const bandName = migrated?.band?.name || '';

    console.log(`✅ Migration completed. Band: "${bandName}", releases: ${releaseCount}`);
    db.close();
}

main().catch((error) => {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
});
