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
