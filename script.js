// Demà OS - Band website with retro OS interface
// Main application logic

// Constants
const TIMING = {
    BOOT_SCREEN_DURATION: 2000,
    BOOT_FADE_DURATION: 1000,
    CLOCK_UPDATE_INTERVAL: 1000,
    GALLERY_DATA_RETRY_DELAY: 100,
    GALLERY_DATA_MAX_ATTEMPTS: 30,
    COUNTDOWN_UPDATE_INTERVAL: 1000,
    STATS_UPDATE_INTERVAL: 5000
};

const GRID_CONFIG = {
    DEFAULT_SPACING: 100,
    DEFAULT_ICON_WIDTH: 90,
    DEFAULT_ICON_SIZE: 56,
    CASCADE_STEP: 30,
    GRID_OFFSET: 8
};

// Simple HTML escape function for XSS protection
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, function(m) { return map[m]; });
}

/**
 * Main DemaOS class - handles the desktop environment simulation
 */
class DemaOS {
    /**
     * Initialize the DemaOS environment
     */
    constructor() {
        this.windows = new Map();
        this.activeWindow = null;
        this.zIndex = 100;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.isIconDragging = false;
        this.draggedIcon = null;
        this.iconDragOffset = { x: 0, y: 0 };
        this.iconHasMoved = false; // per saber si l'icona s'ha mogut de veritat
        this.dragStartPosition = { x: 0, y: 0 }; // posició inicial
        
        // Grid system - get values from CSS custom properties
        this.initializeGridSystem();
        this.wallpaperIndex = 0;
        this.wallpapers = [
            'url("assets/wallpapers/Clouds_(Windows_95).png")', // el clàssic
            'linear-gradient(135deg, #0c0b72 0%, #1a1955 50%, #0a0850 100%)', // blau nit
            'url("assets/wallpapers/Leonardo_da_Vinci_wallpaper.jpg")', // cultura
            'url("assets/wallpapers/The_Golden_Era_wallpaper.jpg")', // per fer-nos els interessants
            'url("assets/wallpapers/guillem.jpg")' // he posat aixo pq ledu mha obligat
        ];
        this.cascadeOffset = 0; // per no solapar finestres
        this.cascadeStep = GRID_CONFIG.CASCADE_STEP; // pixels d'offset per cada finestra nova
        this.countdownInterval = null; // pel timer del countdown
        this.countdownData = null; // configuració del countdown
        
        this.init();
    }

    /**
     * Initialize the OS environment
     */
    init() {
        this.showBootScreen();
        this.setupEventListeners();
        this.updateClock();
        setInterval(() => this.updateClock(), TIMING.CLOCK_UPDATE_INTERVAL);
        
        // Initialize grid system and position icons
        this.initializeGridSystem();
        this.positionIconsOnGrid();
        
        // Visit counter (simulated)
        this.initViewCounter();
        
        // Load dynamic content
        this.loadTourDates();
        this.loadCountdownData();
        this.loadGalleryData();
    }

    showBootScreen() {
        const bootScreen = document.getElementById('bootScreen');
        const desktop = document.getElementById('desktop');
        
        setTimeout(() => {
            bootScreen.style.display = 'none';
            desktop.style.display = 'block';
            this.playSound('startup');
            
            // Open default windows on first load
            setTimeout(() => {
                this.openWindow('about');
                this.openWindow('tour');
                this.openWindow('perbarcelona');
                this.openWindow('testelis');
                
                // obre countdown si està activat
                this.openCountdownIfEnabled();
            }, 500); // petit delay per assegurar que el desktop s'ha carregat
        }, 3000);
    }

    setupEventListeners() {
        // Desktop icon interactions
        this.setupDesktopIcons();
        
        // Window controls
        this.setupWindowControls();
        
        // Global click handling
        document.addEventListener('click', (e) => this.handleGlobalClick(e));
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
        
        // Wallpaper toggle
        const wallpaperToggle = document.getElementById('wallpaperToggle');
        if (wallpaperToggle) {
            wallpaperToggle.addEventListener('click', () => this.toggleWallpaper());
        } else {
            console.warn('Wallpaper toggle button not found');
        }
        
        // Start button
        document.querySelector('.start-btn').addEventListener('click', () => this.showStartMenu());
        
        // Contact form
        document.getElementById('contactForm').addEventListener('submit', (e) => this.handleContactForm(e));
    }

    setupDesktopIcons() {
        const icons = document.querySelectorAll('.desktop-icon');
        
        icons.forEach(icon => {
            // Double-click to open windows
            icon.addEventListener('dblclick', (e) => {
                e.preventDefault();
                this.playSound('click');
                
                if (icon.classList.contains('social-icon')) {
                    const url = icon.dataset.url;
                    window.open(url, '_blank');
                } else {
                    const windowId = icon.dataset.window;
                    this.openWindow(windowId);
                }
            });
            
            // Single click for selection
            icon.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectIcon(icon);
            });
            
            // Mouse events for dragging icons
            icon.addEventListener('mousedown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.startIconDrag(icon, e.clientX, e.clientY);
                this.selectIcon(icon);
            });
            
            // Touch events for mobile icon dragging
            icon.addEventListener('touchstart', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const touch = e.touches[0];
                this.startIconDrag(icon, touch.clientX, touch.clientY);
                this.selectIcon(icon);
            });
        });
    }

    setupWindowControls() {
        // Window dragging
        document.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        document.addEventListener('mouseup', (e) => this.handleMouseUp(e));
        
        // Touch events for mobile
        document.addEventListener('touchstart', (e) => this.handleTouchStart(e));
        document.addEventListener('touchmove', (e) => this.handleTouchMove(e));
        document.addEventListener('touchend', (e) => this.handleTouchEnd(e));
    }

    selectIcon(icon) {
        // Remove selection from all icons
        document.querySelectorAll('.desktop-icon').forEach(i => i.classList.remove('selected'));
        
        // Select clicked icon
        icon.classList.add('selected');
    }

    openWindow(windowId) {
        const windowElement = document.getElementById(windowId + 'Window');
        if (!windowElement) return;

        this._showAndPositionWindow(windowElement, windowId);
        this._initializeSpecialWindows(windowId);
        this._finalizeWindowOpen(windowElement, windowId);
    }

    _showAndPositionWindow(windowElement, windowId) {
        windowElement.style.display = 'block';
        
        // Position window only if it's not already positioned
        if (!this.windows.has(windowId)) {
            const rect = this.getWindowPosition(windowId);
            windowElement.style.left = rect.x + 'px';
            windowElement.style.top = rect.y + 'px';
        }
    }

    _initializeSpecialWindows(windowId) {
        const windowHandlers = {
            'stats': () => this.updateStatsWindow(),
            'users': () => this.updateUsersWindow(),
            'countdown': () => this.startCountdown(),
            'gallery': () => this._initializeGalleryWindow()
        };

        const handler = windowHandlers[windowId];
        if (handler) {
            handler();
        }
    }

    async _initializeGalleryWindow() {
        if (this.galleryData && this.galleryData.photos && this.galleryData.photos.length > 0) {
            this.initializeGallery();
            return;
        }

        console.log('Gallery window opened but data not ready, waiting...');
        await this._waitForGalleryData();
    }

    async _waitForGalleryData() {
        let attempts = 0;
        const maxAttempts = 30;
        const delay = 100;

        while (attempts < maxAttempts && !this._isGalleryDataReady()) {
            await new Promise(resolve => setTimeout(resolve, delay));
            attempts++;
        }

        if (this._isGalleryDataReady()) {
            console.log('Gallery data loaded, initializing...');
            this.initializeGallery();
        } else {
            this._handleGalleryLoadError();
        }
    }

    _isGalleryDataReady() {
        return this.galleryData && this.galleryData.photos && this.galleryData.photos.length > 0;
    }

    _handleGalleryLoadError() {
        console.error('Gallery data failed to load after 3 seconds');
        const photoCounter = document.getElementById('photoCounter');
        if (photoCounter) {
            photoCounter.textContent = 'Error carregant fotos';
        }
    }

    _finalizeWindowOpen(windowElement, windowId) {
        this.bringToFront(windowElement);
        this.windows.set(windowId, windowElement);
        this.addToTaskbar(windowId, windowElement.dataset.title || windowId);
        this.setupWindowControlButtons(windowElement);
    }

    closeWindow(windowElement) {
        const windowId = this.getWindowId(windowElement);
        
        windowElement.style.display = 'none';
        this.windows.delete(windowId);
        this.removeFromTaskbar(windowId);
        
        if (this.activeWindow === windowElement) {
            this.activeWindow = null;
        }
        
        this.playSound('click');
    }

    minimizeWindow(windowElement) {
        windowElement.style.display = 'none';
        if (this.activeWindow === windowElement) {
            this.activeWindow = null;
        }
        this.playSound('click');
    }

    restoreWindow(windowElement) {
        windowElement.style.display = 'block';
        this.bringToFront(windowElement);
        this.playSound('click');
    }

    bringToFront(windowElement) {
        this.zIndex++;
        windowElement.style.zIndex = this.zIndex;
        windowElement.classList.add('active');
        
        // Remove active class from other windows
        document.querySelectorAll('.window.active').forEach(w => {
            if (w !== windowElement) {
                w.classList.remove('active');
            }
        });
        
        this.activeWindow = windowElement;
        this.updateTaskbarActive();
    }

    setupWindowControlButtons(windowElement) {
        const titleBarControls = windowElement.querySelector('.title-bar-controls');
        if (!titleBarControls) return;
        
        const buttons = titleBarControls.querySelectorAll('button');
        if (buttons.length >= 2) {
            const minimizeBtn = buttons[0]; // First button is minimize
            const closeBtn = buttons[1];   // Second button is close
            
            // Remove existing listeners by cloning
            const newMinimizeBtn = minimizeBtn.cloneNode(true);
            const newCloseBtn = closeBtn.cloneNode(true);
            minimizeBtn.parentNode.replaceChild(newMinimizeBtn, minimizeBtn);
            closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
            
            // Add new listeners
            newMinimizeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.minimizeWindow(windowElement);
            });
            
            newCloseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeWindow(windowElement);
            });
        }
    }

    getWindowPosition(windowId = null) {
        // Check if this is one of the initial windows that should have specific positions
        const initialWindows = ['about', 'tour', 'perbarcelona', 'testelis', 'countdown', 'gallery'];
        
        if (initialWindows.includes(windowId)) {
            return this.getSpecificWindowPosition(windowId);
        } else {
            return this.getRandomWindowPosition(windowId);
        }
    }

    getSpecificWindowPosition(windowId) {
        // Specific positioning for initial windows
        let x, y;
        
        // Get window element to read its size from HTML/CSS
        const windowElement = document.getElementById(windowId + 'Window');
        const width = windowElement ? (windowElement.offsetWidth || 500) : 500;
        const height = windowElement ? (windowElement.offsetHeight || 400) : 400;
        
        // Calculate positions based on window ID
        switch (windowId) {
            case 'about':
                // Center the about window
                x = (window.innerWidth - width) / 2;
                y = (window.innerHeight - height - 60) / 4; // 60px for taskbar
                break;
                
            case 'perbarcelona':
                // Position video window to the left
                x = 200; // Left margin
                y = 400; // Top margin
                break;
                
            case 'tour':
                // Position tour window to the right
                x = window.innerWidth - width - 300; // Right margin
                y = 400; // Top margin
                break;
                
            case 'testelis':
                // Position T'estelis window in the top-right corner
                x = window.innerWidth - width - 20; // 20px margin from right edge
                y = 20; // 20px margin from top
                break;
                
            case 'countdown':
                // Position countdown window in the center bottom
                x = (window.innerWidth - width) / 2;
                y = window.innerHeight - height - 60; 
                break;
                
            case 'gallery':
                // Position gallery window in the center
                x = (window.innerWidth - width) / 2;
                y = (window.innerHeight - height - 60) / 2;
                break;
                
            default:
                // Fallback to center
                x = (window.innerWidth - width) / 2;
                y = (window.innerHeight - height - 60) / 2;
        }
        
        // Ensure windows stay within bounds
        x = Math.max(20, Math.min(x, window.innerWidth - width - 20));
        y = Math.max(20, Math.min(y, window.innerHeight - height - 60));
        
        return { x, y };
    }

    getRandomWindowPosition(windowId = null) {
        // Get window element to read its size from HTML/CSS
        const windowElement = document.getElementById(windowId + 'Window');
        const width = windowElement ? (windowElement.offsetWidth || 500) : 500;
        const height = windowElement ? (windowElement.offsetHeight || 400) : 400;
        
        // Calculate max position based on actual window size to prevent off-screen spawning
        const maxX = window.innerWidth - width - 20; // 20px margin from right edge
        const maxY = window.innerHeight - height - 60; // 60px margin for taskbar
        
        return {
            x: Math.max(20, Math.random() * Math.max(20, maxX)),
            y: Math.max(20, Math.random() * Math.max(20, maxY))
        };
    }

    getWindowId(windowElement) {
        return windowElement.id.replace('Window', '');
    }

    // Dragging functionality
    handleMouseDown(e) {
        const header = e.target.closest('.title-bar');
        if (!header) return;
        
        const windowElement = header.closest('.window');
        if (!windowElement) return;
        
        e.preventDefault();
        this.startDragging(windowElement, e.clientX, e.clientY);
    }

    handleTouchStart(e) {
        const header = e.target.closest('.title-bar');
        if (!header) return;
        
        const windowElement = header.closest('.window');
        if (!windowElement) return;
        
        e.preventDefault();
        const touch = e.touches[0];
        this.startDragging(windowElement, touch.clientX, touch.clientY);
    }

    startDragging(windowElement, clientX, clientY) {
        this.isDragging = true;
        this.draggedWindow = windowElement;
        
        const rect = windowElement.getBoundingClientRect();
        this.dragOffset = {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
        
        this.bringToFront(windowElement);
        document.body.style.cursor = 'move';
        document.body.style.userSelect = 'none';
    }

    handleMouseMove(e) {
        if (this.isIconDragging && this.draggedIcon) {
            e.preventDefault();
            this.updateIconPosition(e.clientX, e.clientY);
        } else if (this.isDragging && this.draggedWindow) {
            e.preventDefault();
            this.updateWindowPosition(e.clientX, e.clientY);
        }
    }

    handleTouchMove(e) {
        const touch = e.touches[0];
        if (this.isIconDragging && this.draggedIcon) {
            e.preventDefault();
            this.updateIconPosition(touch.clientX, touch.clientY);
        } else if (this.isDragging && this.draggedWindow) {
            e.preventDefault();
            this.updateWindowPosition(touch.clientX, touch.clientY);
        }
    }

    updateWindowPosition(clientX, clientY) {
        const x = clientX - this.dragOffset.x;
        const y = clientY - this.dragOffset.y;
        
        // Keep window within bounds
        const maxX = window.innerWidth - this.draggedWindow.offsetWidth;
        const maxY = window.innerHeight - this.draggedWindow.offsetHeight - 40; // Account for taskbar
        
        this.draggedWindow.style.left = Math.max(0, Math.min(x, maxX)) + 'px';
        this.draggedWindow.style.top = Math.max(0, Math.min(y, maxY)) + 'px';
    }

    handleMouseUp(e) {
        if (this.isIconDragging) {
            this.stopIconDragging();
        } else {
            this.stopDragging();
        }
    }

    handleTouchEnd(e) {
        if (this.isIconDragging) {
            this.stopIconDragging();
        } else {
            this.stopDragging();
        }
    }

    stopDragging() {
        this.isDragging = false;
        this.draggedWindow = null;
        this.draggedIcon = null;
        this.isIconDragging = false;
        this.iconHasMoved = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }

    // Icon dragging functionality
    startIconDrag(icon, clientX, clientY) {
        this.isIconDragging = true;
        this.draggedIcon = icon;
        this.iconHasMoved = false;
        
        // Store the original position before dragging starts
        this.originalIconPosition = {
            x: parseInt(icon.style.left) || 0,
            y: parseInt(icon.style.top) || 0
        };
        
        // Get the desktop-icons container since that's the coordinate system we're working in
        const desktopIcons = document.querySelector('.desktop-icons');
        const containerRect = desktopIcons.getBoundingClientRect();
        const iconRect = icon.getBoundingClientRect();
        
        // Calculate offset relative to the container coordinate system
        this.iconDragOffset = {
            x: clientX - iconRect.left,
            y: clientY - iconRect.top
        };
        
        // Store the starting position to detect actual movement
        this.dragStartPosition = {
            x: clientX,
            y: clientY
        };
        
        // Add visual feedback
        icon.style.opacity = '0.7';
        icon.style.zIndex = '1000';
        document.body.style.cursor = 'move';
        document.body.style.userSelect = 'none';
    }

    updateIconPosition(clientX, clientY) {
        if (!this.isIconDragging || !this.draggedIcon) return;
        
        // Check if user has moved enough to be considered "dragging"
        const moveThreshold = 5; // pixels
        const deltaX = Math.abs(clientX - this.dragStartPosition.x);
        const deltaY = Math.abs(clientY - this.dragStartPosition.y);
        
        if (deltaX > moveThreshold || deltaY > moveThreshold) {
            this.iconHasMoved = true;
        }
        
        // Only update position if user has actually moved the icon
        if (this.iconHasMoved) {
            // Get the desktop-icons container offset since that's where icons are normally positioned
            const desktopIcons = document.querySelector('.desktop-icons');
            const containerRect = desktopIcons.getBoundingClientRect();
            
            // Calculate position relative to the desktop-icons container
            const x = clientX - this.iconDragOffset.x - containerRect.left;
            const y = clientY - this.iconDragOffset.y - containerRect.top;
            
            // Keep icon within desktop bounds (relative to container)
            const desktop = document.getElementById('desktop');
            const maxX = desktop.offsetWidth - this.draggedIcon.offsetWidth - 16; // Account for container offset
            const maxY = desktop.offsetHeight - this.draggedIcon.offsetHeight - 48; // Account for taskbar and container offset
            
            const newX = Math.max(0, Math.min(x, maxX));
            const newY = Math.max(0, Math.min(y, maxY));
            
            // During dragging, show the free position (we'll snap on drop)
            this.draggedIcon.style.position = 'absolute';
            this.draggedIcon.style.left = newX + 'px';
            this.draggedIcon.style.top = newY + 'px';
            
            // Add visual feedback for collision detection
            this.updateDragVisualFeedback(newX, newY);
        }
    }

    stopIconDragging() {
        if (this.draggedIcon) {
            // Reset visual feedback first
            this.resetDragVisualFeedback();
            
            // Only snap to grid if the icon was actually moved
            if (this.iconHasMoved) {
                const currentLeft = parseInt(this.draggedIcon.style.left) || 0;
                const currentTop = parseInt(this.draggedIcon.style.top) || 0;
                
                const snappedPosition = this.snapToGrid(currentLeft, currentTop);
                this.draggedIcon.style.left = snappedPosition.x + 'px';
                this.draggedIcon.style.top = snappedPosition.y + 'px';
            }
            
            this.draggedIcon.style.opacity = '1';
            this.draggedIcon.style.zIndex = '';
        }
        this.isIconDragging = false;
        this.draggedIcon = null;
        this.iconHasMoved = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }

    // Visual feedback during dragging to show valid/invalid drop zones
    updateDragVisualFeedback(x, y) {
        if (!this.draggedIcon) return;
        
        // Get the grid position where the icon would snap
        const gridPos = this.getGridPosition(x, y);
        const isOccupied = this.isGridPositionOccupied(gridPos.col, gridPos.row);
        
        if (isOccupied) {
            // Invalid position - Windows 98 style "no drop" cursor and slight dimming
            document.body.style.cursor = 'not-allowed';
            this.draggedIcon.style.filter = 'brightness(0.6)';
        } else {
            // Valid position - normal drag cursor and full brightness
            document.body.style.cursor = 'move';
            this.draggedIcon.style.filter = 'brightness(1)';
        }
    }

    // Reset visual feedback when dragging stops
    resetDragVisualFeedback() {
        if (this.draggedIcon) {
            this.draggedIcon.style.filter = '';
            document.body.style.cursor = '';
        }
    }

    // Helper method to snap coordinates to grid
    snapToGrid(x, y) {
        // Calculate the closest grid position
        const gridPos = this.getGridPosition(x, y);
        
        // Check for collision with other icons
        if (this.isGridPositionOccupied(gridPos.col, gridPos.row)) {
            // If position is occupied, return to original position
            console.log('Position occupied, returning to original position');
            return {
                x: this.originalIconPosition.x,
                y: this.originalIconPosition.y
            };
        }
        
        // If position is free, snap to the grid
        const pixelPos = this.getPixelPosition(gridPos.col, gridPos.row);
        
        // Ensure the snapped position is within bounds
        const desktop = document.getElementById('desktop');
        const maxX = desktop.offsetWidth - this.iconWidth - this.gridOffset;
        const maxY = desktop.offsetHeight - this.iconWidth - 40 - this.gridOffset; // Account for taskbar
        
        return {
            x: Math.max(0, Math.min(pixelPos.x, maxX)),
            y: Math.max(0, Math.min(pixelPos.y, maxY))
        };
    }

    // Check if a grid position is occupied by another icon
    isGridPositionOccupied(col, row) {
        const icons = document.querySelectorAll('.desktop-icon');
        
        for (let icon of icons) {
            // Skip the currently dragged icon
            if (icon === this.draggedIcon) continue;
            
            const iconLeft = parseInt(icon.style.left) || 0;
            const iconTop = parseInt(icon.style.top) || 0;
            const iconGridPos = this.getGridPosition(iconLeft, iconTop);
            
            if (iconGridPos.col === col && iconGridPos.row === row) {
                return true;
            }
        }
        return false;
    }

    // Initialize grid system from CSS custom properties
    initializeGridSystem() {
        const computedStyle = getComputedStyle(document.documentElement);
        
        // Get values from CSS custom properties
        this.gridSize = parseInt(computedStyle.getPropertyValue('--icon-spacing')) || 100;
        this.iconWidth = parseInt(computedStyle.getPropertyValue('--icon-width')) || 90;
        this.iconSize = parseInt(computedStyle.getPropertyValue('--icon-size')) || 56;
        
        // Container offset (from .desktop-icons CSS)
        this.gridOffset = GRID_CONFIG.GRID_OFFSET;
        
        console.log('Grid system initialized:', {
            gridSize: this.gridSize,
            iconWidth: this.iconWidth,
            iconSize: this.iconSize,
            gridOffset: this.gridOffset
        });
    }

    // Position all desktop icons on the grid automatically
    positionIconsOnGrid() {
        const icons = document.querySelectorAll('.desktop-icon');
        let row = 0;
        let col = 0;
        const maxRows = Math.floor((window.innerHeight - 100) / this.gridSize); // Account for taskbar
        
        icons.forEach((icon, index) => {
            // Calculate grid position
            const x = col * this.gridSize;
            const y = row * this.gridSize;
            
            // Apply position
            icon.style.position = 'absolute';
            icon.style.left = x + 'px';
            icon.style.top = y + 'px';
            
            // Store original grid position for easy reset
            icon.dataset.gridX = col;
            icon.dataset.gridY = row;
            
            // Move to next grid position
            row++;
            if (row >= maxRows) {
                row = 0;
                col++;
            }
        });
    }

    // Get grid position from pixel coordinates
    getGridPosition(x, y) {
        const col = Math.round(x / this.gridSize);
        const row = Math.round(y / this.gridSize);
        return { col, row };
    }

    // Get pixel coordinates from grid position
    getPixelPosition(col, row) {
        return {
            x: col * this.gridSize,
            y: row * this.gridSize
        };
    }

    // Taskbar management
    addToTaskbar(windowId, title) {
        const taskbarWindows = document.getElementById('taskbarWindows');
        
        // Check if already exists
        if (document.getElementById('taskbar-' + windowId)) return;
        
        // Map window IDs to their corresponding icon classes
        const windowIconMap = {
            'about': 'about-icon',
            'music': 'music-icon',
            'tour': 'tour-icon',
            'contact': 'contact-icon',
            'recycle': 'recycle-icon',
            'perbarcelona': 'music-icon', // Use music icon for video content
            'testelis': 'notepad-icon',
            'countdown': 'note-icon'
        };
        
        const taskbarWindow = document.createElement('div');
        taskbarWindow.className = 'taskbar-window';
        taskbarWindow.id = 'taskbar-' + windowId;
        
        // Create icon element
        const iconClass = windowIconMap[windowId] || 'about-icon'; // fallback to about icon
        const iconElement = document.createElement('div');
        iconElement.className = `taskbar-window-icon ${iconClass}`;
        
        // Create text element
        const textElement = document.createElement('span');
        textElement.textContent = title;
        
        // Append icon and text to taskbar window
        taskbarWindow.appendChild(iconElement);
        taskbarWindow.appendChild(textElement);
        
        taskbarWindow.addEventListener('click', () => {
            const windowElement = document.getElementById(windowId + 'Window');
            if (windowElement.style.display === 'none') {
                this.restoreWindow(windowElement);
            } else if (this.activeWindow === windowElement) {
                this.minimizeWindow(windowElement);
            } else {
                this.bringToFront(windowElement);
            }
        });
        
        taskbarWindows.appendChild(taskbarWindow);
        this.updateTaskbarActive();
    }

    removeFromTaskbar(windowId) {
        const taskbarWindow = document.getElementById('taskbar-' + windowId);
        if (taskbarWindow) {
            taskbarWindow.remove();
        }
    }

    updateTaskbarActive() {
        document.querySelectorAll('.taskbar-window').forEach(tw => tw.classList.remove('active'));
        
        if (this.activeWindow) {
            const windowId = this.getWindowId(this.activeWindow);
            const taskbarWindow = document.getElementById('taskbar-' + windowId);
            if (taskbarWindow) {
                taskbarWindow.classList.add('active');
            }
        }
    }

    // Global click handling
    handleGlobalClick(e) {
        // Close any open menus, deselect icons if clicking on desktop
        if (e.target.classList.contains('desktop') || e.target.classList.contains('wallpaper')) {
            document.querySelectorAll('.desktop-icon').forEach(icon => icon.classList.remove('selected'));
        }
        
        // Bring clicked window to front
        const windowElement = e.target.closest('.window');
        if (windowElement && windowElement.style.display !== 'none') {
            this.bringToFront(windowElement);
        }
    }

    // Keyboard shortcuts
    handleKeyboard(e) {
        // Alt + F4 to close active window
        if (e.altKey && e.key === 'F4') {
            e.preventDefault();
            if (this.activeWindow) {
                this.closeWindow(this.activeWindow);
            }
        }
        
        // Escape to minimize active window
        if (e.key === 'Escape' && this.activeWindow) {
            this.minimizeWindow(this.activeWindow);
        }
        
        // Enter to open selected icon
        if (e.key === 'Enter') {
            const selectedIcon = document.querySelector('.desktop-icon.selected');
            if (selectedIcon) {
                selectedIcon.dispatchEvent(new Event('dblclick'));
            }
        }
    }

    // Wallpaper management
    toggleWallpaper() {
        this.wallpaperIndex = (this.wallpaperIndex + 1) % this.wallpapers.length;
        const wallpaper = document.querySelector('.wallpaper');
        
        console.log('Switching to wallpaper:', this.wallpaperIndex, this.wallpapers[this.wallpaperIndex]);
        
        const currentWallpaper = this.wallpapers[this.wallpaperIndex];
        
        // Check if it's an image or a gradient/solid color
        if (currentWallpaper.startsWith('url(')) {
            // It's an image wallpaper - set with CRT effects
            wallpaper.style.backgroundImage = 
                currentWallpaper + ', ' +
                'radial-gradient(circle at 25% 25%, rgba(255,255,255,0.02) 1px, transparent 1px), ' +
                'radial-gradient(circle at 75% 75%, rgba(0,0,0,0.02) 1px, transparent 1px)';
            wallpaper.style.backgroundSize = 'cover, 4px 4px, 4px 4px';
            wallpaper.style.backgroundPosition = 'center, 0 0, 2px 2px';
        } else {
            // It's a solid color or gradient - apply directly with CRT effects
            wallpaper.style.backgroundImage = 
                currentWallpaper + ', ' +
                'radial-gradient(circle at 25% 25%, rgba(255,255,255,0.02) 1px, transparent 1px), ' +
                'radial-gradient(circle at 75% 75%, rgba(0,0,0,0.02) 1px, transparent 1px)';
            wallpaper.style.backgroundSize = 'auto, 4px 4px, 4px 4px';
            wallpaper.style.backgroundPosition = 'center, 0 0, 2px 2px';
        }
        
        this.playSound('click');
    }

    // Rellotge del sistema
    updateClock() {
        const timeElement = document.getElementById('systemTime');
        const now = new Date();
        const timeString = now.toLocaleTimeString('ca-ES', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false // format 24h com déu mana
        });
        timeElement.textContent = timeString;
    }

    // Visit counter (simulated statistics)
    initViewCounter() {
        // Generate a realistic starting number for a smaller band
        const baseViews = 42; // More humble starting point
        const daysThisYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
        const dailyVariation = Math.floor(Math.random() * 8) + 2; // 2-10 views per day variation
        
        this.viewCount = baseViews + (daysThisYear * dailyVariation) + Math.floor(Math.random() * 20);
        this.totalViews = this.viewCount * 3 + Math.floor(Math.random() * 500); // More modest historical total
        this.todayViews = Math.floor(Math.random() * 15) + 5; // Today's views (5-20)
        
        this.updateViewCounter();
        this.setupViewCounterClick();
        
        // Slowly increment view counter occasionally
        setInterval(() => {
            if (Math.random() < 0.08) { // 8% chance every interval (less frequent)
                const increment = Math.floor(Math.random() * 2) + 1; // 1-2 views
                this.viewCount += increment;
                this.totalViews += increment;
                this.todayViews += increment;
                this.updateViewCounter();
                this.updateStatsWindow();
            }
        }, 20000); // Every 20 seconds (less frequent)
    }

    updateViewCounter() {
        const viewCounterElement = document.getElementById('viewCounter');
        if (viewCounterElement) {
            viewCounterElement.textContent = `👥 ${this.viewCount.toLocaleString()}`;
        }
    }

    setupViewCounterClick() {
        const viewCounterElement = document.getElementById('viewCounter');
        if (viewCounterElement) {
            viewCounterElement.style.cursor = 'pointer';
            viewCounterElement.addEventListener('click', () => {
                this.openWindow('stats');
            });
        }
    }

    updateStatsWindow() {
        const totalVisitsElement = document.getElementById('totalVisits');
        const todayVisitsElement = document.getElementById('todayVisits');
        const lastUpdateElement = document.getElementById('lastUpdate');
        
        if (totalVisitsElement) {
            totalVisitsElement.textContent = this.totalViews.toLocaleString();
        }
        if (todayVisitsElement) {
            todayVisitsElement.textContent = this.todayViews.toLocaleString();
        }
        if (lastUpdateElement) {
            const now = new Date();
            const timeString = now.toLocaleTimeString('ca-ES', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false 
            });
            lastUpdateElement.textContent = timeString;
        }
    }

    async updateUsersWindow() {
        try {
            // Static/fake users list - no external file needed
            const users = [
                { name: "guitarra_demon", avatar: "🎸", status: "Tocant riffs" },
                { name: "baix_killer", avatar: "🎵", status: "Marcant el ritme" },
                { name: "drums_beast", avatar: "🥁", status: "Petant fort" },
                { name: "voice_angel", avatar: "🎤", status: "Cantant" },
                { name: "sound_tech", avatar: "🎚️", status: "Ajustant so" },
                { name: "fan_hardcore", avatar: "🤘", status: "Esperant concerts" },
                { name: "music_lover", avatar: "🎧", status: "Escoltant Demà" },
                { name: "rock_catala", avatar: "🏴", status: "Visca el rock català!" }
            ];
            
            const usersListElement = document.getElementById('usersList');
            const totalUsersElement = document.getElementById('totalUsers');
            const onlineUsersElement = document.getElementById('onlineUsers');
            const lastScanTimeElement = document.getElementById('lastScanTime');
            
            if (!usersListElement) return;
            
            // Randomly select 5-8 users from the list
            const numberOfUsersToShow = Math.floor(Math.random() * 4) + 5; // 5-8 users
            const shuffledUsers = [...users].sort(() => Math.random() - 0.5);
            const selectedUsers = shuffledUsers.slice(0, numberOfUsersToShow);
            
            // Generate random online status and last seen times for selected users
            const usersWithStatus = selectedUsers.map(user => ({
                ...user,
                isOnline: Math.random() > 0.6, // 40% chance of being online
                lastSeen: this.generateRandomLastSeen()
            }));
            
            // Sort users: online users first, then by last seen time
            usersWithStatus.sort((a, b) => {
                if (a.isOnline && !b.isOnline) return -1;
                if (!a.isOnline && b.isOnline) return 1;
                return new Date(b.lastSeen) - new Date(a.lastSeen);
            });
            
            // Generate HTML for users list
            const usersHTML = usersWithStatus.map(user => `
                <div class="user-item">
                    <div class="user-status ${user.isOnline ? 'online' : 'offline'}"></div>
                    <div class="user-avatar">👤</div>
                    <div class="user-info">
                        <div class="user-name">${user.name}</div>
                        <div class="user-description">${user.description}</div>
                    </div>
                    <div class="user-time">
                        ${user.isOnline ? 'En línia' : this.formatLastSeen(user.lastSeen)}
                    </div>
                </div>
            `).join('');
            
            usersListElement.innerHTML = usersHTML;
            
            // Update stats
            const onlineCount = usersWithStatus.filter(u => u.isOnline).length;
            if (totalUsersElement) totalUsersElement.textContent = users.length; // Show total from JSON
            if (onlineUsersElement) onlineUsersElement.textContent = onlineCount; // Show online from displayed users
            
            // Update scan time
            if (lastScanTimeElement) {
                const now = new Date();
                const timeString = now.toLocaleTimeString('ca-ES', { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false 
                });
                lastScanTimeElement.textContent = timeString;
            }
            
        } catch (error) {
            console.error('Error loading users:', error);
            const usersListElement = document.getElementById('usersList');
            if (usersListElement) {
                usersListElement.innerHTML = '<div style="padding: 20px; text-align: center; color: #666;">Error carregant usuaris</div>';
            }
        }
    }

    generateRandomLastSeen() {
        const now = new Date();
        const randomMinutesAgo = Math.floor(Math.random() * 10080); // Random time up to 1 week ago
        return new Date(now - randomMinutesAgo * 60000);
    }

    formatLastSeen(lastSeenDate) {
        const now = new Date();
        const diffMs = now - lastSeenDate;
        const diffMinutes = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMinutes / 60);
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffMinutes < 1) return 'Ara mateix';
        if (diffMinutes < 60) return `Fa ${diffMinutes}min`;
        if (diffHours < 24) return `Fa ${diffHours}h`;
        if (diffDays === 1) return 'Ahir';
        if (diffDays < 7) return `Fa ${diffDays} dies`;
        return 'Fa temps';
    }

    // Start menu (simple implementation)
    showStartMenu() {
        // Simple alert for now - could be expanded to full start menu
        this.playSound('click');
        
        const menu = document.createElement('div');
        menu.className = 'start-menu-popup';
        menu.innerHTML = `
            <div style="
                position: fixed;
                bottom: 40px;
                left: 8px;
                background: #c0c0c0;
                border: 2px outset #c0c0c0;
                padding: 8px;
                z-index: 10001;
                box-shadow: 2px 2px 4px rgba(0,0,0,0.3);
                min-width: 200px;
            ">
                <div style="padding: 8px; border-bottom: 1px solid #808080; font-weight: bold;">Demà OS</div>
                <div style="padding: 4px 8px; cursor: pointer;" onclick="demaOS.openWindow('about')">📄 Sobre Demà</div>
                <div style="padding: 4px 8px; cursor: pointer;" onclick="demaOS.openWindow('music')">🎵 Música Nova</div>
                <div style="padding: 4px 8px; cursor: pointer;" onclick="demaOS.openWindow('perbarcelona')">🎬 Per Barcelona</div>
                <div style="padding: 4px 8px; cursor: pointer;" onclick="demaOS.openWindow('tour')">📅 Concerts</div>
                <div style="padding: 4px 8px; cursor: pointer;" onclick="demaOS.openWindow('contact')">💌 Contacte</div>
                <div style="padding: 4px 8px; cursor: pointer;" onclick="demaOS.openWindow('countdown')">⏰ Compte Enrere</div>
                <div style="padding: 4px 8px; cursor: pointer;" onclick="demaOS.openWindow('users')">👥 Usuaris</div>
                <div style="padding: 4px 8px; cursor: pointer;" onclick="demaOS.openWindow('stats')">📊 Estadístiques</div>
                <div style="padding: 4px 8px; cursor: pointer;" onclick="demaOS.openWindow('testelis')">🎨 T'estelis</div>
                <div style="padding: 4px 8px; border-top: 1px solid #808080; cursor: pointer;" onclick="demaOS.toggleWallpaper()">🌅 Canviar Fons</div>
            </div>
        `;
        
        // Remove existing menu
        const existingMenu = document.querySelector('.start-menu-popup');
        if (existingMenu) {
            existingMenu.remove();
            return;
        }
        
        document.body.appendChild(menu);
        
        // Auto-close after 5 seconds or on click outside
        setTimeout(() => {
            if (menu.parentNode) menu.remove();
        }, 5000);
        
        // Close on click outside
        const closeMenu = (e) => {
            if (!menu.contains(e.target) && !e.target.closest('.start-btn')) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        
        setTimeout(() => {
            document.addEventListener('click', closeMenu);
        }, 100);
    }

    // Gestió del formulari de contacte
    handleContactForm(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const data = Object.fromEntries(formData);
        
        // validació simple del formulari
        if (!data.name || !data.email || !data.message) {
            this.showDialog('Error', 'Ei, omple tots els camps, que no costa res!');
            return;
        }
        
        // Crear el mailto amb informació pre-omplerta
        this.openEmailClient(data);
        
        // buida el formulari després d'un petit delay
        setTimeout(() => {
            e.target.reset();
        }, 500);
        
        this.playSound('success');
    }

    // Obre el client d'email de l'usuari amb informació pre-omplerta
    openEmailClient(data) {
        const bandEmail = 'contacte@demabcn.cat';
        
        // Mapa de subjects per fer-ho més clar
        const subjectMap = {
            'general': 'Consulta General',
            'booking': 'Sol·licitud de Concert',
            'collaboration': 'Proposta de Col·laboració',
            'press': 'Consulta de Premsa/Mitjans',
            'fan': 'Missatge de Fan'
        };
        
        // Crear el subject personalitzat
        const subjectPrefix = subjectMap[data.subject] || 'Consulta General';
        const subject = `[Web Demà] ${subjectPrefix}`;
        
        // Crear el cos del correu amb la informació del formulari
        const body = `Hola equip de Demà!

Nom: ${data.name}
Email: ${data.email}
Tipus de consulta: ${subjectMap[data.subject] || data.subject}

Missatge:
${data.message}

---
Enviat des de la pàgina web demabcn.cat`;

        // Crear la URL mailto
        const mailtoUrl = `mailto:${bandEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        
        // Obrir el client d'email
        try {
            window.location.href = mailtoUrl;
            this.showDialog('Client d\'email obert', 
                `S'ha obert el teu client d'email amb la informació pre-omplerta. 
                 Si no s'ha obert automàticament, pots enviar-nos un correu directament a: ${bandEmail}`);
        } catch (error) {
            console.error('Error opening email client:', error);
            this.showDialog('Error', 
                `No s'ha pogut obrir el client d'email automàticament. 
                 Si us plau, envia'ns un correu manualment a: ${bandEmail}`);
        }
    }

    // Sistema simple de diàlegs
    showDialog(title, message) {
        const dialog = document.createElement('div');
        dialog.className = 'dialog-window';
        dialog.innerHTML = `
            <div style="
                position: fixed;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: #c0c0c0;
                border: 2px outset #c0c0c0;
                box-shadow: 4px 4px 8px rgba(0,0,0,0.3);
                z-index: 10002;
                min-width: 300px;
            ">
                <div style="
                    background: linear-gradient(90deg, #0000ff, #0080ff);
                    color: white;
                    padding: 4px 8px;
                    font-weight: bold;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                ">
                    <span>${title}</span>
                    <button onclick="this.closest('.dialog-window').remove()" style="
                        width: 20px;
                        height: 18px;
                        background: #c0c0c0;
                        border: 1px outset #c0c0c0;
                        cursor: pointer;
                    ">×</button>
                </div>
                <div style="padding: 16px;">
                    <p style="margin-bottom: 16px;">${message}</p>
                    <button onclick="this.closest('.dialog-window').remove()" style="
                        background: #c0c0c0;
                        border: 2px outset #c0c0c0;
                        padding: 6px 16px;
                        cursor: pointer;
                        font-family: 'MS Sans Serif', sans-serif;
                        float: right;
                    ">OK</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(dialog);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (dialog.parentNode) dialog.remove();
        }, 5000);
    }

    // Sons (implementació bàsica però que funciona)
    playSound(type) {
        // Simple beep implementation
        // In a real implementation we would load actual sound files
        
        if (!this.audioContext) {
            try {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            } catch (e) {
                return; // Audio not supported
            }
        }
        
        const frequencies = {
            click: 800,   // clic normal
            startup: 600, // so d'arrencada
            success: 1000 // quan algo va bé
        };
        
        const frequency = frequencies[type] || 800;
        
        try {
            const oscillator = this.audioContext.createOscillator();
            const gainNode = this.audioContext.createGain();
            
            oscillator.connect(gainNode);
            gainNode.connect(this.audioContext.destination);
            
            oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
            oscillator.type = 'square';
            
            gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
            gainNode.gain.linearRampToValueAtTime(0.1, this.audioContext.currentTime + 0.01);
            gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.1);
            
            oscillator.start(this.audioContext.currentTime);
            oscillator.stop(this.audioContext.currentTime + 0.1);
        } catch (e) {
            // Silence any audio errors
        }
    }
}

// Initialize the OS when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.demaOS = new DemaOS();
});

// Global function for template usage
function openWindow(windowId) {
    if (window.demaOS) {
        window.demaOS.openWindow(windowId);
    }
}

// Prevent right-click context menu for authentic OS feel
document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    return false;
});

// Handle window resize
window.addEventListener('resize', () => {
    // Reinitialize grid system for new viewport
    if (window.demaOS) {
        window.demaOS.initializeGridSystem();
    }
    
    // Reposition windows if they're outside viewport
    document.querySelectorAll('.window').forEach(window => {
        if (window.style.display === 'none') return;
        
        const rect = window.getBoundingClientRect();
        if (rect.left > window.innerWidth - 100) {
            window.style.left = Math.max(0, window.innerWidth - window.offsetWidth) + 'px';
        }
        if (rect.top > window.innerHeight - 100) {
            window.style.top = Math.max(0, window.innerHeight - window.offsetHeight - 40) + 'px';
        }
    });
});

// CRT Monitor Effects Class Extension - DISABLED to prevent screen dimming
/*
DemaOS.prototype.setupCRTEffects = function() {
    const desktop = document.getElementById('desktop');
    
    // Random screen flicker effect
    setInterval(() => {
        if (Math.random() < 0.05) { // 5% chance every interval
            desktop.classList.add('flicker');
            setTimeout(() => {
                desktop.classList.remove('flicker');
            }, 200);
        }
    }, 3000);
    
    // Subtle monitor hum effect (visual simulation)
    this.setupMonitorHum();
    
    // Occasionally adjust screen brightness/contrast slightly
    this.setupBrightnessFluctuation();
    
    // Varying scan line intensity
    this.varyingScanLines();
};

DemaOS.prototype.setupMonitorHum = function() {
    const desktop = document.getElementById('desktop');
    let humPhase = 0;
    
    setInterval(() => {
        humPhase += 0.1;
        const brightness = 0.95 + Math.sin(humPhase) * 0.01;
        const contrast = 1.1 + Math.sin(humPhase * 1.3) * 0.02;
        
        desktop.style.filter = `contrast(${contrast}) brightness(${brightness}) saturate(1.1)`;
    }, 100);
};

DemaOS.prototype.setupBrightnessFluctuation = function() {
    const desktop = document.getElementById('desktop');
    
    // Random slight brightness/contrast changes to simulate old monitor
    setInterval(() => {
        if (Math.random() < 0.1) { // 10% chance
            const brightnessDelta = (Math.random() - 0.5) * 0.05;
            const contrastDelta = (Math.random() - 0.5) * 0.1;
            
            const newBrightness = Math.max(0.85, Math.min(1.05, 0.95 + brightnessDelta));
            const newContrast = Math.max(1.0, Math.min(1.3, 1.1 + contrastDelta));
            
            desktop.style.filter = `contrast(${newContrast}) brightness(${newBrightness}) saturate(1.1)`;
            
            // Return to normal after a short time
            setTimeout(() => {
                desktop.style.filter = 'contrast(1.1) brightness(0.95) saturate(1.1)';
            }, 500 + Math.random() * 1000);
        }
    }, 5000);
};

// Add scan line intensity variation
DemaOS.prototype.varyingScanLines = function() {
    const body = document.body;
    
    setInterval(() => {
        if (Math.random() < 0.2) {
            body.style.setProperty('--scanline-opacity', Math.random() * 0.1 + 0.02);
            setTimeout(() => {
                body.style.setProperty('--scanline-opacity', 0.03);
            }, 200);
        }
    }, 2000);
};
*/

// Load tour dates from API
DemaOS.prototype.loadTourDates = async function() {
    try {
        const response = await fetch('/api/tours');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const tours = data.tours || [];
        
        // Update the tour window content
        this.updateTourWindow(tours);
    } catch (error) {
        console.log('Could not load tour dates from API:', error);
        // Show empty tours list if API fails
        this.updateTourWindow([]);
    }
};

DemaOS.prototype.updateTourWindow = function(tours) {
    const tourWindow = document.getElementById('tourWindow');
    if (!tourWindow) return;
    
    const tourDatesContainer = tourWindow.querySelector('.tour-dates');
    if (!tourDatesContainer) return;
    
    if (tours.length === 0) {
        tourDatesContainer.innerHTML = '<p class="window-text">No hi ha concerts programats actualment.</p>';
        return;
    }
    
    tourDatesContainer.innerHTML = tours.map(tour => `
        <div class="tour-date field-row">
            <div class="date">${escapeHtml(tour.date || '')}</div>
            <div class="venue">
                <strong>${escapeHtml(tour.city || '')}</strong><br>
                ${escapeHtml(tour.venue || '')}<br>
                ${tour.ticketLink && tour.ticketLink !== '#' ? 
                    `<a href="${escapeHtml(tour.ticketLink)}" class="ticket-link" target="_blank" rel="noopener noreferrer">Entrades</a>` : 
                    `<a href="#" class="ticket-link">Més info</a>`
                }
            </div>
        </div>
    `).join('');
};

// Load countdown data from backend
DemaOS.prototype.loadCountdownData = async function() {
    try {
        const response = await fetch('/api/countdown');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        this.countdownData = await response.json();
        console.log('Countdown data loaded from API:', this.countdownData);
    } catch (error) {
        console.log('Could not load countdown data:', error);
        // No fallback data - countdown will be disabled
        this.countdownData = null;
    }
};

// Check if countdown should be opened automatically
DemaOS.prototype.openCountdownIfEnabled = function() {
    // Wait a bit for countdown data to load
    setTimeout(() => {
        if (this.countdownData && 
            this.countdownData.release && 
            this.countdownData.release.enabled) {
            
            // Check if the countdown hasn't finished yet
            const now = new Date().getTime();
            const targetDate = new Date(this.countdownData.release.releaseDate).getTime();
            
            if (targetDate > now) {
                // Countdown is active and hasn't finished - open it
                console.log('Opening countdown window automatically');
                this.openWindow('countdown');
            }
        }
    }, 1000); // Give time for data to load
};

// Start countdown timer
DemaOS.prototype.startCountdown = function() {
    if (!this.countdownData || !this.countdownData.release.enabled) {
        return;
    }
    
    // Update the window content with data from backend
    this.updateCountdownDisplay();
    
    // Clear any existing countdown
    if (this.countdownInterval) {
        clearInterval(this.countdownInterval);
    }
    
    // Start the countdown timer
    this.countdownInterval = setInterval(() => {
        this.updateCountdownDisplay();
    }, 1000);
};

// Update countdown display
DemaOS.prototype.updateCountdownDisplay = function() {
    if (!this.countdownData) return;
    
    const release = this.countdownData.release;
    const now = new Date().getTime();
    const targetDate = new Date(release.releaseDate).getTime();
    const timeDiff = targetDate - now;
    
    // Update title and description
    const titleElement = document.getElementById('releaseTitle');
    const descElement = document.getElementById('releaseDescription');
    const dateElement = document.getElementById('releaseDate');
    
    if (titleElement) titleElement.textContent = release.title;
    if (descElement) descElement.textContent = release.description;
    if (dateElement) {
        const releaseDate = new Date(release.releaseDate);
        const formattedDate = releaseDate.toLocaleDateString('ca-ES', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        dateElement.textContent = `Data d'estrena: ${formattedDate}`;
    }
    
    if (timeDiff <= 0) {
        // Countdown finished - show release is available
        this.showCountdownCompleted();
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
            this.countdownInterval = null;
        }
        return;
    }
    
    // Calculate time units
    const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
    
    // Update display with rolling animation
    this.updateCountdownDigits('countdown-days', days, 2);
    this.updateCountdownDigits('countdown-hours', hours, 2);
    this.updateCountdownDigits('countdown-minutes', minutes, 2);
    this.updateCountdownDigits('countdown-seconds', seconds, 2);
};

// Update countdown digits with rolling animation
DemaOS.prototype.updateCountdownDigits = function(elementId, value, digits) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const paddedValue = value.toString().padStart(digits, '0');
    const digitElements = element.querySelectorAll('.digit-roll');
    
    for (let i = 0; i < digitElements.length && i < paddedValue.length; i++) {
        const digitElement = digitElements[i];
        const newDigit = paddedValue[i];
        
        if (digitElement.textContent !== newDigit) {
            // Add rolling animation
            digitElement.classList.add('rolling');
            
            // Update the digit after a short delay (mid-animation)
            setTimeout(() => {
                digitElement.textContent = newDigit;
            }, 300);
            
            // Remove animation class
            setTimeout(() => {
                digitElement.classList.remove('rolling');
            }, 600);
        }
    }
};

// Show countdown completed state
DemaOS.prototype.showCountdownCompleted = function() {
    const release = this.countdownData.release;
    
    // Update title and description
    const titleElement = document.getElementById('releaseTitle');
    const descElement = document.getElementById('releaseDescription');
    const dateElement = document.getElementById('releaseDate');
    
    if (titleElement) titleElement.textContent = release.completedTitle;
    if (descElement) descElement.textContent = release.completedDescription;
    if (dateElement) dateElement.textContent = "JA DISPONIBLE!";
    
    // Show all zeros with a celebration effect
    this.updateCountdownDigits('countdown-days', 0, 2);
    this.updateCountdownDigits('countdown-hours', 0, 2);
    this.updateCountdownDigits('countdown-minutes', 0, 2);
    this.updateCountdownDigits('countdown-seconds', 0, 2);
    
    // Add celebration styling
    const countdownDisplay = document.querySelector('.countdown-display');
    if (countdownDisplay) {
        countdownDisplay.style.background = 'linear-gradient(45deg, #006600, #009900)';
        countdownDisplay.style.animation = 'pulse 2s infinite';
    }
    
    // Update countdown numbers to show celebration
    const countdownNumbers = document.querySelectorAll('.countdown-number');
    countdownNumbers.forEach(number => {
        number.style.background = 'linear-gradient(180deg, #00ff00 0%, #006600 100%)';
        number.style.borderColor = '#00ff00';
    });
};

// Gallery functionality
DemaOS.prototype.loadGalleryData = async function() {
    try {
        console.log('Loading gallery data...');
        const response = await fetch('/api/gallery');
        if (!response.ok) {
            throw new Error('No s\'ha pogut carregar la galeria');
        }
        
        const data = await response.json();
        console.log('Loaded gallery data:', data);
        this.galleryData = data.gallery;
        this.currentPhotoIndex = 0;
        
        console.log('Gallery data set:', this.galleryData);
        console.log('Photo count:', this.galleryData.photos ? this.galleryData.photos.length : 0);
        
        // Initialize gallery when window is opened
        this.setupGalleryListeners();
        
        // If gallery window is already open, initialize it now
        const galleryWindow = document.getElementById('galleryWindow');
        if (galleryWindow && galleryWindow.style.display !== 'none') {
            console.log('Gallery window is already open, initializing...');
            setTimeout(() => {
                this.initializeGallery();
            }, 100);
        }
        
    } catch (error) {
        console.error('Error carregant galeria:', error);
        this.galleryData = { photos: [] };
        const photoCounter = document.getElementById('photoCounter');
        if (photoCounter) {
            photoCounter.textContent = 'Error carregant fotos';
        }
    }
};

DemaOS.prototype.setupGalleryListeners = function() {
    // Prevent duplicate listeners
    if (this.galleryListenersSetup) return;
    
    const prevBtn = document.getElementById('prevPhoto');
    const nextBtn = document.getElementById('nextPhoto');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', () => this.navigatePhoto(-1));
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', () => this.navigatePhoto(1));
    }
    
    this.galleryListenersSetup = true;
};

DemaOS.prototype.initializeGallery = function() {
    console.log('Initializing gallery...', this.galleryData);
    
    if (!this.galleryData || !this.galleryData.photos || this.galleryData.photos.length === 0) {
        console.log('No gallery data available');
        const galleryContent = document.getElementById('galleryContent');
        if (galleryContent) {
            galleryContent.innerHTML = '<p style="text-align: center; padding: 20px;">No hi ha fotos disponibles</p>';
        }
        const photoCounter = document.getElementById('photoCounter');
        if (photoCounter) {
            photoCounter.textContent = '0 / 0';
        }
        const galleryTitle = document.getElementById('galleryTitle');
        if (galleryTitle) {
            galleryTitle.textContent = 'Fotos de Demà';
        }
        return;
    }
    
    // Sort photos by order
    const sortedPhotos = this.galleryData.photos.sort((a, b) => a.order - b.order);
    this.galleryData.photos = sortedPhotos;
    
    console.log('Gallery photos:', this.galleryData.photos);
    console.log('Current photo index:', this.currentPhotoIndex);
    
    // Ensure currentPhotoIndex is valid
    if (this.currentPhotoIndex >= this.galleryData.photos.length) {
        this.currentPhotoIndex = 0;
    }
    
    this.renderThumbnails();
    this.displayPhoto(this.currentPhotoIndex || 0);
    this.updateNavigation();
};

DemaOS.prototype.renderThumbnails = function() {
    const container = document.getElementById('thumbnailsContainer');
    if (!container) return;
    
    container.innerHTML = '';
    
    this.galleryData.photos.forEach((photo, index) => {
        const thumbnail = document.createElement('img');
        thumbnail.src = `assets/gallery/${photo.filename}`;
        thumbnail.alt = photo.title;
        thumbnail.className = `thumbnail ${index === this.currentPhotoIndex ? 'active' : ''}`;
        thumbnail.addEventListener('click', () => this.displayPhoto(index));
        container.appendChild(thumbnail);
    });
};

DemaOS.prototype.displayPhoto = function(index) {
    console.log('Displaying photo at index:', index, 'Gallery data:', this.galleryData);
    
    if (!this.galleryData || !this.galleryData.photos || index < 0 || index >= this.galleryData.photos.length) {
        console.log('Invalid photo index or no data');
        return;
    }
    
    this.currentPhotoIndex = index;
    const photo = this.galleryData.photos[index];
    
    console.log('Photo to display:', photo);
    
    // Update main photo
    const mainPhoto = document.getElementById('currentPhoto');
    const photoCounter = document.getElementById('photoCounter');
    const galleryTitle = document.getElementById('galleryTitle');
    
    if (mainPhoto) {
        const photoSrc = `assets/gallery/${photo.filename}`;
        console.log('Setting photo src to:', photoSrc);
        mainPhoto.src = photoSrc;
        mainPhoto.alt = photo.title;
    }
    
    if (photoCounter) {
        photoCounter.textContent = `${index + 1} / ${this.galleryData.photos.length}`;
    }
    
    // Update gallery title with photo title
    if (galleryTitle && photo.title) {
        galleryTitle.textContent = `Fotos de Demà - ${photo.title.trim()}`;
    } else if (galleryTitle) {
        galleryTitle.textContent = 'Fotos de Demà';
    }
    
    // Update thumbnails
    const thumbnails = document.querySelectorAll('.thumbnail');
    thumbnails.forEach((thumb, i) => {
        thumb.className = `thumbnail ${i === index ? 'active' : ''}`;
    });
    
    this.updateNavigation();
};

DemaOS.prototype.navigatePhoto = function(direction) {
    if (!this.galleryData || !this.galleryData.photos) return;
    
    const newIndex = this.currentPhotoIndex + direction;
    
    if (newIndex >= 0 && newIndex < this.galleryData.photos.length) {
        this.displayPhoto(newIndex);
    }
};

DemaOS.prototype.updateNavigation = function() {
    const prevBtn = document.getElementById('prevPhoto');
    const nextBtn = document.getElementById('nextPhoto');
    
    if (prevBtn) {
        prevBtn.disabled = this.currentPhotoIndex <= 0;
    }
    
    if (nextBtn) {
        nextBtn.disabled = this.currentPhotoIndex >= (this.galleryData.photos.length - 1);
    }
};
