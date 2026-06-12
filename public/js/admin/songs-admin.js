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
