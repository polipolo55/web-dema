// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const multer = require('multer');
const BandDatabase = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database
let db;
(async () => {
    db = new BandDatabase();
    await db.initialize();
})();

// Simple authentication
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
    console.error('⚠️  WARNING: ADMIN_PASSWORD environment variable not set!');
    console.error('   Please set ADMIN_PASSWORD in your .env file before running in production.');
}

// Middleware
app.use(express.json({ limit: '1mb' })); // Limit payload size
app.use(express.static('.'));

// Security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
});

// Simple rate limiting
const requestCounts = new Map();
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS = 100;

const rateLimit = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    if (!requestCounts.has(ip)) {
        requestCounts.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    } else {
        const clientData = requestCounts.get(ip);
        if (now > clientData.resetTime) {
            clientData.count = 1;
            clientData.resetTime = now + RATE_LIMIT_WINDOW;
        } else {
            clientData.count++;
        }
        
        if (clientData.count > MAX_REQUESTS) {
            return res.status(429).json({ error: 'Too many requests' });
        }
    }
    next();
};

// Simple auth middleware for admin routes
/**
 * Authentication middleware for admin endpoints
 */
const requireAuth = (req, res, next) => {
    if (!ADMIN_PASSWORD) {
        return res.status(500).json({ 
            error: 'Server configuration error: Admin password not configured' 
        });
    }
    
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${ADMIN_PASSWORD}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

/**
 * Input validation helpers
 */
const validateTourData = (data) => {
    const required = ['date', 'city', 'venue'];
    
    // Check for required fields
    for (const field of required) {
        if (!data[field] || typeof data[field] !== 'string' || data[field].trim() === '') {
            return `Field '${field}' is required and must be a non-empty string`;
        }
    }
    
    // Check field length limits
    const maxLengths = { city: 100, venue: 200, date: 50 };
    for (const [field, maxLength] of Object.entries(maxLengths)) {
        if (data[field] && data[field].length > maxLength) {
            return `Field '${field}' must be less than ${maxLength} characters`;
        }
    }
    
    return null;
};

/**
 * Sanitize string input by removing HTML and limiting length
 * @param {string} str Input string to sanitize
 * @param {number} maxLength Maximum allowed length (default: 200)
 * @returns {string} Sanitized string
 */
const sanitizeString = (str, maxLength = 200) => {
    if (typeof str !== 'string') return '';
    return str.replace(/<[^>]*>?/gm, '').substring(0, maxLength);
};

app.use(rateLimit);

// Configure multer for photo uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'assets/gallery/')
    },
    filename: function (req, file, cb) {
        // Generate unique filename while preserving extension
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: function (req, file, cb) {
        // Check if file is an image
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// Serve the admin interface
app.get('/admin', (req, res) => {
    const password = req.query.password;
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).send(`
            <!DOCTYPE html>
            <html>
            <head><title>Access Denied</title></head>
            <body style="font-family: Arial; text-align: center; padding: 50px;">
                <h2>Access Denied</h2>
                <p>Contact the band for admin access</p>
                <a href="/">Back to website</a>
            </body>
            </html>
        `);
    }
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// === DATABASE-POWERED API ROUTES ===

// Tours API (now using database)
app.get('/api/tours', async (req, res) => {
    try {
        const tours = db.getTours();
        // Transform to match original JSON structure
        res.json({ tours });
    } catch (error) {
        console.error('Error reading tours data:', error);
        res.status(500).json({ error: 'Failed to load tours data' });
    }
});

app.post('/api/tours', requireAuth, async (req, res) => {
    try {
        // Validate input data
        const validationError = validateTourData(req.body);
        if (validationError) {
            return res.status(400).json({ error: validationError });
        }
        
        const tourData = {
            date: req.body.date,
            city: sanitizeString(req.body.city),
            venue: sanitizeString(req.body.venue),
            ticketLink: sanitizeString(req.body.ticketLink || '')
        };
        
        const newTour = db.addTour(tourData);
        res.json(newTour);
    } catch (error) {
        console.error('Error saving tour:', error);
        res.status(500).json({ error: 'Error saving tour' });
    }
});

app.put('/api/tours/:id', requireAuth, async (req, res) => {
    try {
        const tourId = parseInt(req.params.id);
        if (isNaN(tourId)) {
            return res.status(400).json({ error: 'Invalid tour ID' });
        }
        
        // Validate input data
        const validationError = validateTourData(req.body);
        if (validationError) {
            return res.status(400).json({ error: validationError });
        }
        
        const tourData = {
            date: req.body.date,
            city: sanitizeString(req.body.city),
            venue: sanitizeString(req.body.venue),
            ticketLink: sanitizeString(req.body.ticketLink || '')
        };
        
        const success = db.updateTour(tourId, tourData);
        if (success) {
            res.json({ success: true, id: tourId, ...tourData });
        } else {
            res.status(404).json({ error: 'Tour not found' });
        }
    } catch (error) {
        console.error('Error updating tour:', error);
        res.status(500).json({ error: 'Error updating tour' });
    }
});

app.delete('/api/tours/:id', requireAuth, async (req, res) => {
    try {
        const tourId = parseInt(req.params.id);
        if (isNaN(tourId)) {
            return res.status(400).json({ error: 'Invalid tour ID' });
        }
        
        const success = db.deleteTour(tourId);
        if (success) {
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Tour not found' });
        }
    } catch (error) {
        console.error('Error deleting tour:', error);
        res.status(500).json({ error: 'Error deleting tour' });
    }
});

// Countdown API (now using database)
app.get('/api/countdown', async (req, res) => {
    try {
        const countdown = db.getCountdown();
        // Transform to match original JSON structure
        res.json({ release: countdown });
    } catch (error) {
        console.error('Error reading countdown data:', error);
        res.status(500).json({ error: 'Failed to load countdown data' });
    }
});

app.post('/api/countdown', requireAuth, async (req, res) => {
    try {
        const { title, description, releaseDate, enabled, completedTitle, completedDescription } = req.body;
        
        // Sanitize input data
        const countdownData = {
            title: sanitizeString(title),
            description: sanitizeString(description),
            releaseDate: releaseDate,
            enabled: Boolean(enabled),
            completedTitle: sanitizeString(completedTitle),
            completedDescription: sanitizeString(completedDescription)
        };
        
        const updatedCountdown = db.updateCountdown(countdownData);
        res.json({ success: true, data: { release: updatedCountdown } });
    } catch (error) {
        console.error('Error updating countdown data:', error);
        res.status(500).json({ error: 'Failed to update countdown data' });
    }
});

// Backup endpoint for admins
app.post('/api/backup', requireAuth, async (req, res) => {
    try {
        const backupPath = await db.createBackup();
        res.json({ success: true, backupPath });
    } catch (error) {
        console.error('Error creating backup:', error);
        res.status(500).json({ error: 'Failed to create backup' });
    }
});

// === STATIC DATA API ROUTES (still JSON-based) ===

// Band info (static JSON file)
app.get('/api/band-info', async (req, res) => {
    try {
        const data = await fs.readFile('data/band-info.json', 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        console.error('Error reading band info:', error);
        res.status(500).json({ error: 'Failed to load band information' });
    }
});

// Gallery API (now using database)
app.get('/api/gallery', async (req, res) => {
    try {
        const gallery = db.getGallery();
        res.json(gallery);
    } catch (error) {
        console.error('Error reading gallery data:', error);
        res.status(500).json({ error: 'Failed to load gallery data' });
    }
});

// Gallery management routes (matching admin panel expectations)
app.delete('/admin/delete-photo', requireAuth, async (req, res) => {
    try {
        const { photoId } = req.body;
        
        // First, get the photo details to find the filename
        const gallery = db.getGallery();
        const photo = gallery.gallery.photos.find(p => p.id === photoId);
        
        if (!photo) {
            return res.status(404).json({ error: 'Photo not found' });
        }
        
        // Delete from database
        const success = db.deletePhoto(photoId);

        if (success) {
            // Try to delete the actual file from filesystem
            try {
                const fs = require('fs').promises;
                const filePath = path.join('assets/gallery', photo.filename);
                await fs.unlink(filePath);
                console.log(`Deleted file: ${filePath}`);
            } catch (fileError) {
                console.warn(`Could not delete file ${photo.filename}:`, fileError.message);
                // Don't fail the request if file deletion fails
            }
            
            res.json({ success: true, message: 'Photo and file deleted successfully' });
        } else {
            res.status(404).json({ error: 'Photo not found in database' });
        }
    } catch (error) {
        console.error('Error deleting photo:', error);
        res.status(500).json({ error: 'Error deleting photo' });
    }
});

app.post('/admin/reorder-photos', requireAuth, async (req, res) => {
    try {
        const { photoId, targetIndex } = req.body;
        
        // Get current photos
        const gallery = db.getGallery();
        const photos = gallery.gallery.photos || [];
        
        // Find the photo to move
        const photoIndex = photos.findIndex(p => p.id === photoId);
        if (photoIndex === -1) {
            return res.status(404).json({ error: 'Photo not found' });
        }
        
        // Reorder photos array
        const [photo] = photos.splice(photoIndex, 1);
        photos.splice(targetIndex, 0, photo);
        
        // Update order numbers in database
        for (let i = 0; i < photos.length; i++) {
            const currentPhoto = photos[i];
            db.updatePhoto(currentPhoto.id, {
                filename: currentPhoto.filename,
                title: currentPhoto.title,
                description: currentPhoto.description,
                order: i + 1
            });
        }
        
        res.json({ success: true, message: 'Photos reordered successfully' });
    } catch (error) {
        console.error('Error reordering photos:', error);
        res.status(500).json({ error: 'Error reordering photos' });
    }
});

// Photo upload endpoint (matching admin panel expectation)
app.post('/admin/add-photo', requireAuth, upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No photo uploaded' });
        }

        // (no logging in production) read-only ops avoided here

        // Use a stronger unique id to avoid accidental collisions
        const { randomUUID } = require('crypto');
        const generateId = () => {
            try {
                if (typeof randomUUID === 'function') return randomUUID();
            } catch (e) {}
            return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
        };

        const newPhoto = {
            id: generateId(),
            filename: req.file.filename,
            title: req.body.title || req.file.originalname,
            description: req.body.description || '',
            order: parseInt(req.body.order) || 0
        };

        // Try inserting; if we hit a primary-key constraint, regenerate id and retry once
        try {
            const result = db.addPhoto(newPhoto);
            if (!result || result.changes === 0) throw new Error('No rows inserted');
        } catch (insertErr) {
            // retry once with a fresh id (avoid logging in deployed server)
            newPhoto.id = generateId();
            db.addPhoto(newPhoto);
        }

        // (no logging in production)

        res.json({ 
            success: true, 
            photo: newPhoto,
            message: 'Photo uploaded successfully' 
        });
    } catch (error) {
        console.error('Error uploading photo:', error);
        res.status(500).json({ error: 'Error uploading photo' });
    }
});

// Legacy photo upload endpoint (keep for compatibility)
app.post('/upload', requireAuth, upload.single('photo'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No photo uploaded' });
        }

        // Use same ID generation logic as admin endpoint
        const { randomUUID } = require('crypto');
        const generateId = () => {
            try {
                if (typeof randomUUID === 'function') return randomUUID();
            } catch (e) {}
            return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
        };

        const newPhoto = {
            id: generateId(),
            filename: req.file.filename,
            title: req.body.title || req.file.originalname,
            description: req.body.description || '',
            order: parseInt(req.body.order) || 0
        };

        try {
            const result = db.addPhoto(newPhoto);
            if (!result || result.changes === 0) throw new Error('No rows inserted');
        } catch (insertErr) {
            // retry once with a fresh id
            newPhoto.id = generateId();
            db.addPhoto(newPhoto);
        }

        res.json({ 
            success: true, 
            photo: newPhoto,
            message: 'Photo uploaded successfully' 
        });
    } catch (error) {
        console.error('Error uploading photo:', error);
        res.status(500).json({ error: 'Error uploading photo' });
    }
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    if (db) {
        db.close();
    }
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('Shutting down server...');
    if (db) {
        db.close();
    }
    process.exit(0);
});

// Start server
app.listen(PORT, () => {
    console.log(`🎸 Demà website running on http://localhost:${PORT}`);
    console.log(`🔧 Admin panel: http://localhost:${PORT}/admin?password=${ADMIN_PASSWORD}`);
    console.log(`💾 Database: ${db ? 'Connected' : 'Initializing...'}`);
});
