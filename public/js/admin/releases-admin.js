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
