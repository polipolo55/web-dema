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
