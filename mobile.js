// Mobile-specific JavaScript for Demà OS
// Enhanced for better performance and user experience

class DemaMobile {
    constructor() {
        this.isMobile = window.innerWidth <= 768;
        this.sections = [];
        this.lastScrollY = 0;
        this.scrollThreshold = 50; // Pixels to scroll before contracting header
        this.socialIcons = [
            { name: 'Instagram', url: 'https://www.instagram.com/dema_bcn/', iconClass: 'mobile-instagram-icon' },
            { name: 'YouTube', url: 'https://www.youtube.com/@dema_bcn', iconClass: 'mobile-youtube-icon' },
            { name: 'TikTok', url: 'https://www.tiktok.com/@dema_bcn', iconClass: 'mobile-tiktok-icon' },
            { name: 'Spotify', url: 'https://open.spotify.com/artist/6whetx1LxWdj7R0PHYsOfm?si=o3bjjR7kTZCVBLUzVvJxaw', iconClass: 'mobile-spotify-icon' }
        ];
        this.init();
    }

    init() {
        if (this.isMobile) {
            // Optimize for mobile performance
            this.optimizeForMobile();
            this.setupMobileLayout();
            this.handleBootSequence();
        }
    }

    optimizeForMobile() {
        // Add viewport meta tag if not present for proper mobile scaling
        if (!document.querySelector('meta[name="viewport"]')) {
            const viewport = document.createElement('meta');
            viewport.name = 'viewport';
            viewport.content = 'width=device-width, initial-scale=1, user-scalable=no';
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
        
        // Disable desktop interactions
        this.disableDesktopFeatures();
    }

    createMobileHeader() {
        const desktop = document.querySelector('.desktop');
        const header = document.createElement('div');
        header.className = 'mobile-header';
        
        // Create social icons
        const socialIconsHtml = this.socialIcons.map(icon => `
            <a href="${icon.url}" class="mobile-social-icon" target="_blank">
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
        
        // Update social links with real URLs if available
        this.updateSocialLinks();
        
        // Setup scroll behavior for header
        this.setupHeaderScrollBehavior();
    }

    updateSocialLinks() {
        // Social links already have real URLs, just make them work
        const mobileSocialLinks = document.querySelectorAll('.mobile-social-icon');
        mobileSocialLinks.forEach((link, index) => {
            const iconData = this.socialIcons[index];
            if (iconData && iconData.url !== '#') {
                link.href = iconData.url;
                // Open in new tab
                link.setAttribute('target', '_blank');
                link.setAttribute('rel', 'noopener noreferrer');
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
        
        // Get all windows and show them in order
        const allWindows = document.querySelectorAll('.window');
        
        // Define the order we want windows to appear on mobile
        const windowOrder = [
            'countdownWindow', // Countdown first - most time-sensitive info
            'tourWindow',
            'aboutWindow',
            'musicWindow',
            'perbarcelonaWindow', // Video section
            'contactWindow',
            'recycleWindow'
        ];

        // Windows to exclude from mobile (not relevant for mobile users)
        const excludeFromMobile = [
            'usersWindow', // System users - desktop-only concept
            'statsWindow'  // System statistics - desktop-only concept
        ];

        // First, add windows in the specified order
        windowOrder.forEach(windowId => {
            const window = document.getElementById(windowId);
            if (window) {
                this.processMobileSection(window);
                mobileContent.appendChild(window);
            }
        });
        
        // Then add any remaining windows that weren't in our order and aren't excluded
        allWindows.forEach(window => {
            if (!windowOrder.includes(window.id) && 
                !excludeFromMobile.includes(window.id) && 
                !mobileContent.contains(window)) {
                this.processMobileSection(window);
                mobileContent.appendChild(window);
            }
        });
        
        desktop.appendChild(mobileContent);
    }

    processMobileSection(window) {
        // Make window visible and static
        window.style.display = 'block';
        window.style.position = 'static';
        window.style.width = '100%';
        window.style.height = 'auto';
        window.style.transform = 'none';
        window.style.left = 'auto';
        window.style.top = 'auto';
        window.style.zIndex = 'auto';
        
        // Update title bar for mobile - keep title text and controls for aesthetics
        const titleBar = window.querySelector('.title-bar');
        const titleBarText = window.querySelector('.title-bar-text');
        const titleBarControls = window.querySelector('.title-bar-controls');
        
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
        const windowBody = window.querySelector('.window-body');
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
        this.processSectionContent(window);
        
        // Add to sections array for potential future navigation
        this.sections.push({
            id: window.id,
            name: titleBarText?.textContent || 'Section',
            element: window
        });
    }

    processSectionContent(window) {
        const windowId = window.id;
        
        switch(windowId) {
            case 'musicWindow':
                this.processMusicSection(window);
                break;
            case 'tourWindow':
                this.processTourSection(window);
                break;
            case 'contactWindow':
                this.processContactSection(window);
                break;
            case 'perbarcelonaWindow':
                this.processVideoSection(window);
                break;
            case 'usersWindow':
                this.processUsersSection(window);
                break;
        }
    }

    processMusicSection(window) {
        const musicContent = window.querySelector('.music-content');
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

    processTourSection(window) {
        const tourDates = window.querySelectorAll('.tour-date');
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

    processContactSection(window) {
        const form = window.querySelector('.contact-form');
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

    processVideoSection(window) {
        const iframe = window.querySelector('iframe');
        if (iframe) {
            // Make video responsive
            iframe.style.width = '100%';
            iframe.style.height = '200px';
            iframe.style.maxWidth = '100%';
        }
        
        const videoContainer = window.querySelector('.video-container');
        if (videoContainer) {
            videoContainer.style.margin = '16px 0';
        }
    }

    processUsersSection(window) {
        const usersList = window.querySelector('.users-list');
        if (usersList) {
            usersList.style.maxHeight = '300px';
            usersList.style.overflowY = 'auto';
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

    handleBootSequence() {
        // Faster boot sequence for mobile
        const bootScreen = document.getElementById('bootScreen');
        const desktop = document.getElementById('desktop');
        
        if (bootScreen && desktop) {
            // Shorter delay for mobile
            setTimeout(() => {
                bootScreen.style.display = 'none';
                desktop.style.display = 'block';
                
                // Trigger mobile layout after boot
                setTimeout(() => {
                    this.finalizeLayout();
                }, 100);
            }, 1500); // 1.5 seconds instead of longer desktop boot
        }
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
    if (window.innerWidth <= 768) {
        window.demaMobile = new DemaMobile();
    }
});

// Handle orientation changes and window resizing
window.addEventListener('resize', () => {
    const isMobile = window.innerWidth <= 768;
    
    if (isMobile && !window.demaMobile) {
        window.demaMobile = new DemaMobile();
    } else if (!isMobile && window.demaMobile) {
        // Reload page to get desktop version
        location.reload();
    }
});
