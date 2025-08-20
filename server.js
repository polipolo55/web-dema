// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3001;

// Simple authentication (change this password!)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

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
const requireAuth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${ADMIN_PASSWORD}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
};

// Input validation helpers
const validateTourData = (data) => {
    const required = ['name', 'date', 'venue'];
    for (const field of required) {
        if (!data[field] || typeof data[field] !== 'string' || data[field].trim() === '') {
            return `Field '${field}' is required and must be a non-empty string`;
        }
    }
    
    // Basic date validation
    const date = new Date(data.date);
    if (isNaN(date.getTime())) {
        return 'Invalid date format';
    }
    
    return null;
};

const sanitizeString = (str) => {
    if (typeof str !== 'string') return '';
    return str.replace(/<[^>]*>?/gm, '').substring(0, 200); // Remove HTML and limit length
};

app.use(rateLimit);

// Serve the admin interface (now requires authentication via URL parameter)
app.get('/admin', (req, res) => {
    // Simple password check via URL parameter for now
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

// API Routes for tour dates
app.get('/api/tours', async (req, res) => {
    try {
        const data = await fs.readFile('data/tours.json', 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        console.error('Error reading tours data:', error);
        res.status(500).json({ error: 'Failed to load tours data' });
    }
});

// API Routes for countdown
app.get('/api/countdown', async (req, res) => {
    try {
        const data = await fs.readFile('data/countdown.json', 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        console.error('Error reading countdown data:', error);
        res.status(500).json({ error: 'Failed to load countdown data' });
    }
});

app.post('/api/countdown', requireAuth, async (req, res) => {
    try {
        const { title, description, releaseDate, enabled, completedTitle, completedDescription } = req.body;
        
        // Sanitize input data
        const sanitizedData = {
            title: sanitizeString(title),
            description: sanitizeString(description),
            releaseDate: releaseDate,
            enabled: Boolean(enabled),
            completedTitle: sanitizeString(completedTitle),
            completedDescription: sanitizeString(completedDescription)
        };
        
        // Read current data
        let data;
        try {
            const fileData = await fs.readFile('data/countdown.json', 'utf8');
            data = JSON.parse(fileData);
        } catch (error) {
            // Create default structure if file doesn't exist
            data = { release: {} };
        }
        
        // Update the data
        if (sanitizedData.title) data.release.title = sanitizedData.title;
        if (sanitizedData.description) data.release.description = sanitizedData.description;
        if (sanitizedData.releaseDate) data.release.releaseDate = sanitizedData.releaseDate;
        if (sanitizedData.enabled !== undefined) data.release.enabled = sanitizedData.enabled;
        if (sanitizedData.completedTitle) data.release.completedTitle = sanitizedData.completedTitle;
        if (sanitizedData.completedDescription) data.release.completedDescription = sanitizedData.completedDescription;
        
        // Write back to file
        await fs.writeFile('data/countdown.json', JSON.stringify(data, null, 2));
        
        res.json({ success: true, data });
    } catch (error) {
        console.error('Error updating countdown data:', error);
        res.status(500).json({ error: 'Failed to update countdown data' });
    }
});

app.post('/api/tours', requireAuth, async (req, res) => {
    try {
        // Validate input data
        const validationError = validateTourData(req.body);
        if (validationError) {
            return res.status(400).json({ error: validationError });
        }
        
        const newTour = {
            id: Date.now(),
            name: sanitizeString(req.body.name),
            date: req.body.date,
            venue: sanitizeString(req.body.venue),
            location: sanitizeString(req.body.location || ''),
            ticketUrl: sanitizeString(req.body.ticketUrl || '')
        };
        
        let tours;
        try {
            const data = await fs.readFile('data/tours.json', 'utf8');
            tours = JSON.parse(data);
        } catch (error) {
            tours = { tours: [] };
        }
        
        tours.tours.push(newTour);
        
        // Ensure data directory exists
        await fs.mkdir('data', { recursive: true });
        await fs.writeFile('data/tours.json', JSON.stringify(tours, null, 2));
        
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
        
        const data = await fs.readFile('data/tours.json', 'utf8');
        const tours = JSON.parse(data);
        
        const tourIndex = tours.tours.findIndex(tour => tour.id === tourId);
        if (tourIndex === -1) {
            return res.status(404).json({ error: 'Tour not found' });
        }
        
        // Sanitize update data
        const updateData = {
            name: sanitizeString(req.body.name),
            date: req.body.date,
            venue: sanitizeString(req.body.venue),
            location: sanitizeString(req.body.location || ''),
            ticketUrl: sanitizeString(req.body.ticketUrl || '')
        };
        
        tours.tours[tourIndex] = { ...tours.tours[tourIndex], ...updateData };
        
        await fs.writeFile('data/tours.json', JSON.stringify(tours, null, 2));
        
        res.json(tours.tours[tourIndex]);
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
        
        const data = await fs.readFile('data/tours.json', 'utf8');
        const tours = JSON.parse(data);
        
        const originalLength = tours.tours.length;
        tours.tours = tours.tours.filter(tour => tour.id !== tourId);
        
        if (tours.tours.length === originalLength) {
            return res.status(404).json({ error: 'Tour not found' });
        }
        
        await fs.writeFile('data/tours.json', JSON.stringify(tours, null, 2));
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting tour:', error);
        res.status(500).json({ error: 'Error deleting tour' });
    }
});

// Gallery management endpoints
app.get('/api/gallery', async (req, res) => {
    try {
        const data = await fs.readFile('data/gallery.json', 'utf8');
        res.json(JSON.parse(data));
    } catch (error) {
        console.error('Error reading gallery:', error);
        res.status(500).json({ error: 'Error reading gallery data' });
    }
});

// Note: For photo upload functionality, you'd need to install multer
// npm install multer
// For now, we'll provide basic endpoints for managing existing photos

app.post('/admin/move-photo', requireAuth, async (req, res) => {
    try {
        const { photoId, direction } = req.body;
        
        const data = await fs.readFile('data/gallery.json', 'utf8');
        const gallery = JSON.parse(data);
        
        const photos = gallery.gallery.photos;
        const photoIndex = photos.findIndex(p => p.id === photoId);
        
        if (photoIndex === -1) {
            return res.status(404).json({ error: 'Photo not found' });
        }
        
        const currentOrder = photos[photoIndex].order;
        const newOrder = currentOrder + direction;
        
        // Find photo with the target order
        const targetPhoto = photos.find(p => p.order === newOrder);
        
        if (targetPhoto) {
            // Swap orders
            targetPhoto.order = currentOrder;
            photos[photoIndex].order = newOrder;
        }
        
        // Sort by order
        gallery.gallery.photos = photos.sort((a, b) => a.order - b.order);
        
        await fs.writeFile('data/gallery.json', JSON.stringify(gallery, null, 2));
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error moving photo:', error);
        res.status(500).json({ error: 'Error moving photo' });
    }
});

app.delete('/admin/delete-photo', requireAuth, async (req, res) => {
    try {
        const { photoId } = req.body;
        
        const data = await fs.readFile('data/gallery.json', 'utf8');
        const gallery = JSON.parse(data);
        
        const originalLength = gallery.gallery.photos.length;
        gallery.gallery.photos = gallery.gallery.photos.filter(p => p.id !== photoId);
        
        if (gallery.gallery.photos.length === originalLength) {
            return res.status(404).json({ error: 'Photo not found' });
        }
        
        await fs.writeFile('data/gallery.json', JSON.stringify(gallery, null, 2));
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting photo:', error);
        res.status(500).json({ error: 'Error deleting photo' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Admin interface at http://localhost:${PORT}/admin?password=${ADMIN_PASSWORD}`);
    console.log(`API endpoints:`);
    console.log(`  GET  /api/tours - Get all tours`);
    console.log(`  POST /api/tours - Add new tour (requires auth)`);
    console.log(`  GET  /api/countdown - Get countdown data`);
    console.log(`  POST /api/countdown - Update countdown data (requires auth)`);
    console.log(`  GET  /api/gallery - Get gallery data`);
    console.log(`  POST /admin/move-photo - Move photo order (requires auth)`);
    console.log(`  DELETE /admin/delete-photo - Delete photo (requires auth)`);
    console.log(`\n⚠️  IMPORTANT: Change the default admin password before deploying!`);
    console.log(`Set environment variable: ADMIN_PASSWORD=yournewpassword`);
});
