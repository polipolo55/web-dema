const express = require('express');
const { timingSafeEqual } = require('crypto');
const config = require('../config');
const {
    requireAuth,
    isAuthenticated,
    loginRateLimit,
    sanitizeString,
    validateTourData
} = require('../middleware');

function hasReplacementCharsDeep(input) {
    if (input == null) return false;
    if (typeof input === 'string') return input.includes('�');
    if (Array.isArray(input)) return input.some((item) => hasReplacementCharsDeep(item));
    if (typeof input === 'object') return Object.values(input).some((value) => hasReplacementCharsDeep(value));
    return false;
}

module.exports = (db) => {
    const router = express.Router();

    router.get('/session', (req, res) => {
        res.json({ authenticated: isAuthenticated(req) });
    });

    router.post('/login', loginRateLimit, (req, res) => {
        const configuredPassword = config.auth.adminPassword;
        if (!configuredPassword) {
            return res.status(500).json({ error: 'Admin authentication is not configured' });
        }
        const password = typeof req.body?.password === 'string' ? req.body.password : '';
        if (!password) return res.status(400).json({ error: 'Password is required' });
        let isMatch = false;
        try {
            isMatch = password.length === configuredPassword.length &&
                timingSafeEqual(Buffer.from(password), Buffer.from(configuredPassword));
        } catch (_) {}
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        req.session.auth = true;
        return res.json({ success: true, authenticated: true });
    });

    router.post('/logout', (req, res) => {
        req.session = null;
        return res.json({ success: true, authenticated: false });
    });

    router.use(requireAuth);

    router.post('/tours', async (req, res, next) => {
        try {
            const validationError = validateTourData(req.body);
            if (validationError) return res.status(400).json({ error: validationError });
            const tourData = {
                date: req.body.date,
                city: sanitizeString(req.body.city),
                venue: sanitizeString(req.body.venue),
                ticketLink: sanitizeString(req.body.ticketLink || '')
            };
            const newTour = db.addTour(tourData);
            res.json(newTour);
        } catch (error) {
            next(error);
        }
    });

    router.put('/tours/:id', async (req, res, next) => {
        try {
            const tourId = parseInt(req.params.id);
            if (isNaN(tourId)) return res.status(400).json({ error: 'Invalid tour ID' });
            const validationError = validateTourData(req.body);
            if (validationError) return res.status(400).json({ error: validationError });
            const tourData = {
                date: req.body.date,
                city: sanitizeString(req.body.city),
                venue: sanitizeString(req.body.venue),
                ticketLink: sanitizeString(req.body.ticketLink || '')
            };
            const success = db.updateTour(tourId, tourData);
            if (success) res.json({ success: true, id: tourId, ...tourData });
            else res.status(404).json({ error: 'Tour not found' });
        } catch (error) {
            next(error);
        }
    });

    router.delete('/tours/:id', async (req, res, next) => {
        try {
            const tourId = parseInt(req.params.id);
            if (isNaN(tourId)) return res.status(400).json({ error: 'Invalid tour ID' });
            const success = db.deleteTour(tourId);
            if (success) res.json({ success: true });
            else res.status(404).json({ error: 'Tour not found' });
        } catch (error) {
            next(error);
        }
    });

    router.post('/countdown', async (req, res, next) => {
        try {
            const countdownData = {
                title: sanitizeString(req.body.title),
                description: sanitizeString(req.body.description),
                releaseDate: req.body.releaseDate,
                enabled: Boolean(req.body.enabled),
                completedTitle: sanitizeString(req.body.completedTitle),
                completedDescription: sanitizeString(req.body.completedDescription)
            };
            const updated = db.updateCountdown(countdownData);
            res.json({ success: true, data: { release: updated } });
        } catch (error) {
            next(error);
        }
    });

    router.post('/backup', async (req, res, next) => {
        try {
            const backupPath = await db.createBackup();
            res.json({ success: true, message: 'Database backup created successfully' });
        } catch (error) {
            next(error);
        }
    });

    router.put('/band-info', async (req, res, next) => {
        try {
            const incoming = req.body;
            if (!incoming || typeof incoming !== 'object') return res.status(400).json({ error: 'Invalid payload' });
            if (hasReplacementCharsDeep(incoming)) {
                return res.status(400).json({ error: 'Invalid text encoding detected. Please save using UTF-8 input.' });
            }
            const updated = db.updateBandInfo(incoming);
            res.json({ success: true, data: updated });
        } catch (error) {
            next(error);
        }
    });

    router.post('/releases', async (req, res, next) => {
        try {
            if (hasReplacementCharsDeep(req.body)) {
                return res.status(400).json({ error: 'Invalid text encoding detected. Please save using UTF-8 input.' });
            }
            const title = sanitizeString(req.body?.title || '', 200);
            if (!title) return res.status(400).json({ error: 'Release title is required' });
            const created = db.addRelease({ ...req.body, title });
            res.json({ success: true, release: created });
        } catch (error) {
            next(error);
        }
    });

    router.put('/releases/:id', async (req, res, next) => {
        try {
            const releaseId = parseInt(req.params.id, 10);
            if (Number.isNaN(releaseId)) return res.status(400).json({ error: 'Invalid release ID' });
            if (hasReplacementCharsDeep(req.body)) {
                return res.status(400).json({ error: 'Invalid text encoding detected. Please save using UTF-8 input.' });
            }
            const title = sanitizeString(req.body?.title || '', 200);
            if (!title) return res.status(400).json({ error: 'Release title is required' });
            const updated = db.updateRelease(releaseId, { ...req.body, title });
            if (!updated) return res.status(404).json({ error: 'Release not found' });
            res.json({ success: true, release: updated });
        } catch (error) {
            next(error);
        }
    });

    router.delete('/releases/:id', async (req, res, next) => {
        try {
            const releaseId = parseInt(req.params.id, 10);
            if (Number.isNaN(releaseId)) return res.status(400).json({ error: 'Invalid release ID' });
            const success = db.deleteRelease(releaseId);
            if (!success) return res.status(404).json({ error: 'Release not found' });
            res.json({ success: true });
        } catch (error) {
            next(error);
        }
    });

    router.post('/releases/reorder', async (req, res, next) => {
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
            next(error);
        }
    });

    router.put('/window-config', async (req, res, next) => {
        try {
            const incoming = req.body;
            if (!incoming || typeof incoming !== 'object') return res.status(400).json({ error: 'Invalid payload' });
            const saved = db.saveWindowConfig(incoming);
            res.json({ success: true, config: saved });
        } catch (error) {
            next(error);
        }
    });

    const adminUploadsRouter = require('./admin')(db);
    router.use(adminUploadsRouter);

    return router;
};
