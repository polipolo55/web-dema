/**
 * @param {import('better-sqlite3').Database} db
 */
function getReleases(db) {
    const rows = db.prepare(`
        SELECT * FROM releases
        ORDER BY
            CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END,
            sort_order ASC,
            CASE WHEN release_date IS NULL OR release_date = '' THEN 1 ELSE 0 END,
            release_date DESC,
            year DESC,
            id DESC
    `).all();
    return rows.map((row) => mapReleaseRow(row));
}

/**
 * @param {Record<string, unknown>} row
 */
function mapReleaseRow(row) {
    if (!row) return null;

    let tracks = [];
    try {
        const parsed = JSON.parse((row.tracks_json || '[]'));
        if (Array.isArray(parsed)) {
            tracks = parsed
                .map((track) => ({
                    title: typeof track?.title === 'string' ? track.title : '',
                    duration: typeof track?.duration === 'string' ? track.duration : ''
                }))
                .filter((track) => track.title);
        }
    } catch {
        tracks = [];
    }

    return {
        id: row.id,
        title: row.title || '',
        type: row.type || '',
        year: row.year ?? undefined,
        recorded: row.recorded || '',
        studio: row.studio || '',
        released: row.released || '',
        releaseDate: row.release_date ?? undefined,
        cover: row.cover || '',
        description: row.description || '',
        status: row.status || '',
        tracks,
        streaming: {
            spotify: row.spotify || '',
            youtube: row.youtube || '',
            appleMusic: row.apple_music || ''
        }
    };
}

/**
 * @param {unknown} input
 */
function normalizeRelease(input) {
    const incoming = input && typeof input === 'object' ? input : {};
    const normalizeText = (value, maxLength = 1000) => {
        if (typeof value !== 'string') return '';
        return value.replace(/<[^>]*>?/gm, '').trim().slice(0, maxLength);
    };

    const tracks = Array.isArray(incoming.tracks)
        ? incoming.tracks
            .map((track) => ({
                title: normalizeText(track?.title || '', 200),
                duration: normalizeText(track?.duration || '', 50)
            }))
            .filter((track) => track.title)
        : [];

    const parsedYear = Number(incoming.year);
    return {
        title: normalizeText(incoming.title || '', 200),
        type: normalizeText(incoming.type || '', 50),
        year: Number.isInteger(parsedYear) && parsedYear > 0 ? parsedYear : null,
        recorded: normalizeText(incoming.recorded || '', 200),
        studio: normalizeText(incoming.studio || '', 200),
        released: normalizeText(incoming.released || '', 200),
        releaseDate:
            typeof incoming.releaseDate === 'string' && incoming.releaseDate.trim()
                ? incoming.releaseDate.trim()
                : null,
        cover: normalizeText(incoming.cover || '', 400),
        description: normalizeText(incoming.description || '', 2000),
        status: normalizeText(incoming.status || '', 50),
        tracks,
        streaming: {
            spotify: normalizeText(incoming.streaming?.spotify || '', 1000),
            youtube: normalizeText(incoming.streaming?.youtube || '', 1000),
            appleMusic: normalizeText(incoming.streaming?.appleMusic || '', 1000)
        }
    };
}

/**
 * @param {import('better-sqlite3').Database} db
 */
function getNextReleaseOrder(db) {
    const row = db.prepare('SELECT MAX(sort_order) AS maxOrder FROM releases').get();
    return (row?.maxOrder || 0) + 1;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {Parameters<typeof normalizeRelease>[0]} releaseData
 */
function addRelease(db, releaseData) {
    const release = normalizeRelease(releaseData);
    if (!release.title) throw new Error('Release title is required');

    const sortOrder = getNextReleaseOrder(db);
    const result = db.prepare(`
        INSERT INTO releases (
            title, type, year, recorded, studio, released, release_date, cover,
            description, status, spotify, youtube, apple_music, tracks_json, sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        release.title,
        release.type,
        release.year,
        release.recorded,
        release.studio,
        release.released,
        release.releaseDate,
        release.cover,
        release.description,
        release.status,
        release.streaming.spotify,
        release.streaming.youtube,
        release.streaming.appleMusic,
        JSON.stringify(release.tracks),
        sortOrder
    );

    const row = db.prepare('SELECT * FROM releases WHERE id = ?').get(result.lastInsertRowid);
    return mapReleaseRow(row);
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 * @param {Parameters<typeof normalizeRelease>[0]} releaseData
 */
function updateRelease(db, id, releaseData) {
    const release = normalizeRelease(releaseData);
    if (!release.title) throw new Error('Release title is required');

    const result = db.prepare(`
        UPDATE releases
        SET
            title = ?, type = ?, year = ?, recorded = ?, studio = ?, released = ?,
            release_date = ?, cover = ?, description = ?, status = ?,
            spotify = ?, youtube = ?, apple_music = ?, tracks_json = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `).run(
        release.title,
        release.type,
        release.year,
        release.recorded,
        release.studio,
        release.released,
        release.releaseDate,
        release.cover,
        release.description,
        release.status,
        release.streaming.spotify,
        release.streaming.youtube,
        release.streaming.appleMusic,
        JSON.stringify(release.tracks),
        id
    );

    if (result.changes === 0) return null;
    return mapReleaseRow(db.prepare('SELECT * FROM releases WHERE id = ?').get(id));
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} id
 */
function deleteRelease(db, id) {
    const result = db.prepare('DELETE FROM releases WHERE id = ?').run(id);
    return result.changes > 0;
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {number} releaseId
 * @param {number} targetIndex
 */
function reorderRelease(db, releaseId, targetIndex) {
    const current = getReleases(db);
    const fromIndex = current.findIndex((r) => Number(r.id) === Number(releaseId));
    if (fromIndex === -1) return { success: false, error: 'Release not found' };
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= current.length) {
        return { success: false, error: 'Invalid target index' };
    }
    if (fromIndex === targetIndex) return { success: true, releases: current };

    const reordered = [...current];
    const [moved] = reordered.splice(fromIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    const tx = db.transaction((items) => {
        const stmt = db.prepare(
            'UPDATE releases SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        );
        items.forEach((item, index) => {
            stmt.run(index + 1, item.id);
        });
    });
    tx(reordered);
    return { success: true, releases: getReleases(db) };
}

/**
 * @param {import('better-sqlite3').Database} db
 * @param {unknown[]} releases
 */
function replaceAllReleases(db, releases = []) {
    const tx = db.transaction((incoming) => {
        db.prepare('DELETE FROM releases').run();
        const insert = db.prepare(`
            INSERT INTO releases (
                title, type, year, recorded, studio, released, release_date, cover,
                description, status, spotify, youtube, apple_music, tracks_json, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        (Array.isArray(incoming) ? incoming : []).forEach((item, index) => {
            const release = normalizeRelease(item);
            if (!release.title) return;
            insert.run(
                release.title,
                release.type,
                release.year,
                release.recorded,
                release.studio,
                release.released,
                release.releaseDate,
                release.cover,
                release.description,
                release.status,
                release.streaming.spotify,
                release.streaming.youtube,
                release.streaming.appleMusic,
                JSON.stringify(release.tracks),
                index + 1
            );
        });
    });
    tx(releases);
    return getReleases(db);
}

module.exports = {
    getReleases,
    mapReleaseRow,
    normalizeRelease,
    getNextReleaseOrder,
    addRelease,
    updateRelease,
    deleteRelease,
    reorderRelease,
    replaceAllReleases
};
