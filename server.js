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
        // If file doesn't exist, return default data
        const defaultTours = {
            tours: [
                {
                    id: 1,
                    date: "15 AGO 2025",
                    city: "Barcelona",
                    venue: "Sala Apolo",
                    ticketLink: "#"
                },
                {
                    id: 2,
                    date: "22 AGO 2025",
                    city: "Girona",
                    venue: "Festival Strenes",
                    ticketLink: "#"
                },
                {
                    id: 3,
                    date: "05 SET 2025",
                    city: "València",
                    venue: "Loco Club",
                    ticketLink: "#"
                },
                {
                    id: 4,
                    date: "12 SET 2025",
                    city: "Palma",
                    venue: "Es Gremi",
                    ticketLink: "#"
                }
            ]
        };
        res.json(defaultTours);
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
});
