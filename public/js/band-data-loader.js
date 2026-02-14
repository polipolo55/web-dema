/**
 * Band Data Loader - handles loading and display of band information
 */
class BandDataLoader {
    constructor() {
        this.data = null;
    }

    /**
     * Load band data from JSON file
     * @returns {Object|null} Band data or null if loading fails
     */
    async loadData() {
        try {
            const response = await fetch('/api/band-info');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            this.data = await response.json();
            return this.data;
        } catch (error) {
            console.error('Error loading band data:', error);
            return null;
        }
    }

    /**
     * Populate About section with band information
     */
    populateAboutSection() {
        if (!this.data) {
            console.warn('No band data available to populate about section');
            return;
        }

        const aboutContent = document.getElementById('aboutContent');
        if (!aboutContent) {
            console.warn('About content element not found');
            return;
        }

        // Update description
        const description = (this.data.band.description || [])
            .map(p => `<p class="window-text">${this.escapeHtml(String(p || ''))}</p>`)
            .join('');

        // Update members list
        const membersList = (this.data.band.members || []).map(member =>
            `<li>${this.escapeHtml(String(member?.name || ''))} - ${this.escapeHtml(String(member?.role || ''))}</li>`
        ).join('');

        aboutContent.innerHTML = `
            <h2 class="window-heading">Sobre Demà</h2>
            ${description}
            
            <div class="band-photo" style="text-align: center;">
                <img src="${this.escapeHtml(this.data.media.bandPhoto)}" alt="Demà - Foto de la banda" style="width: 100%; max-width: 300px; border-radius: 4px; box-shadow: 2px 2px 4px rgba(0,0,0,0.3);">
            </div>
            
            <h3 class="window-subheading">Membres:</h3>
            <ul class="tree-view">
                ${membersList}
            </ul>
        `;
    }

    // Populate Contact section
    populateContactSection() {
        if (!this.data) return;

        const contactInfo = document.getElementById('contactInfo');
        if (contactInfo) {
            const memberContacts = Object.entries(this.data.contact.members || {})
                .map(([name, contact]) =>
                    // Only display name and email to avoid exposing personal phone numbers
                    `<p>✉️ ${this.escapeHtml(String(name || ''))}: ${this.escapeHtml(String(contact?.email || ''))}</p>`
                ).join('');

            contactInfo.innerHTML = `
                <h3 class="window-subheading">O contacta directament:</h3>
                <p>📧 ${this.escapeHtml(String(this.data.contact.email || ''))}</p>
                ${memberContacts}
                <p>🍺 ${this.escapeHtml(String(this.data.contact.location || ''))}</p>
            `;
        }
    }

    // Populate Music section
    populateMusicSection() {
        if (!this.data) return;

        const musicContent = document.getElementById('musicContent');
        if (!musicContent) return;

        const releases = Array.isArray(this.data.discography?.releases)
            ? this.data.discography.releases
            : [];

        if (releases.length === 0) {
            musicContent.innerHTML = '<p class="window-text">No hi ha llançaments disponibles encara.</p>';
            return;
        }

        const renderStreamingLink = (url, label, cssClass, icon) => {
            if (!url || url === '#') {
                return `<span class="streaming-link ${cssClass}" style="opacity:.5; pointer-events:none;"><span class="link-icon">${icon}</span> ${label}</span>`;
            }
            return `<a href="${this.escapeHtml(url)}" class="streaming-link ${cssClass}" target="_blank" rel="noopener noreferrer"><span class="link-icon">${icon}</span> ${label}</a>`;
        };

        const releasesHtml = releases.map((release) => {
            const tracks = Array.isArray(release.tracks) ? release.tracks : [];
            const tracksHtml = tracks.length
                ? tracks.map((track) => `<li>${this.escapeHtml(track.title || '')}${track.duration ? ` (${this.escapeHtml(track.duration)})` : ''}</li>`).join('')
                : '<li>Sense pistes publicades</li>';

            const meta = [release.type, release.year, release.released].filter(Boolean).map((item) => this.escapeHtml(String(item))).join(' • ');

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
                                <ul class="tree-view">${tracksHtml}</ul>
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
    }

    escapeHtml(value) {
        if (typeof value !== 'string') return '';
        return value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    // Populate Countdown section
    populateCountdownSection() {
        if (!this.data) return;

        const countdownWindow = document.getElementById('countdownWindow');
        if (!countdownWindow) return;

        const titleElement = countdownWindow.querySelector('#releaseTitle');
        const descElement = countdownWindow.querySelector('#releaseDescription');
        const dateElement = countdownWindow.querySelector('#releaseDate');

        if (titleElement) titleElement.textContent = this.data.upcoming.release.title;
        if (descElement) descElement.textContent = this.data.upcoming.release.description;
        if (dateElement) dateElement.textContent = this.data.upcoming.release.note;
    }

    // Populate social media links
    populateSocialLinks() {
        if (!this.data) return;

        const socialIcons = Array.from(document.querySelectorAll('.desktop-icon.social-icon'));

        socialIcons.forEach(icon => {
            // Prefer explicit class names on the inner image to map icons
            const img = icon.querySelector('.icon-image');
            if (img) {
                if (img.classList.contains('instagram-icon')) {
                    icon.setAttribute('data-url', this.data.social.instagram.url);
                    return;
                }
                if (img.classList.contains('youtube-icon')) {
                    icon.setAttribute('data-url', this.data.social.youtube.url);
                    return;
                }
                if (img.classList.contains('tiktok-icon')) {
                    icon.setAttribute('data-url', this.data.social.tiktok.url);
                    return;
                }
                if (img.classList.contains('spotify-icon')) {
                    icon.setAttribute('data-url', this.data.social.spotify.url);
                    return;
                }
                if (img.classList.contains('apple-music-icon')) {
                    icon.setAttribute('data-url', this.data.social.appleMusic.url);
                    return;
                }
            }

            // Fallback: use label text
            const label = (icon.querySelector('.icon-label') || {}).textContent || '';
            const lc = label.toLowerCase();
            if (lc.includes('instagram')) icon.setAttribute('data-url', this.data.social.instagram.url);
            else if (lc.includes('youtube')) icon.setAttribute('data-url', this.data.social.youtube.url);
            else if (lc.includes('tiktok')) icon.setAttribute('data-url', this.data.social.tiktok.url);
            else if (lc.includes('spotify')) icon.setAttribute('data-url', this.data.social.spotify.url);
            else if (lc.includes('apple music')) icon.setAttribute('data-url', this.data.social.appleMusic.url);
        });
    }

    populateVideoWindow() {
        if (!this.data) return;

        const videoWindow = document.getElementById('videoWindow');
        const titleBar = document.getElementById('videoWindowTitleBar');
        const frame = document.getElementById('videoWindowFrame');
        if (!videoWindow || !titleBar || !frame) return;

        const defaultVideo = {
            title: 'Demà - Perfectament Malament',
            youtube: 'https://www.youtube.com/embed/CBhG1e5BD_s'
        };

        const configuredVideo = this.data.media?.videos?.perBarcelona ||
            (this.data.media?.videos ? Object.values(this.data.media.videos)[0] : null) ||
            defaultVideo;

        const title = (configuredVideo.title || defaultVideo.title).trim();
        const embedUrl = this.normalizeYouTubeEmbedUrl(configuredVideo.youtube || defaultVideo.youtube);

        titleBar.textContent = title;
        videoWindow.setAttribute('data-title', title);
        frame.setAttribute('title', title);
        frame.setAttribute('src', embedUrl);
    }

    normalizeYouTubeEmbedUrl(value) {
        if (typeof value !== 'string' || !value.trim()) {
            return 'https://www.youtube.com/embed/CBhG1e5BD_s';
        }

        const raw = value.trim();
        if (raw.includes('/embed/')) {
            return raw;
        }

        try {
            const url = new URL(raw);
            const host = url.hostname.replace(/^www\./, '');

            if (host === 'youtu.be') {
                const videoId = url.pathname.replace('/', '').trim();
                if (videoId) {
                    return `https://www.youtube.com/embed/${videoId}`;
                }
            }

            if (host === 'youtube.com' || host === 'm.youtube.com') {
                const videoId = url.searchParams.get('v');
                if (videoId) {
                    return `https://www.youtube.com/embed/${videoId}`;
                }
            }
        } catch (error) {
            return raw;
        }

        return raw;
    }

    // Initialize all sections
    async init() {
        await this.loadData();
        if (this.data) {
            this.populateAboutSection();
            this.populateContactSection();
            this.populateMusicSection();
            this.populateCountdownSection();
            this.populateSocialLinks();
            this.populateVideoWindow();
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    const bandLoader = new BandDataLoader();
    await bandLoader.init();
});
