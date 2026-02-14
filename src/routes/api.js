const express = require('express');
const config = require('../config');
const {
    requireAuth,
    isAuthenticated,
    createAdminSession,
    destroyAdminSession,
    setAdminSessionCookie,
    clearAdminSessionCookie,
    sanitizeString,
    validateTourData
} = require('../middleware');

const router = express.Router();

function hasReplacementCharsDeep(input) {
    if (input == null) return false;
    if (typeof input === 'string') return input.includes('�');
    if (Array.isArray(input)) return input.some((item) => hasReplacementCharsDeep(item));
    if (typeof input === 'object') return Object.values(input).some((value) => hasReplacementCharsDeep(value));
    return false;
}

module.exports = (db) => {

    // === ADMIN AUTH SESSION ===
    router.get('/admin/session', async (req, res) => {
        res.json({ authenticated: isAuthenticated(req) });
    });

    router.post('/admin/login', async (req, res) => {
        const configuredPassword = config.auth.adminPassword;
        if (!configuredPassword) {
            return res.status(500).json({ error: 'Admin authentication is not configured' });
        }

        const password = typeof req.body?.password === 'string' ? req.body.password : '';
        if (!password) {
            return res.status(400).json({ error: 'Password is required' });
        }

        if (password !== configuredPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = createAdminSession();
        setAdminSessionCookie(res, token);
        return res.json({ success: true, authenticated: true });
    });

    router.post('/admin/logout', async (req, res) => {
        destroyAdminSession(req);
        clearAdminSessionCookie(res);
        return res.json({ success: true, authenticated: false });
    });

    // === TOURS ===
    router.get('/tours', async (req, res) => {
        try {
            const tours = db.getTours();
            res.json({ tours });
        } catch (error) {
            console.error('Error reading tours data:', error);
            res.status(500).json({ error: 'Failed to load tours data' });
        }
    });

    router.post('/tours', requireAuth, async (req, res) => {
        try {
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

    router.put('/tours/:id', requireAuth, async (req, res) => {
        try {
            const tourId = parseInt(req.params.id);
            if (isNaN(tourId)) {
                return res.status(400).json({ error: 'Invalid tour ID' });
            }

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

    router.delete('/tours/:id', requireAuth, async (req, res) => {
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

    // === COUNTDOWN ===
    router.get('/countdown', async (req, res) => {
        try {
            const countdown = db.getCountdown();
            res.json({ release: countdown });
        } catch (error) {
            console.error('Error reading countdown data:', error);
            res.status(500).json({ error: 'Failed to load countdown data' });
        }
    });

    router.post('/countdown', requireAuth, async (req, res) => {
        try {
            const { title, description, releaseDate, enabled, completedTitle, completedDescription } = req.body;

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

    // === BACKUP ===
    router.post('/backup', requireAuth, async (req, res) => {
        try {
            const backupPath = await db.createBackup();
            res.json({ success: true, backupPath });
        } catch (error) {
            console.error('Error creating backup:', error);
            res.status(500).json({ error: 'Failed to create backup' });
        }
    });

    // === BAND INFO ===
    router.get('/band-info', async (req, res) => {
        try {
            res.json(db.getBandInfo());
        } catch (error) {
            console.error('Error reading band info:', error);
            res.status(500).json({ error: 'Failed to load band information' });
        }
    });

    router.put('/band-info', requireAuth, async (req, res) => {
        try {
            const incoming = req.body;
            if (!incoming || typeof incoming !== 'object') {
                return res.status(400).json({ error: 'Invalid payload' });
            }

            if (hasReplacementCharsDeep(incoming)) {
                return res.status(400).json({ error: 'Invalid text encoding detected. Please save using UTF-8 input.' });
            }

            const updated = db.updateBandInfo(incoming);
            res.json({ success: true, data: updated });
        } catch (error) {
            console.error('Error updating band info:', error);
            res.status(500).json({ error: 'Failed to update band information' });
        }
    });

    // === RELEASES ===
    router.get('/releases', async (req, res) => {
        try {
            res.json({ releases: db.getReleases() });
        } catch (error) {
            console.error('Error reading releases:', error);
            res.status(500).json({ error: 'Failed to load releases' });
        }
    });

    router.post('/releases', requireAuth, async (req, res) => {
        try {
            if (hasReplacementCharsDeep(req.body)) {
                return res.status(400).json({ error: 'Invalid text encoding detected. Please save using UTF-8 input.' });
            }

            const title = sanitizeString(req.body?.title || '', 200);
            if (!title) {
                return res.status(400).json({ error: 'Release title is required' });
            }

            const created = db.addRelease({
                ...req.body,
                title
            });
            res.json({ success: true, release: created });
        } catch (error) {
            console.error('Error creating release:', error);
            res.status(500).json({ error: 'Failed to create release' });
        }
    });

    router.put('/releases/:id', requireAuth, async (req, res) => {
        try {
            const releaseId = parseInt(req.params.id, 10);
            if (Number.isNaN(releaseId)) {
                return res.status(400).json({ error: 'Invalid release ID' });
            }

            if (hasReplacementCharsDeep(req.body)) {
                return res.status(400).json({ error: 'Invalid text encoding detected. Please save using UTF-8 input.' });
            }

            const title = sanitizeString(req.body?.title || '', 200);
            if (!title) {
                return res.status(400).json({ error: 'Release title is required' });
            }

            const updated = db.updateRelease(releaseId, {
                ...req.body,
                title
            });

            if (!updated) {
                return res.status(404).json({ error: 'Release not found' });
            }

            res.json({ success: true, release: updated });
        } catch (error) {
            console.error('Error updating release:', error);
            res.status(500).json({ error: 'Failed to update release' });
        }
    });

    router.delete('/releases/:id', requireAuth, async (req, res) => {
        try {
            const releaseId = parseInt(req.params.id, 10);
            if (Number.isNaN(releaseId)) {
                return res.status(400).json({ error: 'Invalid release ID' });
            }

            const success = db.deleteRelease(releaseId);
            if (!success) {
                return res.status(404).json({ error: 'Release not found' });
            }

            res.json({ success: true });
        } catch (error) {
            console.error('Error deleting release:', error);
            res.status(500).json({ error: 'Failed to delete release' });
        }
    });

    router.post('/releases/reorder', requireAuth, async (req, res) => {
        try {
            const releaseId = parseInt(req.body?.releaseId, 10);
            const targetIndex = parseInt(req.body?.targetIndex, 10);

            if (Number.isNaN(releaseId) || Number.isNaN(targetIndex)) {
                return res.status(400).json({ error: 'Invalid reorder payload' });
            }

            const result = db.reorderRelease(releaseId, targetIndex);
            if (!result.success) {
                const status = result.error === 'Release not found' ? 404 : 400;
                return res.status(status).json({ error: result.error || 'Unable to reorder releases' });
            }

            res.json({ success: true, releases: result.releases });
        } catch (error) {
            console.error('Error reordering releases:', error);
            res.status(500).json({ error: 'Failed to reorder releases' });
        }
    });

    // === WINDOW CONFIG ===
    router.get('/window-config', async (req, res) => {
        try {
            res.json(db.getWindowConfig());
        } catch (error) {
            console.error('Error reading window config:', error);
            res.status(500).json({ error: 'Failed to load window configuration' });
        }
    });

    router.put('/window-config', requireAuth, async (req, res) => {
        try {
            const incoming = req.body;
            if (!incoming || typeof incoming !== 'object') {
                return res.status(400).json({ error: 'Invalid payload' });
            }

            const saved = db.saveWindowConfig(incoming);
            res.json({ success: true, config: saved });
        } catch (error) {
            console.error('Error updating window config:', error);
            res.status(500).json({ error: 'Failed to update window configuration' });
        }
    });

    // === GALLERY ===
    router.get('/gallery', async (req, res) => {
        try {
            const gallery = db.getGallery();
            res.json(gallery);
        } catch (error) {
            console.error('Error reading gallery data:', error);
            res.status(500).json({ error: 'Failed to load gallery data' });
        }
    });

    return router;
};
