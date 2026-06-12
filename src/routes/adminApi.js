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
                ticketLink: sanitizeString(req.body.ticketLink || ''),
                time: sanitizeString(req.body.time || '')
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
                ticketLink: sanitizeString(req.body.ticketLink || ''),
                time: sanitizeString(req.body.time || '')
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

    // ---- Cançons ----

    router.get('/songs', (req, res, next) => {
        try {
            res.json({ songs: db.getSongs() });
        } catch (error) {
            next(error);
        }
    });

    router.post('/songs', (req, res, next) => {
        try {
            if (hasReplacementCharsDeep(req.body)) {
                return res.status(400).json({ error: 'Codificació de text invàlida. Desa amb UTF-8.' });
            }
            if (!sanitizeString(req.body?.title || '', 200)) {
                return res.status(400).json({ error: 'El títol de la cançó és obligatori' });
            }
            res.json({ success: true, song: db.addSong(req.body) });
        } catch (error) {
            next(error);
        }
    });

    router.put('/songs/:id', (req, res, next) => {
        try {
            const songId = parseInt(req.params.id, 10);
            if (Number.isNaN(songId)) return res.status(400).json({ error: 'Identificador de cançó invàlid' });
            if (hasReplacementCharsDeep(req.body)) {
                return res.status(400).json({ error: 'Codificació de text invàlida. Desa amb UTF-8.' });
            }
            if (!sanitizeString(req.body?.title || '', 200)) {
                return res.status(400).json({ error: 'El títol de la cançó és obligatori' });
            }
            const updated = db.updateSong(songId, req.body);
            if (!updated) return res.status(404).json({ error: 'Cançó no trobada' });
            res.json({ success: true, song: updated });
        } catch (error) {
            next(error);
        }
    });

    router.post('/songs/player-reorder', (req, res, next) => {
        try {
            const songId = parseInt(req.body?.songId, 10);
            const targetIndex = parseInt(req.body?.targetIndex, 10);
            if (Number.isNaN(songId) || Number.isNaN(targetIndex)) {
                return res.status(400).json({ error: 'Paràmetres de reordenació invàlids' });
            }
            const result = db.reorderPlayerSong(songId, targetIndex);
            if (!result.success) return res.status(400).json({ error: result.error });
            res.json({ success: true, songs: result.songs });
        } catch (error) {
            next(error);
        }
    });

    // ---- Llançaments ----

    router.get('/releases', (req, res, next) => {
        try {
            res.json({ releases: db.getReleases({ includeDrafts: true }) });
        } catch (error) {
            next(error);
        }
    });

    router.post('/releases', (req, res, next) => {
        try {
            if (hasReplacementCharsDeep(req.body)) {
                return res.status(400).json({ error: 'Codificació de text invàlida. Desa amb UTF-8.' });
            }
            if (!sanitizeString(req.body?.title || '', 200)) {
                return res.status(400).json({ error: 'El títol del llançament és obligatori' });
            }
            res.json({ success: true, release: db.addRelease(req.body) });
        } catch (error) {
            if (/invàlid|obligatori/.test(error.message)) {
                return res.status(400).json({ error: error.message });
            }
            next(error);
        }
    });

    router.put('/releases/:id', (req, res, next) => {
        try {
            const releaseId = parseInt(req.params.id, 10);
            if (Number.isNaN(releaseId)) return res.status(400).json({ error: 'Identificador de llançament invàlid' });
            if (hasReplacementCharsDeep(req.body)) {
                return res.status(400).json({ error: 'Codificació de text invàlida. Desa amb UTF-8.' });
            }
            if (!sanitizeString(req.body?.title || '', 200)) {
                return res.status(400).json({ error: 'El títol del llançament és obligatori' });
            }
            const updated = db.updateRelease(releaseId, req.body);
            if (!updated) return res.status(404).json({ error: 'Llançament no trobat' });
            res.json({ success: true, release: updated });
        } catch (error) {
            if (/invàlid|obligatori/.test(error.message)) {
                return res.status(400).json({ error: error.message });
            }
            next(error);
        }
    });

    router.put('/releases/:id/songs', (req, res, next) => {
        try {
            const releaseId = parseInt(req.params.id, 10);
            if (Number.isNaN(releaseId)) return res.status(400).json({ error: 'Identificador de llançament invàlid' });
            const result = db.setReleaseSongs(releaseId, req.body?.songIds);
            if (!result.success) {
                const status = result.error === 'Llançament no trobat' ? 404 : 400;
                return res.status(status).json({ error: result.error });
            }
            res.json({ success: true, release: result.release });
        } catch (error) {
            next(error);
        }
    });

    router.post('/releases/reorder', (req, res, next) => {
        try {
            const releaseId = parseInt(req.body?.releaseId, 10);
            const targetIndex = parseInt(req.body?.targetIndex, 10);
            if (Number.isNaN(releaseId) || Number.isNaN(targetIndex)) {
                return res.status(400).json({ error: 'Paràmetres de reordenació invàlids' });
            }
            const result = db.reorderRelease(releaseId, targetIndex);
            if (!result.success) {
                const status = result.error === 'Llançament no trobat' ? 404 : 400;
                return res.status(status).json({ error: result.error });
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

    router.put('/mobile-config', async (req, res, next) => {
        try {
            const incoming = req.body;
            if (!incoming || typeof incoming !== 'object') return res.status(400).json({ error: 'Invalid payload' });
            const saved = db.saveMobileConfig(incoming);
            res.json({ success: true, config: saved });
        } catch (error) {
            next(error);
        }
    });

    const adminUploadsRouter = require('./admin')(db);
    router.use(adminUploadsRouter);

    return router;
};
