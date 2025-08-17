// Band Data Loader
class BandDataLoader {
    constructor() {
        this.data = null;
    }

    async loadData() {
        try {
            const response = await fetch('data/band-info.json');
            this.data = await response.json();
            return this.data;
        } catch (error) {
            console.error('Error loading band data:', error);
            return null;
        }
    }

    // Populate About section
    populateAboutSection() {
        if (!this.data) return;

        const aboutContent = document.getElementById('aboutContent');
        if (!aboutContent) return;

        // Update description
        const description = this.data.band.description.map(p => `<p class="window-text">${p}</p>`).join('');
        
        // Update members list
        const membersList = this.data.band.members.map(member => 
            `<li>${member.name} - ${member.role}</li>`
        ).join('');

        aboutContent.innerHTML = `
            <h2 class="window-heading">Sobre Demà</h2>
            ${description}
            
            <div class="band-photo" style="text-align: center;">
                <img src="${this.data.media.bandPhoto}" alt="Demà - Foto de la banda" style="width: 100%; max-width: 300px; border-radius: 4px; box-shadow: 2px 2px 4px rgba(0,0,0,0.3);">
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
            const memberContacts = Object.entries(this.data.contact.members)
                .map(([name, contact]) => 
                    `<p>📱 ${name}: ${contact.phone} | ${contact.email}</p>`
                ).join('');

            contactInfo.innerHTML = `
                <h3 class="window-subheading">O contacta directament:</h3>
                <p>📧 ${this.data.contact.email}</p>
                ${memberContacts}
                <p>🍺 ${this.data.contact.location}</p>
            `;
        }
    }

    // Populate Music section
    populateMusicSection() {
        if (!this.data) return;

        const musicContent = document.getElementById('musicContent');
        if (!musicContent) return;

        const latestRelease = this.data.discography.releases[0]; // Assuming first is latest
        if (!latestRelease) return;

        const trackList = latestRelease.tracks ? 
            latestRelease.tracks.map(track => `<li>${track.title} (${track.duration})</li>`).join('') : '';

        musicContent.innerHTML = `
            <div class="music-content">
                <div class="album-cover">
                    <img src="${latestRelease.cover}" alt="Portada EP ${latestRelease.title}" style="width: 100%; max-width: 200px; border-radius: 4px; box-shadow: 2px 2px 4px rgba(0,0,0,0.3);">
                </div>
                
                <div class="music-info">
                    <h2 class="window-heading">Últim Llançament: "${latestRelease.title}"</h2>
                    <p class="window-text">El nostre primer EP amb quatre temes que parlen del barri, de la vida de diari i que intenten no ser d'amor.</p>
                    
                    <div class="music-players">
                        <h3 class="window-subheading">Escolta'l ara:</h3>
                        
                        <div class="streaming-links">
                            <a href="${latestRelease.streaming?.spotify || '#'}" class="streaming-link spotify">
                                <span class="link-icon">♪</span> Spotify 
                            </a>
                            <a href="${latestRelease.streaming?.youtube || '#'}" class="streaming-link youtube">
                                <span class="link-icon">▶</span> YouTube
                            </a>
                        </div>
                    </div>
                    
                    <div class="tracklist">
                        <h3 class="window-subheading">Les cançons:</h3>
                        <ul class="tree-view">
                            ${trackList}
                        </ul>
                    </div>
                </div>
            </div>
        `;
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

        const socialIcons = document.querySelectorAll('.desktop-icon.social-icon');
        socialIcons.forEach(icon => {
            const url = icon.getAttribute('data-url');
            if (url.includes('instagram')) {
                icon.setAttribute('data-url', this.data.social.instagram.url);
            } else if (url.includes('youtube')) {
                icon.setAttribute('data-url', this.data.social.youtube.url);
            } else if (url.includes('tiktok')) {
                icon.setAttribute('data-url', this.data.social.tiktok.url);
            } else if (url.includes('spotify')) {
                icon.setAttribute('data-url', this.data.social.spotify.url);
            }
        });
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
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
    const bandLoader = new BandDataLoader();
    await bandLoader.init();
});
