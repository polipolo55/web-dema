# Discography Data Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the denormalized discography (releases with `tracks_json` blob + unrelated `tracks` table) with a normalized model: `songs`, `releases`, and a `release_songs` junction, with the retro player backed by songs that carry audio, plus a lyrics window on the main site.

**Architecture:** SQLite (better-sqlite3) behind a facade in `src/db/index.js` that is injected into Express routes. Each domain is a module of pure `(db, ...)` functions. Frontend is vanilla JS served from `public/` with no build step. Old `releases`/`tracks` tables are renamed to `*_legacy` (never read again); new tables start empty.

**Tech Stack:** Node.js, Express, better-sqlite3, multer (uploads), vanilla JS + 98.css frontend. No test framework exists — each backend task is verified with `node -e` smoke commands against a throwaway DB (`DATABASE_PATH=/tmp/...`), frontend tasks verified manually via `npm run dev`.

**Spec:** `docs/superpowers/specs/2026-06-12-discography-data-model-design.md`

**Conventions:** All user-facing messages in Catalan. DB modules export pure functions taking `(db, ...)`. Migrations are additive — rename, never drop.

---

### Task 1: Config — covers upload path

**Files:**
- Modify: `src/config.js`

- [ ] **Step 1: Add `coversPath` to uploads config**

In `src/config.js`, after `inferDefaultTracksPath` (line 34), add:

```js
function inferDefaultCoversPath(nodeEnv) {
    return nodeEnv === 'production' ? '/app/data/covers' : './public/assets/covers';
}
```

In the `uploads` block (lines 59-62), add the `coversPath` entry:

```js
        uploads: {
            galleryPath: process.env.GALLERY_PATH || inferDefaultGalleryPath(nodeEnv),
            tracksPath: process.env.TRACKS_PATH || inferDefaultTracksPath(nodeEnv),
            coversPath: process.env.COVERS_PATH || inferDefaultCoversPath(nodeEnv)
        },
```

- [ ] **Step 2: Verify**

Run: `node -e "console.log(require('./src/config').uploads.coversPath)"`
Expected: `./public/assets/covers`

- [ ] **Step 3: Commit**

```bash
git add src/config.js
git commit -m "feat: add covers upload path to config"
```

---

### Task 2: Schema, migration 003, foreign keys

**Files:**
- Modify: `src/db/schema.js` (replace `releases` and `tracks` CREATE statements)
- Create: `src/db/migrations/003_discography.js`
- Modify: `src/db/index.js` (FK pragma, remove releases seed)

**Ordering note:** `createDb()` runs `runSchema(db)` BEFORE `runMigrations(db)`. On an existing DB the old `releases` table exists, so the new `CREATE TABLE IF NOT EXISTS releases` no-ops; migration 003 then renames the old tables and re-runs `runSchema` to create the new ones. On a fresh DB, schema creates the new tables and the migration detects nothing to rename (new `releases` has no `tracks_json` column).

- [ ] **Step 1: Replace old table definitions in `src/db/schema.js`**

Delete the two `db.exec` blocks that create `releases` (lines 69-90) and `tracks` (lines 92-101). In their place insert:

```js
    db.exec(`
        CREATE TABLE IF NOT EXISTS songs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            duration_seconds INTEGER,
            lyrics TEXT,
            recorded_year INTEGER,
            recorded_place TEXT,
            notes TEXT,
            audio_filename TEXT,
            audio_mime TEXT,
            player_order INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS releases (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            type TEXT NOT NULL CHECK (type IN ('album','ep','single','other')),
            release_date TEXT,
            cover TEXT,
            description TEXT,
            recorded_place TEXT,
            spotify TEXT,
            youtube TEXT,
            apple_music TEXT,
            published INTEGER NOT NULL DEFAULT 1,
            sort_order INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS release_songs (
            release_id INTEGER NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
            song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
            position INTEGER NOT NULL,
            PRIMARY KEY (release_id, song_id)
        )
    `);
```

- [ ] **Step 2: Create `src/db/migrations/003_discography.js`**

```js
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
```

- [ ] **Step 3: Enable foreign keys and remove the releases seed in `src/db/index.js`**

After `db.exec('PRAGMA journal_mode = WAL');` (line 27) add:

```js
    db.exec('PRAGMA foreign_keys = ON');
```

In `seedInitialData` (lines 35-50), delete these lines (the new `releases` table simply starts empty):

```js
        const releaseCountRow = database.prepare('SELECT COUNT(*) AS count FROM releases').get();
        const hasReleases = (releaseCountRow?.count || 0) > 0;
```
and
```js
        if (!hasReleases) {
            releases.replaceAllReleases(database, []);
        }
```

- [ ] **Step 4: Verify fresh DB gets new tables**

```bash
rm -f /tmp/dema-fresh.db* && DATABASE_PATH=/tmp/dema-fresh.db node -e "
(async () => {
  const { createDb } = require('./src/db');
  const api = await createDb();
  const tables = api.db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name\").all().map(r => r.name);
  console.log(tables.join(','));
  const fk = api.db.prepare('PRAGMA foreign_keys').get();
  console.log('fk:', JSON.stringify(fk));
  api.close();
})().catch(e => { console.error(e); process.exit(1); });
"
```
Expected: table list includes `release_songs`, `releases`, `songs` and does NOT include `tracks`; `fk: {"foreign_keys":1}`.

- [ ] **Step 5: Verify legacy DB gets renamed**

```bash
rm -f /tmp/dema-legacy.db* && node -e "
const Database = require('better-sqlite3');
const db = new Database('/tmp/dema-legacy.db');
db.exec(\"CREATE TABLE releases (id INTEGER PRIMARY KEY, title TEXT, tracks_json TEXT DEFAULT '[]')\");
db.exec('CREATE TABLE tracks (id INTEGER PRIMARY KEY, filename TEXT)');
db.prepare('INSERT INTO releases (title) VALUES (?)').run('Vell disc');
db.close();
" && DATABASE_PATH=/tmp/dema-legacy.db node -e "
(async () => {
  const { createDb } = require('./src/db');
  const api = await createDb();
  const legacy = api.db.prepare('SELECT COUNT(*) AS c FROM releases_legacy').get();
  const fresh = api.db.prepare('SELECT COUNT(*) AS c FROM releases').get();
  console.log('legacy rows:', legacy.c, '| new rows:', fresh.c);
  api.close();
})().catch(e => { console.error(e); process.exit(1); });
"
```
Expected: `legacy rows: 1 | new rows: 0`

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.js src/db/migrations/003_discography.js src/db/index.js
git commit -m "feat: new discography schema (songs/releases/release_songs), legacy tables renamed"
```

---

### Task 3: `src/db/songs.js` module

**Files:**
- Create: `src/db/songs.js`

- [ ] **Step 1: Create the module**

```js
/**
 * Songs domain: the song library. Audio fields back the retro music player.
 * All functions take (db, ...) like the other src/db modules.
 */

function normalizeText(value, maxLength = 1000) {
    if (typeof value !== 'string') return '';
    return value.replace(/<[^>]*>?/gm, '').trim().slice(0, maxLength);
}

/**
 * @param {number|null|undefined} seconds
 * @returns {string} "m:ss" or '' when unknown
 */
function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return '';
    const m = Math.floor(seconds / 60);
    const s = String(seconds % 60).padStart(2, '0');
    return `${m}:${s}`;
}

function mapSongRow(row) {
    if (!row) return null;
    return {
        id: row.id,
        title: row.title || '',
        durationSeconds: row.duration_seconds ?? null,
        duration: formatDuration(row.duration_seconds),
        lyrics: row.lyrics || '',
        recordedYear: row.recorded_year ?? null,
        recordedPlace: row.recorded_place || '',
        notes: row.notes || '',
        audioFilename: row.audio_filename || null,
        audioMime: row.audio_mime || null,
        playerOrder: row.player_order ?? null,
        hasAudio: Boolean(row.audio_filename),
        inPlayer: Boolean(row.audio_filename) && row.player_order != null
    };
}

/**
 * Normalize incoming song payloads. Audio fields are managed separately
 * (setSongAudio/clearSongAudio), never via this function.
 * @param {unknown} input
 */
function normalizeSong(input) {
    const incoming = input && typeof input === 'object' ? input : {};
    const duration = Number(incoming.durationSeconds);
    const year = Number(incoming.recordedYear);
    return {
        title: normalizeText(incoming.title || '', 200),
        durationSeconds: Number.isInteger(duration) && duration > 0 ? duration : null,
        lyrics: normalizeText(incoming.lyrics || '', 20000),
        recordedYear: Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : null,
        recordedPlace: normalizeText(incoming.recordedPlace || '', 200),
        notes: normalizeText(incoming.notes || '', 2000),
        showInPlayer: Boolean(incoming.showInPlayer)
    };
}

function getSongs(db) {
    const rows = db.prepare('SELECT * FROM songs ORDER BY title COLLATE NOCASE ASC, id ASC').all();
    return rows.map(mapSongRow);
}

function getSongById(db, id) {
    return mapSongRow(db.prepare('SELECT * FROM songs WHERE id = ?').get(id));
}

/** Songs shown in the retro player: audio present and player_order set. */
function getPlayerSongs(db) {
    const rows = db.prepare(`
        SELECT * FROM songs
        WHERE audio_filename IS NOT NULL AND player_order IS NOT NULL
        ORDER BY player_order ASC, id ASC
    `).all();
    return rows.map(mapSongRow);
}

function getNextPlayerOrder(db) {
    const row = db.prepare('SELECT MAX(player_order) AS maxOrder FROM songs').get();
    return (row?.maxOrder || 0) + 1;
}

/** Resolve desired player_order for a song given the showInPlayer flag. */
function resolvePlayerOrder(db, currentOrder, showInPlayer) {
    if (!showInPlayer) return null;
    return currentOrder != null ? currentOrder : getNextPlayerOrder(db);
}

function addSong(db, data) {
    const song = normalizeSong(data);
    if (!song.title) throw new Error('El títol de la cançó és obligatori');
    const result = db.prepare(`
        INSERT INTO songs (title, duration_seconds, lyrics, recorded_year, recorded_place, notes, player_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        song.title,
        song.durationSeconds,
        song.lyrics,
        song.recordedYear,
        song.recordedPlace,
        song.notes,
        resolvePlayerOrder(db, null, song.showInPlayer)
    );
    return getSongById(db, result.lastInsertRowid);
}

function updateSong(db, id, data) {
    const existing = db.prepare('SELECT * FROM songs WHERE id = ?').get(id);
    if (!existing) return null;
    const song = normalizeSong(data);
    if (!song.title) throw new Error('El títol de la cançó és obligatori');
    db.prepare(`
        UPDATE songs SET
            title = ?, duration_seconds = ?, lyrics = ?, recorded_year = ?,
            recorded_place = ?, notes = ?, player_order = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        song.title,
        song.durationSeconds,
        song.lyrics,
        song.recordedYear,
        song.recordedPlace,
        song.notes,
        resolvePlayerOrder(db, existing.player_order, song.showInPlayer),
        id
    );
    return getSongById(db, id);
}

/**
 * Delete a song. Returns the mapped song (so the route can delete the audio
 * file from disk) or null when not found. release_songs rows cascade.
 */
function deleteSong(db, id) {
    const song = getSongById(db, id);
    if (!song) return null;
    db.prepare('DELETE FROM songs WHERE id = ?').run(id);
    return song;
}

/**
 * Attach an uploaded audio file. Returns { song, previousFilename } so the
 * route can remove the replaced file from disk.
 */
function setSongAudio(db, id, { filename, mimeType }) {
    const existing = db.prepare('SELECT * FROM songs WHERE id = ?').get(id);
    if (!existing) return null;
    const playerOrder = existing.player_order != null ? existing.player_order : getNextPlayerOrder(db);
    db.prepare(`
        UPDATE songs SET audio_filename = ?, audio_mime = ?, player_order = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(filename, mimeType || null, playerOrder, id);
    return { song: getSongById(db, id), previousFilename: existing.audio_filename || null };
}

/** Detach audio. Returns { song, previousFilename } or null when not found. */
function clearSongAudio(db, id) {
    const existing = db.prepare('SELECT * FROM songs WHERE id = ?').get(id);
    if (!existing) return null;
    db.prepare(`
        UPDATE songs SET audio_filename = NULL, audio_mime = NULL, player_order = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(id);
    return { song: getSongById(db, id), previousFilename: existing.audio_filename || null };
}

function reorderPlayerSong(db, songId, targetIndex) {
    const current = getPlayerSongs(db);
    const fromIndex = current.findIndex((s) => Number(s.id) === Number(songId));
    if (fromIndex === -1) return { success: false, error: 'Cançó no trobada al reproductor' };
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= current.length) {
        return { success: false, error: 'Índex de destinació invàlid' };
    }
    if (fromIndex === targetIndex) return { success: true, songs: current };

    const reordered = [...current];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    const tx = db.transaction((items) => {
        const stmt = db.prepare('UPDATE songs SET player_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
        items.forEach((item, index) => stmt.run(index + 1, item.id));
    });
    tx(reordered);
    return { success: true, songs: getPlayerSongs(db) };
}

module.exports = {
    formatDuration,
    mapSongRow,
    normalizeSong,
    getSongs,
    getSongById,
    getPlayerSongs,
    addSong,
    updateSong,
    deleteSong,
    setSongAudio,
    clearSongAudio,
    reorderPlayerSong
};
```

- [ ] **Step 2: Verify with a smoke run**

```bash
rm -f /tmp/dema-songs.db* && node -e "
const Database = require('better-sqlite3');
const { runSchema } = require('./src/db/schema');
const songs = require('./src/db/songs');
const db = new Database('/tmp/dema-songs.db');
db.exec('PRAGMA foreign_keys = ON');
runSchema(db);
const a = songs.addSong(db, { title: 'Cançó A', durationSeconds: 223, lyrics: 'La la la', recordedYear: 2025, recordedPlace: 'Barcelona' });
console.log('added:', a.title, a.duration, a.recordedYear); // Cançó A 3:43 2025
const withAudio = songs.setSongAudio(db, a.id, { filename: 'x.mp3', mimeType: 'audio/mpeg' });
console.log('inPlayer:', withAudio.song.inPlayer, 'order:', withAudio.song.playerOrder); // true 1
const b = songs.addSong(db, { title: 'Cançó B' });
songs.setSongAudio(db, b.id, { filename: 'y.mp3', mimeType: 'audio/mpeg' });
const r = songs.reorderPlayerSong(db, b.id, 0);
console.log('player order:', r.songs.map(s => s.title).join(',')); // Cançó B,Cançó A
const cleared = songs.clearSongAudio(db, a.id);
console.log('cleared prev file:', cleared.previousFilename, 'player count:', songs.getPlayerSongs(db).length); // x.mp3 1
const deleted = songs.deleteSong(db, b.id);
console.log('deleted:', deleted.title, 'remaining:', songs.getSongs(db).length); // Cançó B 1
db.close();
"
```
Expected output (in order): `added: Cançó A 3:43 2025`, `inPlayer: true order: 1`, `player order: Cançó B,Cançó A`, `cleared prev file: x.mp3 player count: 1`, `deleted: Cançó B remaining: 1`

- [ ] **Step 3: Commit**

```bash
git add src/db/songs.js
git commit -m "feat: songs DB module (library + player audio)"
```

---

### Task 4: Rewrite `src/db/releases.js`

**Files:**
- Modify: `src/db/releases.js` (full rewrite — replace entire file content)

- [ ] **Step 1: Replace the file content**

```js
/**
 * Releases domain: albums, EPs, singles. Songs are linked via release_songs
 * with an explicit position. All functions take (db, ...).
 */
const songsModule = require('./songs');

const VALID_TYPES = new Set(['album', 'ep', 'single', 'other']);

function normalizeText(value, maxLength = 1000) {
    if (typeof value !== 'string') return '';
    return value.replace(/<[^>]*>?/gm, '').trim().slice(0, maxLength);
}

function mapReleaseRow(row, songRows = []) {
    if (!row) return null;
    return {
        id: row.id,
        title: row.title || '',
        type: row.type,
        releaseDate: row.release_date || null,
        year: row.release_date ? Number(row.release_date.slice(0, 4)) : null,
        cover: row.cover || '',
        description: row.description || '',
        recordedPlace: row.recorded_place || '',
        published: Boolean(row.published),
        streaming: {
            spotify: row.spotify || '',
            youtube: row.youtube || '',
            appleMusic: row.apple_music || ''
        },
        songs: songRows.map((songRow) => ({
            ...songsModule.mapSongRow(songRow),
            position: songRow.position
        }))
    };
}

/**
 * @param {unknown} input
 */
function normalizeRelease(input) {
    const incoming = input && typeof input === 'object' ? input : {};
    const type = typeof incoming.type === 'string' ? incoming.type.trim().toLowerCase() : '';
    const releaseDate = typeof incoming.releaseDate === 'string' ? incoming.releaseDate.trim() : '';
    return {
        title: normalizeText(incoming.title || '', 200),
        type: VALID_TYPES.has(type) ? type : null,
        releaseDate: /^\d{4}-\d{2}-\d{2}$/.test(releaseDate) ? releaseDate : null,
        cover: normalizeText(incoming.cover || '', 400),
        description: normalizeText(incoming.description || '', 2000),
        recordedPlace: normalizeText(incoming.recordedPlace || '', 200),
        published: incoming.published === undefined ? true : Boolean(incoming.published),
        streaming: {
            spotify: normalizeText(incoming.streaming?.spotify || '', 1000),
            youtube: normalizeText(incoming.streaming?.youtube || '', 1000),
            appleMusic: normalizeText(incoming.streaming?.appleMusic || '', 1000)
        }
    };
}

const RELEASE_ORDER_SQL = `
    ORDER BY
        CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END,
        sort_order ASC,
        CASE WHEN release_date IS NULL OR release_date = '' THEN 1 ELSE 0 END,
        release_date DESC,
        id DESC
`;

const RELEASE_SONGS_SQL = `
    SELECT s.*, rs.position FROM release_songs rs
    JOIN songs s ON s.id = rs.song_id
    WHERE rs.release_id = ?
    ORDER BY rs.position ASC
`;

/**
 * @param {import('better-sqlite3').Database} db
 * @param {{ includeDrafts?: boolean }} [options]
 */
function getReleases(db, options = {}) {
    const where = options.includeDrafts ? '' : 'WHERE published = 1';
    const rows = db.prepare(`SELECT * FROM releases ${where} ${RELEASE_ORDER_SQL}`).all();
    const songsStmt = db.prepare(RELEASE_SONGS_SQL);
    return rows.map((row) => mapReleaseRow(row, songsStmt.all(row.id)));
}

function getReleaseById(db, id) {
    const row = db.prepare('SELECT * FROM releases WHERE id = ?').get(id);
    if (!row) return null;
    return mapReleaseRow(row, db.prepare(RELEASE_SONGS_SQL).all(id));
}

function getNextReleaseOrder(db) {
    const row = db.prepare('SELECT MAX(sort_order) AS maxOrder FROM releases').get();
    return (row?.maxOrder || 0) + 1;
}

function addRelease(db, releaseData) {
    const release = normalizeRelease(releaseData);
    if (!release.title) throw new Error('El títol del llançament és obligatori');
    if (!release.type) throw new Error('El tipus de llançament és invàlid');

    const result = db.prepare(`
        INSERT INTO releases (
            title, type, release_date, cover, description, recorded_place,
            spotify, youtube, apple_music, published, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        release.title,
        release.type,
        release.releaseDate,
        release.cover,
        release.description,
        release.recordedPlace,
        release.streaming.spotify,
        release.streaming.youtube,
        release.streaming.appleMusic,
        release.published ? 1 : 0,
        getNextReleaseOrder(db)
    );
    return getReleaseById(db, result.lastInsertRowid);
}

function updateRelease(db, id, releaseData) {
    const release = normalizeRelease(releaseData);
    if (!release.title) throw new Error('El títol del llançament és obligatori');
    if (!release.type) throw new Error('El tipus de llançament és invàlid');

    const result = db.prepare(`
        UPDATE releases SET
            title = ?, type = ?, release_date = ?, cover = ?, description = ?,
            recorded_place = ?, spotify = ?, youtube = ?, apple_music = ?,
            published = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        release.title,
        release.type,
        release.releaseDate,
        release.cover,
        release.description,
        release.recordedPlace,
        release.streaming.spotify,
        release.streaming.youtube,
        release.streaming.appleMusic,
        release.published ? 1 : 0,
        id
    );
    if (result.changes === 0) return null;
    return getReleaseById(db, id);
}

/**
 * Update only the cover. Returns { release, previousCover } or null.
 */
function setReleaseCover(db, id, cover) {
    const existing = db.prepare('SELECT * FROM releases WHERE id = ?').get(id);
    if (!existing) return null;
    db.prepare('UPDATE releases SET cover = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(normalizeText(cover || '', 400), id);
    return { release: getReleaseById(db, id), previousCover: existing.cover || '' };
}

/** Returns the mapped release (so routes can delete the cover file) or null. */
function deleteRelease(db, id) {
    const release = getReleaseById(db, id);
    if (!release) return null;
    db.prepare('DELETE FROM releases WHERE id = ?').run(id);
    return release;
}

/**
 * Replace the tracklist of a release with the given ordered song ids.
 * Unknown song ids are rejected. Duplicates are collapsed (first occurrence wins).
 * @param {number} releaseId
 * @param {unknown[]} songIds
 */
function setReleaseSongs(db, releaseId, songIds) {
    const release = db.prepare('SELECT id FROM releases WHERE id = ?').get(releaseId);
    if (!release) return { success: false, error: 'Llançament no trobat' };

    const ids = [...new Set((Array.isArray(songIds) ? songIds : []).map((v) => Number(v)))];
    if (ids.some((v) => !Number.isInteger(v) || v <= 0)) {
        return { success: false, error: 'Identificadors de cançó invàlids' };
    }
    const exists = db.prepare('SELECT id FROM songs WHERE id = ?');
    for (const songId of ids) {
        if (!exists.get(songId)) return { success: false, error: `Cançó ${songId} no trobada` };
    }

    const tx = db.transaction(() => {
        db.prepare('DELETE FROM release_songs WHERE release_id = ?').run(releaseId);
        const insert = db.prepare(
            'INSERT INTO release_songs (release_id, song_id, position) VALUES (?, ?, ?)'
        );
        ids.forEach((songId, index) => insert.run(releaseId, songId, index + 1));
    });
    tx();
    return { success: true, release: getReleaseById(db, releaseId) };
}

function reorderRelease(db, releaseId, targetIndex) {
    const current = getReleases(db, { includeDrafts: true });
    const fromIndex = current.findIndex((r) => Number(r.id) === Number(releaseId));
    if (fromIndex === -1) return { success: false, error: 'Llançament no trobat' };
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= current.length) {
        return { success: false, error: 'Índex de destinació invàlid' };
    }
    if (fromIndex === targetIndex) return { success: true, releases: current };

    const reordered = [...current];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    const tx = db.transaction((items) => {
        const stmt = db.prepare(
            'UPDATE releases SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        );
        items.forEach((item, index) => stmt.run(index + 1, item.id));
    });
    tx(reordered);
    return { success: true, releases: getReleases(db, { includeDrafts: true }) };
}

module.exports = {
    VALID_TYPES,
    mapReleaseRow,
    normalizeRelease,
    getReleases,
    getReleaseById,
    addRelease,
    updateRelease,
    setReleaseCover,
    deleteRelease,
    setReleaseSongs,
    reorderRelease
};
```

- [ ] **Step 2: Verify with a smoke run (many-to-many + cascade + drafts)**

```bash
rm -f /tmp/dema-rel.db* && node -e "
const Database = require('better-sqlite3');
const { runSchema } = require('./src/db/schema');
const songs = require('./src/db/songs');
const releases = require('./src/db/releases');
const db = new Database('/tmp/dema-rel.db');
db.exec('PRAGMA foreign_keys = ON');
runSchema(db);
const s1 = songs.addSong(db, { title: 'Single Song', durationSeconds: 200 });
const s2 = songs.addSong(db, { title: 'Album Only' });
const single = releases.addRelease(db, { title: 'El Single', type: 'single', releaseDate: '2025-03-01' });
const lp = releases.addRelease(db, { title: 'El Disc', type: 'album', releaseDate: '2026-01-15', published: false });
releases.setReleaseSongs(db, single.id, [s1.id]);
releases.setReleaseSongs(db, lp.id, [s2.id, s1.id]);
console.log('lp tracklist:', releases.getReleaseById(db, lp.id).songs.map(s => s.title + '@' + s.position).join(','));
console.log('published only:', releases.getReleases(db).map(r => r.title).join(','));
console.log('with drafts:', releases.getReleases(db, { includeDrafts: true }).length);
console.log('year derived:', releases.getReleaseById(db, lp.id).year);
songs.deleteSong(db, s1.id);
console.log('after song delete:', releases.getReleaseById(db, lp.id).songs.map(s => s.title).join(','));
const bad = releases.setReleaseSongs(db, lp.id, [9999]);
console.log('bad ids rejected:', bad.success === false);
console.log('invalid type throws:', (() => { try { releases.addRelease(db, { title: 'X', type: 'mixtape' }); return false; } catch { return true; } })());
db.close();
"
```
Expected output: `lp tracklist: Album Only@1,Single Song@2`, `published only: El Single`, `with drafts: 2`, `year derived: 2026`, `after song delete: Album Only`, `bad ids rejected: true`, `invalid type throws: true`

- [ ] **Step 3: Commit**

```bash
git add src/db/releases.js
git commit -m "feat: rewrite releases DB module on normalized schema"
```

---

### Task 5: Rewire the facade, delete `tracks.js`

**Files:**
- Modify: `src/db/index.js`
- Delete: `src/db/tracks.js`

- [ ] **Step 1: Update imports and uploads dirs in `src/db/index.js`**

Replace (lines 11-12):
```js
const releases = require('./releases');
const tracksModule = require('./tracks');
```
with:
```js
const releases = require('./releases');
const songs = require('./songs');
```

In the uploads mkdir block (lines 21-24), add the covers dir:
```js
    if (config.uploads) {
        await fs.mkdir(config.uploads.galleryPath, { recursive: true });
        await fs.mkdir(config.uploads.tracksPath, { recursive: true });
        await fs.mkdir(config.uploads.coversPath, { recursive: true });
    }
```

- [ ] **Step 2: Replace the discography portion of the returned facade**

Replace `getBandInfo`/`updateBandInfo` (lines 94-112) with (discography is read-only here now; releases are managed only via their own endpoints):

```js
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
            return {
                ...base,
                discography: { releases: releases.getReleases(db) }
            };
        },
```

Replace the releases facade block (lines 114-119) and the whole tracks facade block (lines 121-127) with:

```js
        getReleases: (options) => releases.getReleases(db, options),
        getReleaseById: (id) => releases.getReleaseById(db, id),
        addRelease: (data) => releases.addRelease(db, data),
        updateRelease: (id, data) => releases.updateRelease(db, id, data),
        setReleaseCover: (id, cover) => releases.setReleaseCover(db, id, cover),
        deleteRelease: (id) => releases.deleteRelease(db, id),
        setReleaseSongs: (releaseId, songIds) => releases.setReleaseSongs(db, releaseId, songIds),
        reorderRelease: (releaseId, targetIndex) => releases.reorderRelease(db, releaseId, targetIndex),

        getSongs: () => songs.getSongs(db),
        getSongById: (id) => songs.getSongById(db, id),
        getPlayerSongs: () => songs.getPlayerSongs(db),
        addSong: (data) => songs.addSong(db, data),
        updateSong: (id, data) => songs.updateSong(db, id, data),
        deleteSong: (id) => songs.deleteSong(db, id),
        setSongAudio: (id, data) => songs.setSongAudio(db, id, data),
        clearSongAudio: (id) => songs.clearSongAudio(db, id),
        reorderPlayerSong: (songId, targetIndex) => songs.reorderPlayerSong(db, songId, targetIndex),
```

- [ ] **Step 3: Delete the tracks module**

```bash
git rm src/db/tracks.js
```

- [ ] **Step 4: Verify the facade boots and round-trips**

```bash
rm -f /tmp/dema-facade.db* && DATABASE_PATH=/tmp/dema-facade.db node -e "
(async () => {
  const { createDb } = require('./src/db');
  const api = await createDb();
  const song = api.addSong({ title: 'Prova', durationSeconds: 100 });
  const rel = api.addRelease({ title: 'Prova EP', type: 'ep', releaseDate: '2026-06-01' });
  api.setReleaseSongs(rel.id, [song.id]);
  const info = api.getBandInfo();
  console.log('discography releases:', info.discography.releases.length);
  console.log('first song:', info.discography.releases[0].songs[0].title);
  console.log('player songs:', api.getPlayerSongs().length);
  api.close();
})().catch(e => { console.error(e); process.exit(1); });
"
```
Expected: `discography releases: 1`, `first song: Prova`, `player songs: 0`

- [ ] **Step 5: Commit**

```bash
git add src/db/index.js
git commit -m "feat: facade exposes songs + normalized releases, drop tracks module"
```

---

### Task 6: Public API routes

**Files:**
- Modify: `src/routes/api.js`

- [ ] **Step 1: Replace the tracks endpoints (lines 110-143)**

The response shape of `GET /api/tracks` is kept verbatim so the DemAmp player in `public/js/script.js` needs no changes. Replace both `/tracks` handlers with:

```js
    router.get('/tracks', async (req, res, next) => {
        try {
            const list = db.getPlayerSongs();
            const baseUrl = '/api/tracks/file';
            const tracks = list.map((s) => ({
                id: s.id,
                src: `${baseUrl}/${s.id}`,
                name: s.title,
                filename: s.audioFilename
            }));
            res.json({ tracks });
        } catch (error) {
            next(error);
        }
    });

    router.get('/tracks/file/:id', async (req, res, next) => {
        try {
            const id = parseInt(req.params.id, 10);
            if (!Number.isFinite(id)) return res.status(400).json({ error: 'Identificador invàlid' });
            const song = db.getSongById(id);
            if (!song || !song.audioFilename) return res.status(404).json({ error: 'No trobat' });
            const tracksPath = config.uploads?.tracksPath || path.join(process.cwd(), 'public', 'assets', 'audio', 'tracks');
            const filePath = path.join(tracksPath, song.audioFilename);
            await fs.access(filePath);
            res.setHeader('Content-Type', song.audioMime || 'audio/mpeg');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            const { createReadStream } = require('fs');
            createReadStream(filePath).pipe(res);
        } catch (err) {
            if (err.code === 'ENOENT') return res.status(404).json({ error: 'No trobat' });
            next(err);
        }
    });
```

- [ ] **Step 2: Add the covers file route (after the tracks routes)**

```js
    router.get('/covers/:filename', async (req, res, next) => {
        try {
            const filename = req.params.filename;
            if (!filename || !/^[A-Za-z0-9._-]+$/.test(filename) || filename.includes('..')) {
                return res.status(400).json({ error: 'Nom de fitxer invàlid' });
            }
            const coversPath = config.uploads?.coversPath || path.join(process.cwd(), 'public', 'assets', 'covers');
            const filePath = path.join(coversPath, filename);
            await fs.access(filePath);
            res.setHeader('Cache-Control', 'public, max-age=86400');
            const { createReadStream } = require('fs');
            createReadStream(filePath).pipe(res);
        } catch (err) {
            if (err.code === 'ENOENT') return res.status(404).json({ error: 'No trobat' });
            next(err);
        }
    });
```

`GET /api/releases` (line 57) needs no change — `db.getReleases()` now returns published releases with embedded songs by default.

- [ ] **Step 3: Verify with the dev server**

```bash
rm -f /tmp/dema-api.db* && DATABASE_PATH=/tmp/dema-api.db PORT=3199 node server.js &
sleep 2
curl -s http://localhost:3199/api/releases
curl -s http://localhost:3199/api/tracks
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3199/api/covers/nope.jpg
kill %1
```
Expected: `{"releases":[]}`, `{"tracks":[]}`, `404`

- [ ] **Step 4: Commit**

```bash
git add src/routes/api.js
git commit -m "feat: public API — player tracks backed by songs, covers route"
```

---

### Task 7: Admin API — songs and releases JSON endpoints

**Files:**
- Modify: `src/routes/adminApi.js`

- [ ] **Step 1: Replace the old releases endpoints (lines 144-203) with the new set**

Delete the existing `POST /releases`, `PUT /releases/:id`, `DELETE /releases/:id`, `POST /releases/reorder` handlers and insert (note: file deletion for covers/audio lives in the upload router, Task 8 — these handlers return the deleted entity's file info to it via `db`):

```js
    // ---- Cançons ----

    router.get('/songs', (req, res, next) => {
        try {
            res.json({ songs: db.getSongs() });
        } catch (error) {
            next(error);
        }
    });

    router.post('/songs', (req, res, next) => {
        try {
            if (hasReplacementCharsDeep(req.body)) {
                return res.status(400).json({ error: 'Codificació de text invàlida. Desa amb UTF-8.' });
            }
            if (!sanitizeString(req.body?.title || '', 200)) {
                return res.status(400).json({ error: 'El títol de la cançó és obligatori' });
            }
            res.json({ success: true, song: db.addSong(req.body) });
        } catch (error) {
            next(error);
        }
    });

    router.put('/songs/:id', (req, res, next) => {
        try {
            const songId = parseInt(req.params.id, 10);
            if (Number.isNaN(songId)) return res.status(400).json({ error: 'Identificador de cançó invàlid' });
            if (hasReplacementCharsDeep(req.body)) {
                return res.status(400).json({ error: 'Codificació de text invàlida. Desa amb UTF-8.' });
            }
            if (!sanitizeString(req.body?.title || '', 200)) {
                return res.status(400).json({ error: 'El títol de la cançó és obligatori' });
            }
            const updated = db.updateSong(songId, req.body);
            if (!updated) return res.status(404).json({ error: 'Cançó no trobada' });
            res.json({ success: true, song: updated });
        } catch (error) {
            next(error);
        }
    });

    router.post('/songs/player-reorder', (req, res, next) => {
        try {
            const songId = parseInt(req.body?.songId, 10);
            const targetIndex = parseInt(req.body?.targetIndex, 10);
            if (Number.isNaN(songId) || Number.isNaN(targetIndex)) {
                return res.status(400).json({ error: 'Paràmetres de reordenació invàlids' });
            }
            const result = db.reorderPlayerSong(songId, targetIndex);
            if (!result.success) return res.status(400).json({ error: result.error });
            res.json({ success: true, songs: result.songs });
        } catch (error) {
            next(error);
        }
    });

    // ---- Llançaments ----

    router.get('/releases', (req, res, next) => {
        try {
            res.json({ releases: db.getReleases({ includeDrafts: true }) });
        } catch (error) {
            next(error);
        }
    });

    router.post('/releases', (req, res, next) => {
        try {
            if (hasReplacementCharsDeep(req.body)) {
                return res.status(400).json({ error: 'Codificació de text invàlida. Desa amb UTF-8.' });
            }
            if (!sanitizeString(req.body?.title || '', 200)) {
                return res.status(400).json({ error: 'El títol del llançament és obligatori' });
            }
            res.json({ success: true, release: db.addRelease(req.body) });
        } catch (error) {
            if (/invàlid|obligatori/.test(error.message)) {
                return res.status(400).json({ error: error.message });
            }
            next(error);
        }
    });

    router.put('/releases/:id', (req, res, next) => {
        try {
            const releaseId = parseInt(req.params.id, 10);
            if (Number.isNaN(releaseId)) return res.status(400).json({ error: 'Identificador de llançament invàlid' });
            if (hasReplacementCharsDeep(req.body)) {
                return res.status(400).json({ error: 'Codificació de text invàlida. Desa amb UTF-8.' });
            }
            if (!sanitizeString(req.body?.title || '', 200)) {
                return res.status(400).json({ error: 'El títol del llançament és obligatori' });
            }
            const updated = db.updateRelease(releaseId, req.body);
            if (!updated) return res.status(404).json({ error: 'Llançament no trobat' });
            res.json({ success: true, release: updated });
        } catch (error) {
            if (/invàlid|obligatori/.test(error.message)) {
                return res.status(400).json({ error: error.message });
            }
            next(error);
        }
    });

    router.put('/releases/:id/songs', (req, res, next) => {
        try {
            const releaseId = parseInt(req.params.id, 10);
            if (Number.isNaN(releaseId)) return res.status(400).json({ error: 'Identificador de llançament invàlid' });
            const result = db.setReleaseSongs(releaseId, req.body?.songIds);
            if (!result.success) {
                const status = result.error === 'Llançament no trobat' ? 404 : 400;
                return res.status(status).json({ error: result.error });
            }
            res.json({ success: true, release: result.release });
        } catch (error) {
            next(error);
        }
    });

    router.post('/releases/reorder', (req, res, next) => {
        try {
            const releaseId = parseInt(req.body?.releaseId, 10);
            const targetIndex = parseInt(req.body?.targetIndex, 10);
            if (Number.isNaN(releaseId) || Number.isNaN(targetIndex)) {
                return res.status(400).json({ error: 'Paràmetres de reordenació invàlids' });
            }
            const result = db.reorderRelease(releaseId, targetIndex);
            if (!result.success) {
                const status = result.error === 'Llançament no trobat' ? 404 : 400;
                return res.status(status).json({ error: result.error });
            }
            res.json({ success: true, releases: result.releases });
        } catch (error) {
            next(error);
        }
    });
```

(`DELETE /songs/:id` and `DELETE /releases/:id` live in Task 8's upload router because they must also remove files from disk.)

- [ ] **Step 2: Verify with an authenticated session**

```bash
rm -f /tmp/dema-admin.db* && DATABASE_PATH=/tmp/dema-admin.db PORT=3199 ADMIN_PASSWORD=provatest node server.js &
sleep 2
curl -s -c /tmp/dema-cookies.txt -H 'Content-Type: application/json' \
  -d '{"password":"provatest"}' http://localhost:3199/admin/api/login
curl -s -b /tmp/dema-cookies.txt -H 'Content-Type: application/json' \
  -d '{"title":"Cançó Admin","durationSeconds":185}' http://localhost:3199/admin/api/songs
curl -s -b /tmp/dema-cookies.txt -H 'Content-Type: application/json' \
  -d '{"title":"EP Admin","type":"ep","releaseDate":"2026-06-12","published":false}' http://localhost:3199/admin/api/releases
curl -s -b /tmp/dema-cookies.txt -X PUT -H 'Content-Type: application/json' \
  -d '{"songIds":[1]}' http://localhost:3199/admin/api/releases/1/songs
curl -s -b /tmp/dema-cookies.txt -H 'Content-Type: application/json' \
  -d '{"title":"Dolent","type":"mixtape"}' http://localhost:3199/admin/api/releases
curl -s http://localhost:3199/api/releases
kill %1
```
Expected: login `{"success":true,...}`; song and release created with `"success":true`; tracklist set returns the release with `"songs":[{...Cançó Admin...}]`; invalid type returns `{"error":"El tipus de llançament és invàlid"}`; final public call returns `{"releases":[]}` (the EP is a draft).

- [ ] **Step 3: Commit**

```bash
git add src/routes/adminApi.js
git commit -m "feat: admin API for songs and normalized releases"
```

---

### Task 8: Admin upload routes — song audio, release covers, deletes with file cleanup

**Files:**
- Modify: `src/routes/admin.js`

- [ ] **Step 1: Add covers dir helper and multer config**

In `src/routes/admin.js`, after `getTracksDir`/`ensureTracksDir` (lines 16-34), add:

```js
function getCoversDir() {
    return config.uploads?.coversPath || path.join(process.cwd(), 'public', 'assets', 'covers');
}

function ensureCoversDir() {
    const dir = getCoversDir();
    try {
        fsSync.mkdirSync(dir, { recursive: true });
    } catch (e) {}
    return dir;
}
```

Replace the track multer block (lines 94-120) with audio + cover uploaders:

```js
// Multer for song audio (reuses the tracks upload dir)
const audioStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        try {
            cb(null, ensureTracksDir());
        } catch (err) {
            cb(err);
        }
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
        cb(null, randomUUID() + (ext || ''));
    }
});

const uploadAudio = multer({
    storage: audioStorage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: function (req, file, cb) {
        const name = file.originalname.toLowerCase();
        if (name.endsWith('.mp3') || name.endsWith('.wav')) {
            cb(null, true);
        } else {
            cb(new Error('Només es permeten fitxers .mp3 i .wav'), false);
        }
    }
}).single('audio');

// Multer for release covers
const coverStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        try {
            cb(null, ensureCoversDir());
        } catch (err) {
            cb(err);
        }
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
        cb(null, randomUUID() + (ext || ''));
    }
});

const uploadCover = multer({
    storage: coverStorage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('La portada ha de ser una imatge'), false);
    }
}).single('cover');
```

- [ ] **Step 2: Replace the track routes with song/release file routes**

Inside `module.exports = (db) => { ... }`, delete the `/add-track` and `/delete-track` routes (lines 161-211) and add:

```js
    // Helper: delete a cover file referenced as /api/covers/<filename>
    async function deleteCoverFile(cover) {
        const prefix = '/api/covers/';
        if (!cover || !cover.startsWith(prefix)) return;
        const filename = cover.slice(prefix.length);
        if (!filename || filename.includes('..') || filename.includes('/')) return;
        try {
            await fs.unlink(path.join(getCoversDir(), filename));
        } catch (e) {
            console.warn('No s\'ha pogut eliminar la portada:', e.message);
        }
    }

    async function deleteAudioFile(filename) {
        if (!filename) return;
        try {
            await fs.unlink(path.join(getTracksDir(), filename));
        } catch (e) {
            console.warn('No s\'ha pogut eliminar el fitxer d\'àudio:', e.message);
        }
    }

    router.post('/songs/:id/audio', requireAuth, (req, res) => {
        uploadAudio(req, res, async (err) => {
            if (err) {
                return res.status(400).json({ error: err.message || 'Error pujant l\'àudio' });
            }
            if (!req.file) {
                return res.status(400).json({ error: 'No s\'ha pujat cap fitxer d\'àudio' });
            }
            const songId = parseInt(req.params.id, 10);
            const result = Number.isNaN(songId)
                ? null
                : db.setSongAudio(songId, { filename: req.file.filename, mimeType: req.file.mimetype });
            if (!result) {
                await deleteAudioFile(req.file.filename);
                return res.status(404).json({ error: 'Cançó no trobada' });
            }
            await deleteAudioFile(result.previousFilename);
            res.json({ success: true, song: result.song });
        });
    });

    router.delete('/songs/:id/audio', requireAuth, async (req, res) => {
        const songId = parseInt(req.params.id, 10);
        const result = Number.isNaN(songId) ? null : db.clearSongAudio(songId);
        if (!result) return res.status(404).json({ error: 'Cançó no trobada' });
        await deleteAudioFile(result.previousFilename);
        res.json({ success: true, song: result.song });
    });

    router.delete('/songs/:id', requireAuth, async (req, res) => {
        const songId = parseInt(req.params.id, 10);
        const deleted = Number.isNaN(songId) ? null : db.deleteSong(songId);
        if (!deleted) return res.status(404).json({ error: 'Cançó no trobada' });
        await deleteAudioFile(deleted.audioFilename);
        res.json({ success: true });
    });

    router.post('/releases/:id/cover', requireAuth, (req, res) => {
        uploadCover(req, res, async (err) => {
            if (err) {
                return res.status(400).json({ error: err.message || 'Error pujant la portada' });
            }
            if (!req.file) {
                return res.status(400).json({ error: 'No s\'ha pujat cap imatge' });
            }
            const releaseId = parseInt(req.params.id, 10);
            const result = Number.isNaN(releaseId)
                ? null
                : db.setReleaseCover(releaseId, `/api/covers/${req.file.filename}`);
            if (!result) {
                try {
                    await fs.unlink(path.join(getCoversDir(), req.file.filename));
                } catch (e) {}
                return res.status(404).json({ error: 'Llançament no trobat' });
            }
            await deleteCoverFile(result.previousCover);
            res.json({ success: true, release: result.release });
        });
    });

    router.delete('/releases/:id', requireAuth, async (req, res) => {
        const releaseId = parseInt(req.params.id, 10);
        const deleted = Number.isNaN(releaseId) ? null : db.deleteRelease(releaseId);
        if (!deleted) return res.status(404).json({ error: 'Llançament no trobat' });
        await deleteCoverFile(deleted.cover);
        res.json({ success: true });
    });
```

- [ ] **Step 3: Verify uploads end-to-end**

```bash
rm -f /tmp/dema-up.db* && DATABASE_PATH=/tmp/dema-up.db PORT=3199 ADMIN_PASSWORD=provatest node server.js &
sleep 2
curl -s -c /tmp/dema-cookies.txt -H 'Content-Type: application/json' -d '{"password":"provatest"}' http://localhost:3199/admin/api/login
curl -s -b /tmp/dema-cookies.txt -H 'Content-Type: application/json' -d '{"title":"Amb Àudio"}' http://localhost:3199/admin/api/songs
# tiny fake mp3 + png
printf 'ID3fakeaudio' > /tmp/prova.mp3
printf '\x89PNG\r\n\x1a\nfakepng' > /tmp/prova.png
curl -s -b /tmp/dema-cookies.txt -F 'audio=@/tmp/prova.mp3' http://localhost:3199/admin/api/songs/1/audio
curl -s http://localhost:3199/api/tracks
curl -s -b /tmp/dema-cookies.txt -H 'Content-Type: application/json' -d '{"title":"Amb Portada","type":"single"}' http://localhost:3199/admin/api/releases
curl -s -b /tmp/dema-cookies.txt -F 'cover=@/tmp/prova.png' http://localhost:3199/admin/api/releases/1/cover
curl -s -b /tmp/dema-cookies.txt -X DELETE http://localhost:3199/admin/api/songs/1
curl -s http://localhost:3199/api/tracks
kill %1
```
Expected: audio upload returns the song with `"hasAudio":true,"inPlayer":true`; `/api/tracks` then lists one track; cover upload returns the release with `"cover":"/api/covers/<uuid>.png"`; after the song delete, `/api/tracks` returns `{"tracks":[]}` and the uploaded mp3 is gone from `public/assets/audio/tracks/`.

- [ ] **Step 4: Commit**

```bash
git add src/routes/admin.js
git commit -m "feat: admin upload routes for song audio and release covers"
```

---

### Task 9: Admin UI — Cançons tab

**Files:**
- Create: `public/js/admin/songs-admin.js`
- Modify: `public/admin.html`

- [ ] **Step 1: Replace the "Pistes d'Àudio" section markup in `public/admin.html`**

Change the tab button (line 235) to:

```html
        <button type="button" class="admin-tab" data-view="view-songs" onclick="switchAdminView('view-songs')">Cançons</button>
```

Replace the whole `view-tracks` section (`<div class="form-section admin-view" id="view-tracks">` through its closing `</div>`, lines 239-254) with:

```html
    <div class="form-section admin-view" id="view-songs">
        <h2>🎵 Cançons</h2>
        <form id="songForm" onsubmit="return false;">
            <input type="hidden" id="songIdInput">
            <div class="form-group">
                <label for="songTitleInput">Títol:</label>
                <input type="text" id="songTitleInput" required>
            </div>
            <div class="form-group">
                <label for="songDurationInput">Durada (m:ss):</label>
                <input type="text" id="songDurationInput" placeholder="3:43" pattern="^\d{1,2}:[0-5]\d$">
            </div>
            <div class="form-group">
                <label for="songYearInput">Any de gravació:</label>
                <input type="number" id="songYearInput" min="1900" max="2100">
            </div>
            <div class="form-group">
                <label for="songPlaceInput">Lloc de gravació:</label>
                <input type="text" id="songPlaceInput" placeholder="Ex: Estudi XYZ, Barcelona">
            </div>
            <div class="form-group">
                <label for="songLyricsInput">Lletra:</label>
                <textarea id="songLyricsInput" rows="8" style="width:100%;"></textarea>
            </div>
            <div class="form-group">
                <label for="songNotesInput">Notes / crèdits:</label>
                <textarea id="songNotesInput" rows="3" style="width:100%;"></textarea>
            </div>
            <div class="form-group">
                <label><input type="checkbox" id="songInPlayerInput"> Mostrar al reproductor (cal àudio pujat)</label>
            </div>
            <button type="button" id="saveSongBtn" onclick="saveSong()">Guardar cançó</button>
            <button type="button" onclick="resetSongForm()">Cancel·lar</button>
        </form>
        <hr>
        <div id="songsList"></div>
        <h3>Ordre del reproductor</h3>
        <div id="playerOrderList"></div>
    </div>
```

Delete the old inline tracks JS in `admin.html`: the `loadTracks` function and its upload/delete handlers (lines ~1915-1990, including the `document.querySelector('[data-view="view-tracks"]').addEventListener('click', loadTracks);` line). Also delete the old tracks upload `<form>` references if any remain.

Before the closing `</body>` add (alongside the existing `admin-common.js` script tag):

```html
    <script src="js/admin/songs-admin.js"></script>
```

- [ ] **Step 2: Create `public/js/admin/songs-admin.js`**

```js
/**
 * Admin: Cançons — song library CRUD, audio upload, player ordering.
 * Depends on admin-common.js (apiRequest, apiUploadRequest, escapeHtml, showMessage).
 */
let adminSongs = [];

function parseDurationInput(value) {
    const match = /^(\d{1,2}):([0-5]\d)$/.exec(String(value || '').trim());
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
}

async function loadSongs() {
    try {
        const response = await apiRequest('/admin/api/songs');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        adminSongs = Array.isArray(data.songs) ? data.songs : [];
        renderSongsList();
        renderPlayerOrder();
        if (typeof renderReleaseSongPicker === 'function') renderReleaseSongPicker();
    } catch (error) {
        console.error('Error carregant cançons:', error);
        showMessage('Error carregant les cançons', 'error');
    }
}

function renderSongsList() {
    const container = document.getElementById('songsList');
    if (!container) return;
    if (adminSongs.length === 0) {
        container.innerHTML = '<p>Encara no hi ha cançons.</p>';
        return;
    }
    container.innerHTML = adminSongs.map((song) => `
        <div class="sunken-panel" style="padding:8px; margin-bottom:8px; display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
            <strong>${escapeHtml(song.title)}</strong>
            <span>${escapeHtml(song.duration || '—')}</span>
            <span>${song.recordedYear || ''}</span>
            <span>${song.hasAudio ? '🔊 àudio' : ''}</span>
            <span>${song.inPlayer ? '▶ al reproductor' : ''}</span>
            <span style="margin-left:auto; display:flex; gap:6px;">
                <label style="cursor:pointer;">
                    📤 Àudio<input type="file" accept=".mp3,.wav" style="display:none"
                        onchange="uploadSongAudio(${song.id}, this)">
                </label>
                ${song.hasAudio ? `<button type="button" onclick="removeSongAudio(${song.id})">🔇</button>` : ''}
                <button type="button" onclick="editSong(${song.id})">✏️</button>
                <button type="button" onclick="deleteSongAdmin(${song.id})">🗑️</button>
            </span>
        </div>
    `).join('');
}

function renderPlayerOrder() {
    const container = document.getElementById('playerOrderList');
    if (!container) return;
    const playerSongs = adminSongs
        .filter((s) => s.inPlayer)
        .sort((a, b) => (a.playerOrder || 0) - (b.playerOrder || 0));
    if (playerSongs.length === 0) {
        container.innerHTML = '<p>Cap cançó al reproductor.</p>';
        return;
    }
    container.innerHTML = playerSongs.map((song, index) => `
        <div class="sunken-panel" style="padding:6px; margin-bottom:4px; display:flex; gap:8px; align-items:center;">
            <span>${index + 1}. ${escapeHtml(song.title)}</span>
            <span style="margin-left:auto;">
                <button type="button" ${index === 0 ? 'disabled' : ''} onclick="movePlayerSong(${song.id}, ${index - 1})">⬆️</button>
                <button type="button" ${index === playerSongs.length - 1 ? 'disabled' : ''} onclick="movePlayerSong(${song.id}, ${index + 1})">⬇️</button>
            </span>
        </div>
    `).join('');
}

function songFormData() {
    return {
        title: document.getElementById('songTitleInput').value.trim(),
        durationSeconds: parseDurationInput(document.getElementById('songDurationInput').value),
        recordedYear: Number(document.getElementById('songYearInput').value) || undefined,
        recordedPlace: document.getElementById('songPlaceInput').value.trim(),
        lyrics: document.getElementById('songLyricsInput').value,
        notes: document.getElementById('songNotesInput').value.trim(),
        showInPlayer: document.getElementById('songInPlayerInput').checked
    };
}

function resetSongForm() {
    document.getElementById('songIdInput').value = '';
    document.getElementById('songForm').reset();
    document.getElementById('saveSongBtn').textContent = 'Guardar cançó';
}

function editSong(id) {
    const song = adminSongs.find((s) => s.id === id);
    if (!song) return;
    document.getElementById('songIdInput').value = song.id;
    document.getElementById('songTitleInput').value = song.title;
    document.getElementById('songDurationInput').value = song.duration || '';
    document.getElementById('songYearInput').value = song.recordedYear || '';
    document.getElementById('songPlaceInput').value = song.recordedPlace || '';
    document.getElementById('songLyricsInput').value = song.lyrics || '';
    document.getElementById('songNotesInput').value = song.notes || '';
    document.getElementById('songInPlayerInput').checked = song.inPlayer;
    document.getElementById('saveSongBtn').textContent = 'Actualitzar cançó';
    document.getElementById('songForm').scrollIntoView({ behavior: 'smooth' });
}

async function saveSong() {
    const payload = songFormData();
    if (!payload.title) {
        showMessage('El títol és obligatori', 'error');
        return;
    }
    const id = document.getElementById('songIdInput').value;
    const url = id ? `/admin/api/songs/${id}` : '/admin/api/songs';
    const method = id ? 'PUT' : 'POST';
    try {
        const response = await apiRequest(url, { method, body: JSON.stringify(payload) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'No s\'ha pogut desar la cançó');
        showMessage(id ? 'Cançó actualitzada' : 'Cançó creada');
        resetSongForm();
        await loadSongs();
    } catch (error) {
        showMessage(error.message, 'error');
    }
}

async function deleteSongAdmin(id) {
    if (!confirm('Segur que vols eliminar aquesta cançó? També desapareixerà dels llançaments.')) return;
    try {
        const response = await apiRequest(`/admin/api/songs/${id}`, { method: 'DELETE' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'No s\'ha pogut eliminar la cançó');
        showMessage('Cançó eliminada');
        await loadSongs();
        if (typeof loadAdminReleases === 'function') await loadAdminReleases();
    } catch (error) {
        showMessage(error.message, 'error');
    }
}

async function uploadSongAudio(id, input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('audio', file);
    try {
        const response = await apiUploadRequest(`/admin/api/songs/${id}/audio`, formData);
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Error pujant l\'àudio');
        showMessage('Àudio pujat');
        await loadSongs();
    } catch (error) {
        showMessage(error.message, 'error');
    } finally {
        input.value = '';
    }
}

async function removeSongAudio(id) {
    if (!confirm('Eliminar el fitxer d\'àudio d\'aquesta cançó?')) return;
    try {
        const response = await apiRequest(`/admin/api/songs/${id}/audio`, { method: 'DELETE' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'No s\'ha pogut eliminar l\'àudio');
        showMessage('Àudio eliminat');
        await loadSongs();
    } catch (error) {
        showMessage(error.message, 'error');
    }
}

async function movePlayerSong(songId, targetIndex) {
    try {
        const response = await apiRequest('/admin/api/songs/player-reorder', {
            method: 'POST',
            body: JSON.stringify({ songId, targetIndex })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'No s\'ha pogut reordenar');
        await loadSongs();
    } catch (error) {
        showMessage(error.message, 'error');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const tab = document.querySelector('[data-view="view-songs"]');
    if (tab) tab.addEventListener('click', loadSongs);
});
```

- [ ] **Step 3: Verify manually**

Run `ADMIN_PASSWORD=provatest npm run dev`, open `http://localhost:3001/admin.html`, log in, open the **Cançons** tab. Create a song with duration `3:43`, lyrics, and year; upload an `.mp3`; toggle player visibility; reorder two songs with audio; edit and delete a song. Each action should show a Catalan success message and the list should refresh.

- [ ] **Step 4: Commit**

```bash
git add public/admin.html public/js/admin/songs-admin.js
git commit -m "feat: admin Cançons tab replacing audio tracks tab"
```

---

### Task 10: Admin UI — Discografia tab rework

**Files:**
- Create: `public/js/admin/releases-admin.js`
- Modify: `public/admin.html`

- [ ] **Step 1: Replace the release form markup**

In `public/admin.html`, inside the `view-discography` section, replace the `release-form-container` block (lines ~499-563, the form with `releaseTitleInput` through `releasesList`) with:

```html
                <div class="release-form-container">
                    <form id="releaseForm" onsubmit="return false;">
                        <input type="hidden" id="releaseIdInput">
                        <div class="form-group">
                            <label for="releaseTitleInput">Títol:</label>
                            <input type="text" id="releaseTitleInput" required>
                        </div>
                        <div class="form-group">
                            <label for="releaseTypeInput">Tipus:</label>
                            <select id="releaseTypeInput">
                                <option value="single">Single</option>
                                <option value="ep">EP</option>
                                <option value="album">Àlbum (LP)</option>
                                <option value="other">Altres</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="releaseDateInput">Data de llançament:</label>
                            <input type="date" id="releaseDateInput">
                        </div>
                        <div class="form-group">
                            <label for="releasePlaceInput">Lloc de gravació:</label>
                            <input type="text" id="releasePlaceInput">
                        </div>
                        <div class="form-group">
                            <label for="releaseDescriptionInput">Descripció:</label>
                            <textarea id="releaseDescriptionInput" rows="3" style="width:100%;"></textarea>
                        </div>
                        <div class="form-group">
                            <label>Enllaços de streaming:</label>
                            <input type="url" id="releaseSpotifyInput" placeholder="Spotify URL">
                            <input type="url" id="releaseYoutubeInput" placeholder="YouTube URL">
                            <input type="url" id="releaseAppleInput" placeholder="Apple Music URL">
                        </div>
                        <div class="form-group">
                            <label><input type="checkbox" id="releasePublishedInput" checked> Publicat</label>
                        </div>
                        <div class="form-group">
                            <label>Pistes del llançament:</label>
                            <div style="display:flex; gap:8px; align-items:center;">
                                <select id="releaseSongPicker" style="flex:1;"></select>
                                <button type="button" onclick="addSongToTracklist()">Afegir</button>
                            </div>
                            <div id="releaseTracklist" style="margin-top:8px;"></div>
                        </div>
                        <button type="button" id="saveReleaseBtn" onclick="saveAdminRelease()">Guardar llançament</button>
                        <button type="button" onclick="resetReleaseForm()">Cancel·lar</button>
                    </form>
                    <div class="form-group" style="margin-top:10px;">
                        <label>Portada (desa primer el llançament):</label>
                        <input type="file" id="releaseCoverFile" accept="image/*" disabled>
                        <img id="releaseCoverPreview" src="" alt="" style="max-width:160px; display:none; margin-top:6px;">
                    </div>
                </div>
            <div id="releasesList" style="margin-top:15px;"></div>
```

Delete the old inline releases JS in `admin.html`: every function from the old implementation — `toggleAddReleaseForm`, `cancelAddRelease`, `setReleaseFormStatus`, `clearReleaseFormStatus`, `loadReleases`, the `addReleaseForm` submit listener, `renderDiscography`, the release edit/delete/reorder handlers, and `updateCoverPreview` (lines ~1424-1830). Keep unrelated tab/view code (`switchAdminView` etc.).

Add the script tag next to the songs one:

```html
    <script src="js/admin/releases-admin.js"></script>
```

- [ ] **Step 2: Create `public/js/admin/releases-admin.js`**

```js
/**
 * Admin: Llançaments — release CRUD, cover upload, tracklist editor, ordering.
 * Depends on admin-common.js and songs-admin.js (adminSongs, loadSongs).
 */
let adminReleases = [];
let releaseTracklistIds = [];

const RELEASE_TYPE_LABELS = { album: 'Àlbum', ep: 'EP', single: 'Single', other: 'Altres' };

async function loadAdminReleases() {
    try {
        const response = await apiRequest('/admin/api/releases');
        if (!response.ok) throw new Error('HTTP ' + response.status);
        const data = await response.json();
        adminReleases = Array.isArray(data.releases) ? data.releases : [];
        renderAdminReleases();
    } catch (error) {
        console.error('Error carregant llançaments:', error);
        showMessage('Error carregant els llançaments', 'error');
    }
}

function renderReleaseSongPicker() {
    const picker = document.getElementById('releaseSongPicker');
    if (!picker) return;
    const available = (adminSongs || []).filter((s) => !releaseTracklistIds.includes(s.id));
    picker.innerHTML = available.length
        ? available.map((s) => `<option value="${s.id}">${escapeHtml(s.title)}${s.duration ? ` (${s.duration})` : ''}</option>`).join('')
        : '<option value="">— cap cançó disponible —</option>';
}

function renderReleaseTracklist() {
    const container = document.getElementById('releaseTracklist');
    if (!container) return;
    if (releaseTracklistIds.length === 0) {
        container.innerHTML = '<p style="margin:4px 0;">Sense pistes.</p>';
        renderReleaseSongPicker();
        return;
    }
    container.innerHTML = releaseTracklistIds.map((songId, index) => {
        const song = (adminSongs || []).find((s) => s.id === songId);
        const title = song ? song.title : `Cançó ${songId}`;
        return `
            <div class="sunken-panel" style="padding:4px 8px; margin-bottom:4px; display:flex; gap:8px; align-items:center;">
                <span>${index + 1}. ${escapeHtml(title)}</span>
                <span style="margin-left:auto;">
                    <button type="button" ${index === 0 ? 'disabled' : ''} onclick="moveTracklistSong(${index}, -1)">⬆️</button>
                    <button type="button" ${index === releaseTracklistIds.length - 1 ? 'disabled' : ''} onclick="moveTracklistSong(${index}, 1)">⬇️</button>
                    <button type="button" onclick="removeTracklistSong(${index})">✖</button>
                </span>
            </div>`;
    }).join('');
    renderReleaseSongPicker();
}

function addSongToTracklist() {
    const picker = document.getElementById('releaseSongPicker');
    const songId = Number(picker.value);
    if (!songId || releaseTracklistIds.includes(songId)) return;
    releaseTracklistIds.push(songId);
    renderReleaseTracklist();
}

function moveTracklistSong(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= releaseTracklistIds.length) return;
    const [moved] = releaseTracklistIds.splice(index, 1);
    releaseTracklistIds.splice(target, 0, moved);
    renderReleaseTracklist();
}

function removeTracklistSong(index) {
    releaseTracklistIds.splice(index, 1);
    renderReleaseTracklist();
}

function resetReleaseForm() {
    document.getElementById('releaseIdInput').value = '';
    document.getElementById('releaseForm').reset();
    document.getElementById('releasePublishedInput').checked = true;
    document.getElementById('saveReleaseBtn').textContent = 'Guardar llançament';
    const coverFile = document.getElementById('releaseCoverFile');
    coverFile.disabled = true;
    coverFile.value = '';
    const preview = document.getElementById('releaseCoverPreview');
    preview.src = '';
    preview.style.display = 'none';
    releaseTracklistIds = [];
    renderReleaseTracklist();
}

function editAdminRelease(id) {
    const release = adminReleases.find((r) => r.id === id);
    if (!release) return;
    document.getElementById('releaseIdInput').value = release.id;
    document.getElementById('releaseTitleInput').value = release.title;
    document.getElementById('releaseTypeInput').value = release.type;
    document.getElementById('releaseDateInput').value = release.releaseDate || '';
    document.getElementById('releasePlaceInput').value = release.recordedPlace || '';
    document.getElementById('releaseDescriptionInput').value = release.description || '';
    document.getElementById('releaseSpotifyInput').value = release.streaming?.spotify || '';
    document.getElementById('releaseYoutubeInput').value = release.streaming?.youtube || '';
    document.getElementById('releaseAppleInput').value = release.streaming?.appleMusic || '';
    document.getElementById('releasePublishedInput').checked = release.published;
    document.getElementById('releaseCoverFile').disabled = false;
    const preview = document.getElementById('releaseCoverPreview');
    if (release.cover) {
        preview.src = release.cover;
        preview.style.display = 'block';
    } else {
        preview.src = '';
        preview.style.display = 'none';
    }
    releaseTracklistIds = (release.songs || []).map((s) => s.id);
    renderReleaseTracklist();
    document.getElementById('saveReleaseBtn').textContent = 'Actualitzar llançament';
    document.getElementById('releaseForm').scrollIntoView({ behavior: 'smooth' });
}

function releaseFormData() {
    return {
        title: document.getElementById('releaseTitleInput').value.trim(),
        type: document.getElementById('releaseTypeInput').value,
        releaseDate: document.getElementById('releaseDateInput').value || undefined,
        recordedPlace: document.getElementById('releasePlaceInput').value.trim(),
        description: document.getElementById('releaseDescriptionInput').value.trim(),
        published: document.getElementById('releasePublishedInput').checked,
        streaming: {
            spotify: document.getElementById('releaseSpotifyInput').value.trim(),
            youtube: document.getElementById('releaseYoutubeInput').value.trim(),
            appleMusic: document.getElementById('releaseAppleInput').value.trim()
        }
    };
}

async function saveAdminRelease() {
    const payload = releaseFormData();
    if (!payload.title) {
        showMessage('El títol és obligatori', 'error');
        return;
    }
    const id = document.getElementById('releaseIdInput').value;
    const url = id ? `/admin/api/releases/${id}` : '/admin/api/releases';
    const method = id ? 'PUT' : 'POST';
    try {
        const response = await apiRequest(url, { method, body: JSON.stringify(payload) });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'No s\'ha pogut desar el llançament');
        const releaseId = data.release.id;

        const tracklistResponse = await apiRequest(`/admin/api/releases/${releaseId}/songs`, {
            method: 'PUT',
            body: JSON.stringify({ songIds: releaseTracklistIds })
        });
        if (!tracklistResponse.ok) {
            const tlData = await tracklistResponse.json().catch(() => ({}));
            throw new Error(tlData.error || 'No s\'han pogut desar les pistes');
        }

        const coverInput = document.getElementById('releaseCoverFile');
        if (coverInput.files && coverInput.files[0]) {
            const formData = new FormData();
            formData.append('cover', coverInput.files[0]);
            const coverResponse = await apiUploadRequest(`/admin/api/releases/${releaseId}/cover`, formData);
            if (!coverResponse.ok) {
                const cvData = await coverResponse.json().catch(() => ({}));
                throw new Error(cvData.error || 'No s\'ha pogut pujar la portada');
            }
        }

        showMessage(id ? 'Llançament actualitzat' : 'Llançament creat');
        resetReleaseForm();
        await loadAdminReleases();
    } catch (error) {
        showMessage(error.message, 'error');
    }
}

async function deleteAdminRelease(id) {
    if (!confirm('Segur que vols eliminar aquest llançament? Les cançons es conserven.')) return;
    try {
        const response = await apiRequest(`/admin/api/releases/${id}`, { method: 'DELETE' });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'No s\'ha pogut eliminar el llançament');
        showMessage('Llançament eliminat');
        await loadAdminReleases();
    } catch (error) {
        showMessage(error.message, 'error');
    }
}

async function moveAdminRelease(releaseId, targetIndex) {
    try {
        const response = await apiRequest('/admin/api/releases/reorder', {
            method: 'POST',
            body: JSON.stringify({ releaseId, targetIndex })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'No s\'ha pogut reordenar');
        adminReleases = data.releases;
        renderAdminReleases();
    } catch (error) {
        showMessage(error.message, 'error');
    }
}

function renderAdminReleases() {
    const container = document.getElementById('releasesList');
    if (!container) return;
    if (adminReleases.length === 0) {
        container.innerHTML = '<p>Encara no hi ha llançaments.</p>';
        return;
    }
    container.innerHTML = adminReleases.map((release, index) => `
        <div class="sunken-panel" style="padding:8px; margin-bottom:8px;">
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                ${release.cover ? `<img src="${escapeHtml(release.cover)}" alt="" style="width:48px; height:48px; object-fit:cover;">` : ''}
                <strong>${escapeHtml(release.title)}</strong>
                <span>${RELEASE_TYPE_LABELS[release.type] || release.type}</span>
                <span>${release.year || ''}</span>
                <span>${release.published ? '' : '📝 esborrany'}</span>
                <span>${(release.songs || []).length} pistes</span>
                <span style="margin-left:auto;">
                    <button type="button" ${index === 0 ? 'disabled' : ''} onclick="moveAdminRelease(${release.id}, ${index - 1})">⬆️</button>
                    <button type="button" ${index === adminReleases.length - 1 ? 'disabled' : ''} onclick="moveAdminRelease(${release.id}, ${index + 1})">⬇️</button>
                    <button type="button" onclick="editAdminRelease(${release.id})">✏️</button>
                    <button type="button" onclick="deleteAdminRelease(${release.id})">🗑️</button>
                </span>
            </div>
        </div>
    `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
    const tab = document.querySelector('[data-view="view-discography"]');
    if (tab) {
        tab.addEventListener('click', async () => {
            if (typeof loadSongs === 'function') await loadSongs();
            await loadAdminReleases();
        });
    }
    renderReleaseTracklist();
});
```

- [ ] **Step 3: Verify manually**

With `ADMIN_PASSWORD=provatest npm run dev`: in **Cançons** create 3 songs; in **Discografia** create a Single containing song 1 and an LP containing songs 1-3 (shared song = many-to-many); reorder the LP tracklist; upload a cover while editing; toggle one release to draft; reorder releases; delete the single (songs survive). Check `http://localhost:3001/api/releases` only shows published releases with correct ordered songs.

- [ ] **Step 4: Commit**

```bash
git add public/admin.html public/js/admin/releases-admin.js
git commit -m "feat: admin Discografia tab with tracklist editor and cover upload"
```

---

### Task 11: Main site — discography rendering + lyrics window

**Files:**
- Modify: `public/index.html` (add lyrics window markup)
- Modify: `public/js/band-data-loader.js` (`populateMusicSection` + lyrics logic)

- [ ] **Step 1: Add the lyrics window to `public/index.html`**

After the Music Window block (after line 192, before the DemAmp player window), insert:

```html
      <!-- Lyrics Window (Notepad style) -->
      <div
        id="lyricsWindow"
        class="window"
        data-title="Lletra"
        style="display: none"
      >
        <div class="title-bar">
          <div class="title-bar-text" id="lyricsWindowTitle">Lletra.txt</div>
          <div class="title-bar-controls">
            <button aria-label="Minimitzar">–</button>
            <button aria-label="Tancar">×</button>
          </div>
        </div>
        <div class="window-body" id="lyricsContent"></div>
      </div>
```

(The existing window manager wires dragging/close/minimize from this standard markup; `window.demaOS.openWindow('lyrics')` resolves `lyrics + 'Window'`.)

- [ ] **Step 2: Update `populateMusicSection` in `public/js/band-data-loader.js`**

Replace the whole `populateMusicSection()` method (lines 131-192) with:

```js
    // Populate Music section
    populateMusicSection() {
        if (!this.data) return;

        const musicContent = document.getElementById('musicContent');
        if (!musicContent) return;

        const releases = Array.isArray(this.data.discography?.releases)
            ? this.data.discography.releases
            : [];

        this.songIndex = new Map();
        releases.forEach((release) => {
            (release.songs || []).forEach((song) => this.songIndex.set(String(song.id), song));
        });

        if (releases.length === 0) {
            musicContent.innerHTML = '<p class="window-text">No hi ha llançaments disponibles encara.</p>';
            return;
        }

        const typeLabels = { album: 'Àlbum', ep: 'EP', single: 'Single', other: '' };

        const renderStreamingLink = (url, label, cssClass, icon) => {
            if (!url || url === '#') {
                return `<span class="streaming-link ${cssClass}" style="opacity:.5; pointer-events:none;"><span class="link-icon">${icon}</span> ${label}</span>`;
            }
            return `<a href="${this.escapeHtml(url)}" class="streaming-link ${cssClass}" target="_blank" rel="noopener noreferrer"><span class="link-icon">${icon}</span> ${label}</a>`;
        };

        const releasesHtml = releases.map((release) => {
            const songs = Array.isArray(release.songs) ? release.songs : [];
            const songsHtml = songs.length
                ? songs.map((song) => `
                    <li>
                        <a href="#" class="song-lyrics-link" data-song-id="${song.id}">${this.escapeHtml(song.title || '')}</a>${song.duration ? ` (${this.escapeHtml(song.duration)})` : ''}
                    </li>`).join('')
                : '<li>Sense pistes publicades</li>';

            const meta = [typeLabels[release.type] ?? release.type, release.year]
                .filter(Boolean)
                .map((item) => this.escapeHtml(String(item)))
                .join(' • ');

            return `
                <div class="sunken-panel" style="padding: 10px; margin-bottom: 12px;">
                    <div class="music-content" style="gap: 12px;">
                        <div class="album-cover" style="min-width: 140px;">
                            ${release.cover ? `<img src="${this.escapeHtml(release.cover)}" alt="Portada ${this.escapeHtml(release.title || '')}" style="width: 100%; max-width: 160px; border-radius: 4px; box-shadow: 2px 2px 4px rgba(0,0,0,0.3);">` : '<div style="width: 140px; height: 140px; border: 1px solid #aaa; display:flex; align-items:center; justify-content:center; background:#efefef;">Sense portada</div>'}
                        </div>
                        <div class="music-info" style="min-width: 0;">
                            <h3 class="window-subheading" style="margin-top:0;">${this.escapeHtml(release.title || 'Sense títol')}</h3>
                            ${meta ? `<p class="window-text" style="margin: 6px 0;">${meta}</p>` : ''}
                            ${release.description ? `<p class="window-text" style="margin: 6px 0;">${this.escapeHtml(release.description)}</p>` : ''}

                            <div class="streaming-links" style="margin: 8px 0; display:flex; gap:8px; flex-wrap:wrap;">
                                ${renderStreamingLink(release.streaming?.spotify, 'Spotify', 'spotify', '♪')}
                                ${renderStreamingLink(release.streaming?.youtube, 'YouTube', 'youtube', '▶')}
                                ${renderStreamingLink(release.streaming?.appleMusic, 'Apple Music', 'apple-music', '♫')}
                            </div>

                            <div class="tracklist">
                                <strong>Pistes:</strong>
                                <ul class="tree-view">${songsHtml}</ul>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        musicContent.innerHTML = `
            <h2 class="window-heading">Discografia</h2>
            ${releasesHtml}
        `;

        musicContent.addEventListener('click', (event) => {
            const link = event.target.closest('.song-lyrics-link');
            if (!link) return;
            event.preventDefault();
            const song = this.songIndex.get(link.dataset.songId);
            if (song) this.openLyricsWindow(song);
        });
    }

    openLyricsWindow(song) {
        const titleBar = document.getElementById('lyricsWindowTitle');
        const content = document.getElementById('lyricsContent');
        if (!titleBar || !content) return;

        const metaParts = [
            song.duration ? `Durada: ${song.duration}` : '',
            song.recordedYear ? `Gravada: ${song.recordedYear}` : '',
            song.recordedPlace ? this.escapeHtml(song.recordedPlace) : ''
        ].filter(Boolean);

        titleBar.textContent = `${song.title} - Lletra.txt`;
        content.innerHTML = `
            <h3 class="window-subheading" style="margin-top:0;">${this.escapeHtml(song.title)}</h3>
            ${metaParts.length ? `<p class="window-text" style="margin:6px 0;">${metaParts.join(' • ')}</p>` : ''}
            <pre style="white-space:pre-wrap; font-family:inherit; margin:8px 0;">${this.escapeHtml(song.lyrics || '') || 'Lletra no disponible.'}</pre>
        `;

        if (window.demaOS && typeof window.demaOS.openWindow === 'function') {
            window.demaOS.openWindow('lyrics');
        }
    }
```

- [ ] **Step 3: Verify manually**

`npm run dev`, open `http://localhost:3001`. Open the Discografia window: releases show cover, Catalan type label, year, and tracklist with durations. Click a song title → a Notepad-style window opens with the lyrics (or "Lletra no disponible."); the window drags and closes like the others. Confirm the DemAmp player still loads and plays songs uploaded in Task 9.

- [ ] **Step 4: Commit**

```bash
git add public/index.html public/js/band-data-loader.js
git commit -m "feat: discography renders from songs model, add lyrics window"
```

---

### Task 12: Docs and final verification

**Files:**
- Modify: `CLAUDE.md` (Data Storage section)
- Modify: `scripts/migrate-json-to-db.js` (no code change needed — verify only)

- [ ] **Step 1: Update CLAUDE.md**

In the **Data Storage** section, replace:

```
- **SQLite DB:** `data/band.db` (dev) or `/app/data/band.db` (prod). Tables: tours, countdown, gallery, settings, releases, tracks.
```
with:
```
- **SQLite DB:** `data/band.db` (dev) or `/app/data/band.db` (prod). Tables: tours, countdown, gallery, settings, songs, releases, release_songs (plus renamed `releases_legacy`/`tracks_legacy` kept as unused safety copies).
- **Discography model:** songs are first-class (lyrics, duration, recording info, optional player audio); releases (album/ep/single/other) link songs via `release_songs` with per-release positions. `published = 0` hides a release from the public API.
```

- [ ] **Step 2: Confirm legacy scripts still run**

`scripts/migrate-json-to-db.js` calls `db.getReleases()` and `db.updateBandInfo(...)` — both still exist (`updateBandInfo` no longer writes discography, which is intended). Run:

```bash
rm -f /tmp/dema-script.db* && DATABASE_PATH=/tmp/dema-script.db npm run migrate-json-db
```
Expected: completes without throwing (release count reported as 0 is fine).

- [ ] **Step 3: Full manual E2E pass**

With `ADMIN_PASSWORD=provatest npm run dev` against the real dev DB (`./data/band.db` — it migrates in place; old data lands in `*_legacy`):

1. Admin → Cançons: create songs with lyrics/duration/year, upload audio for two.
2. Admin → Discografia: create a Single (1 song) and an LP (3 songs, sharing the single's song); upload covers; reorder; set one as draft.
3. Main site: Discografia window shows only published releases; lyrics window opens on song click; DemAmp plays the uploaded audio.
4. Delete a song that's on the LP → it disappears from the LP tracklist; delete a release → its songs survive in Cançons.
5. `npm run backup` succeeds.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document the normalized discography model"
```
