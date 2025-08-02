const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.static('.'));

// Serve the admin interface
app.get('/admin', (req, res) => {
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

app.post('/api/countdown', async (req, res) => {
    try {
        const { title, description, releaseDate, enabled, completedTitle, completedDescription } = req.body;
        
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
        if (title !== undefined) data.release.title = title;
        if (description !== undefined) data.release.description = description;
        if (releaseDate !== undefined) data.release.releaseDate = releaseDate;
        if (enabled !== undefined) data.release.enabled = enabled;
        if (completedTitle !== undefined) data.release.completedTitle = completedTitle;
        if (completedDescription !== undefined) data.release.completedDescription = completedDescription;
        
        // Write back to file
        await fs.writeFile('data/countdown.json', JSON.stringify(data, null, 2));
        
        res.json({ success: true, data });
    } catch (error) {
        console.error('Error updating countdown data:', error);
        res.status(500).json({ error: 'Failed to update countdown data' });
    }
});

app.post('/api/tours', async (req, res) => {
    try {
        const newTour = {
            id: Date.now(),
            ...req.body
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
        res.status(500).json({ error: 'Error saving tour' });
    }
});

app.put('/api/tours/:id', async (req, res) => {
    try {
        const tourId = parseInt(req.params.id);
        const data = await fs.readFile('data/tours.json', 'utf8');
        const tours = JSON.parse(data);
        
        const tourIndex = tours.tours.findIndex(tour => tour.id === tourId);
        if (tourIndex === -1) {
            return res.status(404).json({ error: 'Tour not found' });
        }
        
        tours.tours[tourIndex] = { ...tours.tours[tourIndex], ...req.body };
        
        await fs.writeFile('data/tours.json', JSON.stringify(tours, null, 2));
        
        res.json(tours.tours[tourIndex]);
    } catch (error) {
        res.status(500).json({ error: 'Error updating tour' });
    }
});

app.delete('/api/tours/:id', async (req, res) => {
    try {
        const tourId = parseInt(req.params.id);
        const data = await fs.readFile('data/tours.json', 'utf8');
        const tours = JSON.parse(data);
        
        tours.tours = tours.tours.filter(tour => tour.id !== tourId);
        
        await fs.writeFile('data/tours.json', JSON.stringify(tours, null, 2));
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Error deleting tour' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Admin interface at http://localhost:${PORT}/admin`);
    console.log(`API endpoints:`);
    console.log(`  GET  /api/tours - Get all tours`);
    console.log(`  POST /api/tours - Add new tour`);
    console.log(`  GET  /api/countdown - Get countdown data`);
    console.log(`  POST /api/countdown - Update countdown data`);
});
