// Mobile-specific JavaScript for Demà OS
// Enhanced for better performance and user experience

const isMobileMode = () =>
    window.matchMedia('(max-width: 900px), (hover: none) and (pointer: coarse)').matches;

class DemaMobile {
    constructor() {
        this.isMobile = isMobileMode();
        this.sections = [];
        this.lastScrollY = 0;
        this.scrollThreshold = 50; // Pixels to scroll before contracting header
        this.socialIcons = [
            { name: 'Instagram', url: 'https://www.instagram.com/dema_bcn/', iconClass: 'mobile-instagram-icon' },
            { name: 'YouTube', url: 'https://www.youtube.com/@dema_bcn', iconClass: 'mobile-youtube-icon' },
            { name: 'TikTok', url: 'https://www.tiktok.com/@dema_bcn', iconClass: 'mobile-tiktok-icon' },
            { name: 'Spotify', url: 'https://open.spotify.com/artist/6whetx1LxWdj7R0PHYsOfm?si=o3bjjR7kTZCVBLUzVvJxaw', iconClass: 'mobile-spotify-icon' },
            { name: 'Apple Music', url: 'https://music.apple.com/es/artist/dem%C3%A0/1691753333', iconClass: 'mobile-apple-music-icon' }
        ];
        this.galleryInitialized = false;
        this.gallerySubscriptionSetup = false;
        this.galleryElements = {
            photoDisplay: null,
            mainPhoto: null,
            mainVideo: null,
            counter: null
        };
        this.galleryPhotoObserver = null;
        this.galleryEventsSubscribed = false;
        this.handleGalleryLoadingEvent = (event) => {
            if (event?.detail && typeof event.detail.loading === 'boolean') {
                this.setGalleryLoadingState(event.detail.loading);
            }
        };
        this.handleGalleryReadyEvent = () => {
            this.setGalleryLoadingState(false);
        };
        this.init();
    }

    init() {
        if (this.isMobile) {
            // Optimize for mobile performance
            this.optimizeForMobile();
            this.loadMobileConfig().then(() => {
                this.setupMobileLayout();
                this.ensureDesktopVisible();
            });
        }
    }

    async loadMobileConfig() {
        try {
            const response = await fetch('/api/mobile-config');
            if (response.ok) {
                this.mobileConfig = await response.json();
            }
        } catch (e) {
            // Fallback: show default windows
        }
        if (!this.mobileConfig) {
            this.mobileConfig = {
                mobileWindows: ['countdown', 'tour', 'about', 'music', 'video', 'gallery', 'contact'],
                mobileWindowOrder: ['countdown', 'tour', 'about', 'music', 'video', 'gallery', 'contact']
            };
        }
    }

    optimizeForMobile() {
        // Add viewport meta tag if not present for proper mobile scaling
        if (!document.querySelector('meta[name="viewport"]')) {
            const viewport = document.createElement('meta');
            viewport.name = 'viewport';
            viewport.content = 'width=device-width, initial-scale=1';
            document.head.appendChild(viewport);
        }
        
        // Improve scroll performance
        document.body.style.overflowX = 'hidden';
    }

    setupMobileLayout() {
        // Create mobile header with social icons
        this.createMobileHeader();

        // Convert desktop windows to mobile sections
        this.convertWindowsToSections();

        // Add footer at the bottom
        this.createMobileFooter();

        // Disable desktop interactions
        this.disableDesktopFeatures();
    }

    createMobileHeader() {
        const desktop = document.querySelector('.desktop');
        const header = document.createElement('div');
        header.className = 'mobile-header';
        
        // Create social icons
        const socialIconsHtml = this.socialIcons.map(icon => `
            <a href="${icon.url}" class="mobile-social-icon" target="_blank" rel="noopener noreferrer">
                <div class="mobile-social-icon-image ${icon.iconClass}"></div>
                <div class="mobile-social-icon-label">${icon.name}</div>
            </a>
        `).join('');
        
        header.innerHTML = `
            <img src="assets/logo.png" alt="Demà" class="mobile-logo">
            <div class="mobile-social-icons">
                ${socialIconsHtml}
            </div>
        `;
        desktop.appendChild(header);
        
    // Update social links with real URLs if available (may fetch band data)
    this.updateSocialLinks();
        
        // Setup scroll behavior for header
        this.setupHeaderScrollBehavior();
    }

    createMobileFooter() {
        const mobileContent = this.mobileContentEl;
        if (!mobileContent) return;

        const footer = document.createElement('div');
        footer.className = 'mobile-footer';

        const currentYear = new Date().getFullYear();

        const socialLinksHtml = this.socialIcons.map(icon => `
            <a href="${icon.url}" class="mobile-footer-social" target="_blank" rel="noopener noreferrer">
                <div class="mobile-social-icon-image ${icon.iconClass}"></div>
            </a>
        `).join('');

        footer.innerHTML = `
            <div class="mobile-footer-title-bar">demabcn.cat</div>
            <div class="mobile-footer-logo">
                <img src="assets/logo.png" alt="Demà" class="mobile-footer-logo-img">
            </div>
            <div class="mobile-footer-social-row">
                ${socialLinksHtml}
            </div>
            <div class="mobile-footer-text">
                Rock català de Sant Andreu de Palomar
            </div>
            <div class="mobile-footer-copy">
                © ${currentYear} Demà
            </div>
            <div class="mobile-footer-tagline">
                DemàOS v1.0
            </div>
        `;

        mobileContent.appendChild(footer);
    }

    async updateSocialLinks() {
        // Try to load canonical URLs from API so mobile uses the same links as desktop/admin
        let bandData = null;
        try {
            const resp = await fetch(`/api/band-info?t=${Date.now()}`, { cache: 'no-store' });
            if (resp.ok) bandData = await resp.json();
        } catch (e) {
            // Ignore - we'll fall back to the built-in list
        }

        const mobileSocialLinks = document.querySelectorAll('.mobile-social-icon');
        mobileSocialLinks.forEach((link) => {
            const label = (link.querySelector('.mobile-social-icon-label') || {}).textContent || '';
            const lc = label.toLowerCase();
            let url = '#';

            if (bandData && bandData.social) {
                if (lc.includes('instagram') && bandData.social.instagram?.url) url = bandData.social.instagram.url;
                else if (lc.includes('youtube') && bandData.social.youtube?.url) url = bandData.social.youtube.url;
                else if (lc.includes('tiktok') && bandData.social.tiktok?.url) url = bandData.social.tiktok.url;
                else if (lc.includes('spotify') && bandData.social.spotify?.url) url = bandData.social.spotify.url;
                else if (lc.includes('apple') && (bandData.social.appleMusic?.url || bandData.social.appleMusic)) url = bandData.social.appleMusic?.url || bandData.social.appleMusic;
            }

            // Fallback to the static list in this.socialIcons
            if ((!url || url === '#') && this.socialIcons && this.socialIcons.length) {
                const found = this.socialIcons.find(si => si.name.toLowerCase() === lc);
                if (found) url = found.url;
            }

            if (url && url !== '#') {
                link.href = url;
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noopener noreferrer');
            } else {
                // If no URL available, keep it inert
                link.href = '#';
                link.removeAttribute('target');
                link.removeAttribute('rel');
            }
        });
    }

    setupHeaderScrollBehavior() {
        const mobileHeader = document.querySelector('.mobile-header');
        let ticking = false;
        
        const updateHeaderState = () => {
            const currentScrollY = window.scrollY;
            
            if (currentScrollY > this.scrollThreshold) {
                if (!mobileHeader.classList.contains('contracted')) {
                    mobileHeader.classList.add('contracted');
                }
            } else {
                if (mobileHeader.classList.contains('contracted')) {
                    mobileHeader.classList.remove('contracted');
                }
            }
            
            this.lastScrollY = currentScrollY;
            ticking = false;
        };
        
        const requestHeaderUpdate = () => {
            if (!ticking) {
                requestAnimationFrame(updateHeaderState);
                ticking = true;
            }
        };
        
        // Use passive listeners for better performance
        window.addEventListener('scroll', requestHeaderUpdate, { passive: true });
        window.addEventListener('touchmove', requestHeaderUpdate, { passive: true });
    }

    convertWindowsToSections() {
        const desktop = document.querySelector('.desktop');

        // Create mobile content container
        const mobileContent = document.createElement('div');
        mobileContent.className = 'mobile-content';
        this.mobileContentEl = mobileContent;

        // Use config-driven window list from API
        const enabledWindows = new Set(this.mobileConfig.mobileWindows || []);
        const windowOrder = (this.mobileConfig.mobileWindowOrder || this.mobileConfig.mobileWindows || [])
            .filter(id => enabledWindows.has(id));

        // Add windows in the configured order
        windowOrder.forEach(windowId => {
            // If this is the countdown window, only include it when active
            if (windowId === 'countdown' && !this.isCountdownActive()) {
                return; // skip adding it to mobile for now
            }

            const section = document.getElementById(windowId + 'Window');
            if (section) {
                this.processMobileSection(section);
                mobileContent.appendChild(section);
            }
        });

        // Hide all windows that are NOT in the enabled set
        const allWindows = desktop.querySelectorAll('.window');
        allWindows.forEach(win => {
            if (!mobileContent.contains(win)) {
                win.style.display = 'none';
            }
        });

        desktop.appendChild(mobileContent);

        // If countdown is enabled in config but wasn't active at init, watch for it
        if (enabledWindows.has('countdown') && !this.isCountdownActive()) {
            this.watchForCountdownActivation(mobileContent);
        }
    }

    isCountdownActive() {
        try {
            const dema = window.demaOS;
            if (!dema || !dema.countdownData || !dema.countdownData.release) return false;
            const rel = dema.countdownData.release;
            if (!rel.enabled) return false;
            if (!rel.releaseDate) return false;
            const target = new Date(rel.releaseDate).getTime();
            const now = Date.now();
            return target > now;
        } catch (e) {
            return false;
        }
    }

    watchForCountdownActivation(mobileContent) {
        // Poll a few times for countdownData to appear (simple, low-cost watcher)
        let attempts = 0;
        const maxAttempts = 8; // ~8 seconds
        const iv = setInterval(() => {
            attempts++;
            if (this.isCountdownActive()) {
                clearInterval(iv);
                const section = document.getElementById('countdownWindow');
                if (section && !mobileContent.contains(section)) {
                    this.processMobileSection(section);
                    mobileContent.insertBefore(section, mobileContent.firstChild);
                }
                return;
            }
            if (attempts >= maxAttempts) {
                clearInterval(iv);
            }
        }, 1000);
    }
    processMobileSection(section) {
        // Make section visible and static
        section.style.display = 'block';
        section.style.position = 'static';
        section.style.width = '100%';
        section.style.height = 'auto';
        section.style.transform = 'none';
        section.style.left = 'auto';
        section.style.top = 'auto';
        section.style.zIndex = 'auto';
        
        // Update title bar for mobile - keep title text and controls for aesthetics
        const titleBar = section.querySelector('.title-bar');
        const titleBarText = section.querySelector('.title-bar-text');
        const titleBarControls = section.querySelector('.title-bar-controls');
        
        if (titleBar && titleBarControls) {
            // Make sure controls are visible but non-functional
            titleBarControls.style.display = 'flex';
            titleBarControls.style.pointerEvents = 'none';
            
            // If controls don't exist, create them for aesthetic purposes
            if (!titleBarControls.children.length) {
                titleBarControls.innerHTML = `
                    <button aria-label="Minimitzar" tabindex="-1">−</button>
                    <button aria-label="Tancar" tabindex="-1">×</button>
                `;
            }
        }
        
        // Remove duplicate headings in window body
        const windowBody = section.querySelector('.window-body');
        if (windowBody && titleBarText) {
            const titleBarContent = titleBarText.textContent.toLowerCase().trim();
            const headings = windowBody.querySelectorAll('.window-heading, h1, h2, h3');
            
            headings.forEach(heading => {
                const headingContent = heading.textContent.toLowerCase().trim();
                if (headingContent === titleBarContent || 
                    headingContent.includes(titleBarContent) ||
                    titleBarContent.includes(headingContent)) {
                    heading.style.display = 'none';
                }
            });
        }
        
        // Process specific content types for mobile optimization
        this.processSectionContent(section);
        
        // Add to sections array for potential future navigation
        this.sections.push({
            id: section.id,
            name: titleBarText?.textContent || 'Section',
            element: section
        });
    }

    processSectionContent(section) {
        const windowId = section.id;
        
        switch(windowId) {
            case 'musicWindow':
                this.processMusicSection(section);
                break;
            case 'tourWindow':
                this.processTourSection(section);
                break;
            case 'contactWindow':
                this.processContactSection(section);
                break;
            case 'videoWindow':
                this.processVideoSection(section);
                break;
            case 'galleryWindow':
                this.processGallerySection(section);
                break;
            case 'usersWindow':
                this.processUsersSection(section);
                break;
        }
    }

    processMusicSection(section) {
        const musicContent = section.querySelector('.music-content');
        if (musicContent) {
            // Ensure good mobile layout
            musicContent.style.flexDirection = 'column';
            musicContent.style.alignItems = 'center';
            musicContent.style.textAlign = 'center';
            
            const cover = musicContent.querySelector('.album-cover');
            const info = musicContent.querySelector('.music-info');
            
            if (cover) {
                cover.style.order = '-1';
                cover.style.marginBottom = '20px';
            }
        }
    }

    processTourSection(section) {
        const tourDates = section.querySelectorAll('.tour-date');
        tourDates.forEach(date => {
            date.style.flexDirection = 'column';
            date.style.alignItems = 'center';
            date.style.textAlign = 'center';
            date.style.gap = '8px';
            
            const dateEl = date.querySelector('.date');
            const venue = date.querySelector('.venue');
            
            if (dateEl) {
                dateEl.style.order = '1';
                dateEl.style.marginBottom = '8px';
            }
            if (venue) {
                venue.style.order = '2';
            }
        });
    }

    processContactSection(section) {
        const form = section.querySelector('.contact-form');
        if (form) {
            // Add mobile-friendly attributes
            const inputs = form.querySelectorAll('input, textarea, select');
            inputs.forEach(input => {
                input.setAttribute('autocomplete', 'on');
                input.style.width = '100%';
                input.style.marginBottom = '16px';
            });
        }
    }

    processVideoSection(section) {
        const iframe = section.querySelector('iframe');
        if (iframe) {
            // Make video responsive
            iframe.style.width = '100%';
            iframe.style.height = '200px';
            iframe.style.maxWidth = '100%';
        }
        
        const videoContainer = section.querySelector('.video-container');
        if (videoContainer) {
            videoContainer.style.margin = '16px 0';
        }
    }

    processUsersSection(section) {
        const usersList = section.querySelector('.users-list');
        if (usersList) {
            usersList.style.maxHeight = '300px';
            usersList.style.overflowY = 'auto';
        }
    }

    processGallerySection(section) {
        // Enhanced mobile gallery with touch support
        const galleryMain = section.querySelector('.gallery-main');
        const photoDisplay = section.querySelector('.photo-display');
        const mainPhoto = section.querySelector('#currentPhoto') || document.getElementById('currentPhoto');
        const mainVideo = section.querySelector('#currentVideo') || document.getElementById('currentVideo');
        const photoCounter = section.querySelector('#photoCounter') || document.getElementById('photoCounter');
        const mediaInfo = section.querySelector('.media-info') || document.querySelector('#galleryWindow .media-info');
        const mediaDescription = section.querySelector('#mediaDescription') || document.getElementById('mediaDescription');

        if (!galleryMain || !photoDisplay) {
            return;
        }

        this.galleryElements.photoDisplay = photoDisplay;
        this.galleryElements.mainPhoto = mainPhoto;
        this.galleryElements.mainVideo = mainVideo;
        this.galleryElements.counter = photoCounter;
        this.galleryElements.mediaInfo = mediaInfo;
        this.galleryElements.mediaDescription = mediaDescription;

        this.setupGalleryTouchSupport(galleryMain);
        galleryMain.classList.add('mobile-gallery');

        if (!this.galleryInitialized) {
            this.setGalleryLoadingState(true);
        }

    this.setupGalleryDataSubscription();
    this.setupGalleryEventBridges();
    }

    setupGalleryDataSubscription() {
        if (this.gallerySubscriptionSetup) {
            return;
        }

        if (!globalThis.demaOS) {
            setTimeout(() => this.setupGalleryDataSubscription(), 50);
            return;
        }

        this.gallerySubscriptionSetup = true;

        const handleReady = (galleryData, success) => {
            if (!success) {
                this.setGalleryLoadingState(false);
                return;
            }

            if (!galleryData || !Array.isArray(galleryData.photos) || !galleryData.photos.length) {
                this.setGalleryLoadingState(false);
                return;
            }

            this.initializeMobileGallery();
        };

        if (typeof globalThis.demaOS.onGalleryReady === 'function') {
            globalThis.demaOS.onGalleryReady(handleReady);
        } else if (globalThis.demaOS._isGalleryDataReady && globalThis.demaOS._isGalleryDataReady()) {
            handleReady(globalThis.demaOS.galleryData, true);
        } else {
            document.addEventListener('dema:gallery-ready', (event) => {
                handleReady(event.detail?.gallery, event.detail?.success !== false);
            }, { once: true });
        }
    }

    setupGalleryEventBridges() {
        if (this.galleryEventsSubscribed) {
            return;
        }

        document.addEventListener('dema:gallery-loading', this.handleGalleryLoadingEvent);
        document.addEventListener('dema:gallery-media-ready', this.handleGalleryReadyEvent);
        document.addEventListener('dema:gallery-media-error', this.handleGalleryReadyEvent);

        this.galleryEventsSubscribed = true;
    }

    initializeMobileGallery() {
        if (this.galleryInitialized) {
            return;
        }

        const mainPhoto = this.galleryElements.mainPhoto || document.getElementById('currentPhoto');
        if (!mainPhoto) {
            return;
        }

        this.galleryInitialized = true;
        this.observeMainPhoto(mainPhoto);
        this.observeMainVideo();

        if (mainPhoto.complete && mainPhoto.naturalWidth > 0) {
            this.setGalleryLoadingState(false);
        } else {
            this.setGalleryLoadingState(true);
        }
    }

    observeMainPhoto(mainPhoto) {
        const mainVideo = this.galleryElements.mainVideo || document.getElementById('currentVideo');
        const observedNodes = [mainPhoto, mainVideo].filter(Boolean);

        if (this.galleryPhotoObserver) {
            this.galleryPhotoObserver.disconnect();
        }

        this.galleryPhotoObserver = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                    this.setGalleryLoadingState(true);
                }
            }
        });

        observedNodes.forEach(node => {
            this.galleryPhotoObserver.observe(node, { attributes: true, attributeFilter: ['src', 'poster'] });
        });

        if (mainPhoto) {
            mainPhoto.addEventListener('load', () => {
                this.setGalleryLoadingState(false);
            });

            mainPhoto.addEventListener('error', () => {
                this.setGalleryLoadingState(false);
                const counter = this.galleryElements.counter || document.getElementById('photoCounter');
                if (counter) {
                    counter.textContent = 'Error carregant foto';
                }
            });
        }

        if (mainVideo) {
            mainVideo.addEventListener('loadeddata', () => {
                this.setGalleryLoadingState(false);
            });

            mainVideo.addEventListener('error', () => {
                this.setGalleryLoadingState(false);
                const counter = this.galleryElements.counter || document.getElementById('photoCounter');
                if (counter) {
                    counter.textContent = 'Error carregant vídeo';
                }
            });
        }
    }

    observeMainVideo() {
        const mainVideo = this.galleryElements.mainVideo || document.getElementById('currentVideo');
        if (!mainVideo) {
            return;
        }

        mainVideo.addEventListener('play', () => {
            document.dispatchEvent(new CustomEvent('dema:gallery-video-play'));
        });

        mainVideo.addEventListener('pause', () => {
            document.dispatchEvent(new CustomEvent('dema:gallery-video-pause'));
        });
    }

    setGalleryLoadingState(isLoading) {
        const photoDisplay = this.galleryElements.photoDisplay || document.querySelector('#galleryWindow .photo-display');
        const mainVideo = this.galleryElements.mainVideo || document.getElementById('currentVideo');
        const mainPhoto = this.galleryElements.mainPhoto || document.getElementById('currentPhoto');

        if (photoDisplay) {
            photoDisplay.classList.toggle('is-loading', Boolean(isLoading));
        }

        const activeMedia = (mainVideo && mainVideo.classList.contains('is-active')) ? mainVideo : mainPhoto;

        if (activeMedia) {
            activeMedia.style.opacity = isLoading ? '0' : '1';
        }
    }

    setupGalleryTouchSupport(galleryElement) {
        let touchStartX = 0;
        let touchEndX = 0;
        let touchStartY = 0;
        let touchEndY = 0;
        let isDragging = false;
        const minSwipeDistance = 50;
        
        const handleTouchStart = (e) => {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
            isDragging = false;
            galleryElement.classList.add('interacted');
        };
        
        const handleTouchMove = (e) => {
            if (!isDragging) {
                const currentX = e.changedTouches[0].screenX;
                const currentY = e.changedTouches[0].screenY;
                const diffX = Math.abs(currentX - touchStartX);
                const diffY = Math.abs(currentY - touchStartY);
                
                // If horizontal swipe is dominant, prevent default scrolling
                if (diffX > diffY && diffX > 10) {
                    e.preventDefault();
                    isDragging = true;
                }
            } else {
                e.preventDefault();
            }
        };
        
        const handleTouchEnd = (e) => {
            if (!isDragging) return;
            
            touchEndX = e.changedTouches[0].screenX;
            touchEndY = e.changedTouches[0].screenY;
            
            const deltaX = touchEndX - touchStartX;
            const deltaY = touchEndY - touchStartY;
            
            // Check if it's a horizontal swipe and meets minimum distance
            if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > minSwipeDistance) {
                if (deltaX > 0) {
                    // Swipe right - previous photo
                    this.triggerGalleryNavigation('prev');
                } else {
                    // Swipe left - next photo
                    this.triggerGalleryNavigation('next');
                }
            }
            
            isDragging = false;
        };
        
        // Add touch event listeners
        galleryElement.addEventListener('touchstart', handleTouchStart, { passive: false });
        galleryElement.addEventListener('touchmove', handleTouchMove, { passive: false });
        galleryElement.addEventListener('touchend', handleTouchEnd, { passive: false });
        
        // Add tap support for navigation buttons to make them more responsive
        const navButtons = document.querySelectorAll('.gallery-nav-btn');
        navButtons.forEach(button => {
            button.addEventListener('touchend', (e) => {
                e.preventDefault();
                button.click();
            }, { passive: false });
        });
    }

    triggerGalleryNavigation(direction) {
        // Trigger the existing gallery navigation
    const prevBtn = document.getElementById('prevPhoto');
    const nextBtn = document.getElementById('nextPhoto');
        
        if (direction === 'prev' && prevBtn && !prevBtn.disabled) {
            prevBtn.click();
        } else if (direction === 'next' && nextBtn && !nextBtn.disabled) {
            nextBtn.click();
        }

    }

    disableDesktopFeatures() {
        // Hide desktop-specific elements
        const elementsToHide = [
            '.desktop-icons',
            '.taskbar',
            '.start-menu'
        ];
        
        elementsToHide.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => el.style.display = 'none');
        });
        
        // Make window controls visible but non-functional for aesthetic purposes
        const windowControls = document.querySelectorAll('.title-bar-controls');
        windowControls.forEach(control => {
            control.style.display = 'flex';
            control.style.pointerEvents = 'none';
        });
        
        // Remove desktop event listeners (if they exist)
        document.removeEventListener('mousedown', this.handleMouseDown);
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
    }

    ensureDesktopVisible() {
        // No boot screen on mobile — show desktop immediately
        const bootScreen = document.getElementById('bootScreen');
        const desktop = document.getElementById('desktop');
        if (bootScreen) bootScreen.style.display = 'none';
        if (desktop) desktop.style.display = 'block';
        this.finalizeLayout();
    }

    finalizeLayout() {
        // Final adjustments after everything is loaded
        this.adjustViewportHeight();
        this.setupTouchGestures();
        // Make sure header scroll behavior is set up after layout is finalized
        if (!document.querySelector('.mobile-header').hasAttribute('data-scroll-setup')) {
            this.setupHeaderScrollBehavior();
            document.querySelector('.mobile-header').setAttribute('data-scroll-setup', 'true');
        }
    }

    adjustViewportHeight() {
        // Handle mobile viewport height issues
        const vh = window.innerHeight * 0.01;
        document.documentElement.style.setProperty('--vh', `${vh}px`);
        
        window.addEventListener('resize', () => {
            const vh = window.innerHeight * 0.01;
            document.documentElement.style.setProperty('--vh', `${vh}px`);
        });
    }

    setupTouchGestures() {
        // Add touch-friendly interactions
        let touchStartY = 0;
        let touchEndY = 0;
        
        document.addEventListener('touchstart', (e) => {
            touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });
        
        document.addEventListener('touchend', (e) => {
            touchEndY = e.changedTouches[0].screenY;
            // Could add swipe gestures here if needed
        }, { passive: true });
    }
}

// Initialize mobile experience if needed
document.addEventListener('DOMContentLoaded', () => {
    if (isMobileMode()) {
        window.demaMobile = new DemaMobile();
    }
});

// Handle orientation changes and window resizing
window.addEventListener('resize', () => {
    const isMobile = isMobileMode();
    
    if (isMobile && !window.demaMobile) {
        window.demaMobile = new DemaMobile();
    } else if (!isMobile && window.demaMobile) {
        // Reload page to get desktop version
        location.reload();
    }
});
