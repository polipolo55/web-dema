# Web Demà - Technical Specification

## Overview

This document provides a detailed technical analysis of the current Demà Band website implementation and specifications for the modernized version.

## Current Implementation Analysis

### Frontend Architecture (script.js - 2142 lines)

#### Main Classes and Components

**DemaOS Class** - Central controller for the desktop environment
```javascript
class DemaOS {
    constructor() {
        this.windows = new Map();           // Active windows
        this.activeWindow = null;           // Currently focused window
        this.zIndex = 100;                  // Window stacking order
        this.isDragging = false;            // Window drag state
        this.isIconDragging = false;        // Icon drag state
        this.cascadeOffset = 0;             // Window cascade positioning
        this.countdownInterval = null;      // Countdown timer reference
        this.galleryDataReady = false;      // Gallery data load state
    }
}
```

#### Key Features Implemented

1. **Boot Screen Animation** (showBootScreen)
   - 3-second boot sequence
   - Fade transition to desktop
   - Simulates Windows 95 startup

2. **Window Management**
   - `createWindow(id, title, content)` - Create new window
   - `closeWindow(windowId)` - Close and cleanup
   - `focusWindow(windowId)` - Bring to front
   - `cascadeWindows()` - Auto-position new windows
   - Dragging support with mouse events
   - Minimize/maximize buttons

3. **Desktop Icons**
   - Grid-based positioning system
   - Drag-and-drop repositioning
   - Double-click to open windows
   - Persist positions in localStorage

4. **Taskbar**
   - Real-time clock display
   - Window list with click-to-focus
   - System stats (simulated visit counter)

5. **Dynamic Content Loading**
   - Tour dates from API (`/api/tour-dates`)
   - Gallery photos from API (`/api/gallery/list`)
   - Countdown data from API (`/api/countdown`)

6. **Grid Positioning System**
   ```javascript
   initializeGridSystem() {
       const style = getComputedStyle(document.documentElement);
       this.gridSpacing = parseInt(style.getPropertyValue('--icon-spacing')) || 100;
       this.iconWidth = parseInt(style.getPropertyValue('--icon-width')) || 90;
       this.iconSize = parseInt(style.getPropertyValue('--icon-size')) || 56;
   }
   ```

7. **Wallpaper System**
   - Multiple wallpaper options
   - Cycle through with button
   - Includes classic Windows 95 clouds

#### Constants and Configuration

```javascript
const TIMING = {
    BOOT_SCREEN_DURATION: 3000,
    BOOT_FADE_DURATION: 1000,
    CLOCK_UPDATE_INTERVAL: 1000,
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
```

### Backend Architecture (server.js - 732 lines)

#### Server Configuration
```javascript
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3001;
```

#### Middleware Stack
1. **Body Parser** - `express.json({ limit: '1mb' })`
2. **Static Files** - `express.static(STATIC_ROOT)`
3. **Security Headers** - X-Content-Type-Options, X-Frame-Options, X-XSS-Protection
4. **Rate Limiting** - 100 requests per minute per IP
5. **Authentication** - Bearer token for admin routes

#### API Endpoints

**Tour Dates**
- `GET /api/tour-dates` - List all tour dates
- `POST /api/tour-dates` - Create tour date (auth required)
- `PUT /api/tour-dates/:id` - Update tour date (auth required)
- `DELETE /api/tour-dates/:id` - Delete tour date (auth required)

**Gallery**
- `GET /api/gallery/list` - List all photos
- `POST /api/gallery/upload` - Upload photo (auth required, multipart)
- `DELETE /api/gallery/:filename` - Delete photo (auth required)

**Countdown**
- `GET /api/countdown` - Get countdown configuration
- `POST /api/countdown` - Update countdown (auth required)

**System**
- `GET /api/stats` - Get system statistics
- `GET /` - Serve main page
- `GET /admin` - Serve admin panel

#### Authentication System
```javascript
const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${ADMIN_PASSWORD}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};
```

#### Input Validation
```javascript
const validateTourData = (data) => {
    const required = ['date', 'city', 'venue'];
    // Check for required fields
    // Validate date format
    // Check field length limits
    // Return error message or null if valid
};
```

#### File Upload Configuration
```javascript
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, GALLERY_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${file.originalname}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
    fileFilter: (req, file, cb) => {
        // Only allow images
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Only image files are allowed'));
        }
        cb(null, true);
    }
});
```

### Database Layer (database.js)

**BandDatabase Class**
```javascript
class BandDatabase {
    constructor(dbPath = './data/band.db') {
        this.dbPath = dbPath;
        this.db = null;
    }

    async initialize() {
        // Create database connection
        // Initialize tables
        // Create indexes
    }

    // Tour operations
    async getAllTours() { }
    async addTour(tourData) { }
    async updateTour(id, tourData) { }
    async deleteTour(id) { }

    // Gallery operations
    async getAllPhotos() { }
    async addPhoto(photoData) { }
    async deletePhoto(filename) { }

    // Countdown operations
    async getCountdown() { }
    async updateCountdown(data) { }
}
```

**Database Schema**
```sql
-- Tours table
CREATE TABLE IF NOT EXISTS tours (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    city TEXT NOT NULL,
    venue TEXT NOT NULL,
    info TEXT,
    tickets_url TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Gallery table
CREATE TABLE IF NOT EXISTS gallery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL UNIQUE,
    caption TEXT,
    uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Countdown table
CREATE TABLE IF NOT EXISTS countdown (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    enabled INTEGER DEFAULT 0,
    target_date TEXT,
    title TEXT,
    description TEXT
);
```

### Styling (styles.css - 1586 lines)

#### CSS Architecture
```
styles.css
├── CSS Variables (theming)
├── Global Styles
├── Boot Screen Styles
├── Desktop Styles
├── Window Styles
├── Icon Styles
├── Taskbar Styles
├── Content Styles
├── Animations
└── Responsive Utilities
```

#### CSS Custom Properties
```css
:root {
    --icon-spacing: 100px;
    --icon-width: 90px;
    --icon-size: 56px;
    --window-title-bg: #000080;
    --window-border: #c0c0c0;
}
```

#### Key Style Components
- **98.css** - Provides Windows 95 UI components (imported from CDN)
- **Desktop** - Full viewport with wallpaper support
- **Windows** - Draggable, resizable containers with title bars
- **Icons** - Grid-positioned with image and label
- **Taskbar** - Fixed bottom bar with buttons and clock
- **Boot Screen** - Full-screen overlay with animation

### Mobile Implementation (mobile.css + mobile.js)

**Differences from Desktop**
- Single-window interface (no multitasking)
- Touch-optimized controls
- Simplified navigation
- Swipe gestures
- Responsive breakpoints

## Data Flow

### Page Load Sequence
1. User visits site → server.js serves index.html
2. Browser loads script.js
3. DemaOS constructor initializes
4. Boot screen displays (3 seconds)
5. Desktop fades in
6. Icons positioned on grid
7. Clock starts ticking
8. API calls fetch dynamic content:
   - Tour dates
   - Gallery photos
   - Countdown data

### Window Opening Flow
1. User double-clicks desktop icon
2. `openWindow(windowId)` called
3. `createWindow()` generates HTML
4. Window added to DOM
5. Window positioned (cascaded)
6. Event listeners attached
7. Window focused (brought to front)
8. Content loaded (if dynamic)

### Admin Content Update Flow
1. Admin visits /admin?password=xxx
2. Admin interface loads
3. Admin creates/edits content
4. POST/PUT request with Bearer token
5. Server validates authentication
6. Server validates input data
7. Database updated
8. Response sent to client
9. Client refreshes display

## Security Considerations

### Current Security Measures
1. **Authentication** - Bearer token for admin routes
2. **Rate Limiting** - 100 requests/minute per IP
3. **Security Headers** - XSS, clickjacking protection
4. **Input Validation** - Basic validation on all inputs
5. **File Upload** - Type and size restrictions
6. **Environment Variables** - Secrets in .env file

### Security Gaps (To Address in Modernization)
1. No CSRF protection
2. No session management (stateless tokens)
3. Basic rate limiting (in-memory, resets on restart)
4. No password hashing (single admin password)
5. No audit logging
6. No SQL injection protection (using raw SQL)
7. No sanitization of user-generated content

## Performance Characteristics

### Current Performance
- **Page Load**: ~500ms (with cached assets)
- **Time to Interactive**: ~1s
- **Bundle Size**: ~120KB (uncompressed)
- **API Response Time**: <50ms (SQLite is fast)

### Performance Issues
1. No code splitting (single script.js file)
2. No lazy loading of images
3. No caching strategy for API calls
4. No CDN usage
5. No compression (gzip/brotli)

## Browser Compatibility

**Supported Browsers** (Current)
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

**Known Issues**
- Some CSS Grid features may not work on older browsers
- Drag and drop may be glitchy on mobile Safari
- Touch events need polyfill for older Android

## Deployment Architecture

### Current Deployment
```
[Oracle Linux Server]
    ├── Node.js process (PM2)
    ├── SQLite database file
    ├── Static assets (HTML, CSS, JS)
    └── Uploaded photos
```

### Environment Variables
```
ADMIN_PASSWORD=xxx       # Admin authentication
PORT=3001               # Server port
NODE_ENV=production     # Environment mode
```

### Process Management
- **PM2** - Process manager for Node.js
- **Systemd** - System service for auto-start
- **Logs** - PM2 logs stored in ~/.pm2/logs/

## Dependencies

### Production Dependencies
```json
{
  "better-sqlite3": "^12.2.0",  // SQLite database
  "dotenv": "^17.2.1",           // Environment config
  "express": "^4.18.2",          // Web framework
  "multer": "^2.0.2"             // File upload
}
```

### Frontend Dependencies
- **98.css** - CDN (unpkg.com)
- No build dependencies (vanilla JS)

## Testing Strategy (Current)

**Current Testing**: Manual only
- Click through all features
- Test on different browsers
- Test admin panel operations
- Verify data persistence

**No Automated Tests** - Major gap to address

## Backup and Recovery

**Current Backup Strategy**
- `npm run backup` - Creates timestamped database backup
- Manual backup of uploaded photos
- Git repository for code

**Recovery Process**
- Restore database from backup
- Restore photos from backup
- Restart Node.js process

## Monitoring and Observability

**Current Monitoring**: Basic
- PM2 monitoring (CPU, memory)
- Server logs (console.log)
- No error tracking
- No performance monitoring
- No uptime monitoring

## API Documentation

### Tour Dates API

**GET /api/tour-dates**
```javascript
// Response
[
  {
    "id": 1,
    "date": "2025-12-31",
    "city": "Barcelona",
    "venue": "Sala Apolo",
    "info": "New Year's Eve concert",
    "tickets_url": "https://...",
    "created_at": "2025-01-01T00:00:00.000Z"
  }
]
```

**POST /api/tour-dates**
```javascript
// Request (requires auth header)
{
  "date": "2025-12-31",
  "city": "Barcelona",
  "venue": "Sala Apolo",
  "info": "New Year's Eve concert",
  "tickets_url": "https://..."
}

// Response
{
  "success": true,
  "tour": { /* created tour object */ }
}
```

### Gallery API

**GET /api/gallery/list**
```javascript
// Response
[
  {
    "id": 1,
    "filename": "1234567890-photo.jpg",
    "caption": "Great concert!",
    "uploaded_at": "2025-01-01T00:00:00.000Z",
    "url": "/assets/gallery/1234567890-photo.jpg"
  }
]
```

**POST /api/gallery/upload**
```javascript
// Request (multipart/form-data, requires auth header)
// FormData with 'photo' field

// Response
{
  "success": true,
  "photo": { /* photo object */ }
}
```

### Countdown API

**GET /api/countdown**
```javascript
// Response
{
  "enabled": true,
  "target_date": "2025-12-31T23:59:59",
  "title": "New Album Release",
  "description": "Our latest album drops soon!"
}
```

## Migration Considerations

### Data Migration
- Export tours from SQLite to JSON
- Export gallery metadata
- Export countdown config
- Preserve photo files
- Test migration on staging

### Zero-Downtime Deployment
- Deploy new version to new subdomain
- Migrate data
- Test thoroughly
- Switch DNS/proxy when ready
- Keep old version running as fallback

### Rollback Strategy
- Keep old database backup
- Keep old code version
- Document rollback procedure
- Test rollback process

## Known Issues and Technical Debt

1. **Monolithic Architecture** - Hard to maintain, test, extend
2. **No Type Safety** - Runtime errors only
3. **No Tests** - High risk of regressions
4. **Mixed Concerns** - Business logic in routes
5. **Security Gaps** - See security section
6. **Performance** - No optimization strategies
7. **No Error Handling** - Many unhandled edge cases
8. **Documentation** - Minimal inline docs
9. **Mobile Experience** - Separate implementation, code duplication
10. **No CI/CD** - Manual deployment process

## Conclusion

The current implementation is functional and delivers the desired retro aesthetic, but has significant technical debt that limits maintainability, security, and scalability. The modernization plan addresses these issues systematically while preserving what works well.

**Strengths to Preserve:**
- ✅ Charming retro UI (98.css)
- ✅ Fast SQLite database
- ✅ Simple deployment
- ✅ Clear feature set

**Weaknesses to Address:**
- ❌ Monolithic architecture
- ❌ No type safety
- ❌ No automated tests
- ❌ Security gaps
- ❌ Performance optimization opportunities

---

*Document Version: 1.0*  
*Last Updated: 2025-11-01*
