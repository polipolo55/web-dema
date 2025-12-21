const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const { requireAuth, sanitizeString, validateTourData } = require('../middleware');

const router = express.Router();

module.exports = (db) => {

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
            const data = await fs.readFile(path.join(process.cwd(), 'data', 'band-info.json'), 'utf8');
            res.json(JSON.parse(data));
        } catch (error) {
            console.error('Error reading band info:', error);
            res.status(500).json({ error: 'Failed to load band information' });
        }
    });

    router.put('/band-info', requireAuth, async (req, res) => {
        try {
            const incoming = req.body;
            if (!incoming || typeof incoming !== 'object' || !incoming.band) {
                return res.status(400).json({ error: 'Invalid payload: missing band object' });
            }

            const sanitize = (v) => typeof v === 'string' ? v.replace(/<[^>]*>?/gm, '').substring(0, 1000) : v;
            const out = { ...incoming };
            const dataPath = path.join(process.cwd(), 'data', 'band-info.json');

            const currentRaw = await fs.readFile(dataPath, 'utf8');
            let current = {};
            try { current = JSON.parse(currentRaw); } catch (e) { }

            // Merging logic here (simplified for brevity but preserving structure)
            // ... (Copied logic from original server.js) ...

            // Re-implementing the merge carefully
            out.band = out.band || {};
            out.band.name = sanitize(out.band.name || current.band?.name || '');
            out.band.origin = sanitize(out.band.origin || current.band?.origin || '');
            out.band.genre = sanitize(out.band.genre || current.band?.genre || '');
            out.band.formed = sanitize(out.band.formed || current.band?.formed || '');

            if (Array.isArray(out.band.description)) {
                out.band.description = out.band.description.map(d => sanitize(d).substring(0, 2000));
            } else if (typeof out.band.description === 'string') {
                out.band.description = out.band.description.split(/\n\n+/).map(p => sanitize(p).substring(0, 2000)).filter(Boolean);
            } else {
                out.band.description = current.band?.description || [];
            }

            if (Array.isArray(out.band.members)) {
                out.band.members = out.band.members.map(m => ({ name: sanitize(m.name || ''), role: sanitize(m.role || '') }));
            } else {
                out.band.members = current.band?.members || [];
            }

            out.contact = out.contact || {};
            out.contact.email = sanitize(out.contact.email || current.contact?.email || '');
            out.contact.location = sanitize(out.contact.location || current.contact?.location || '');

            out.social = out.social || {};
            out.social.instagram = { url: sanitize(out.social.instagram?.url || current.social?.instagram?.url || '') };
            out.social.youtube = { url: sanitize(out.social.youtube?.url || current.social?.youtube?.url || '') };
            out.social.tiktok = { url: sanitize(out.social.tiktok?.url || current.social?.tiktok?.url || '') };
            out.social.spotify = { url: sanitize(out.social.spotify?.url || current.social?.spotify?.url || '') };
            out.social.appleMusic = { url: sanitize(out.social.appleMusic?.url || current.social?.appleMusic?.url || '') };

            // Discography
            out.discography = out.discography || current.discography || { releases: [] };
            if (out.discography && Array.isArray(out.discography.releases)) {
                out.discography.releases = out.discography.releases.map(rel => {
                    const r = {};
                    r.title = sanitize(rel.title || '').substring(0, 200);
                    r.type = sanitize(rel.type || '').substring(0, 50);
                    r.year = Number(rel.year) || (rel.year === 0 ? 0 : undefined);
                    r.recorded = sanitize(rel.recorded || '').substring(0, 200);
                    r.studio = sanitize(rel.studio || '').substring(0, 200);
                    r.released = sanitize(rel.released || '').substring(0, 200);
                    r.releaseDate = typeof rel.releaseDate === 'string' ? rel.releaseDate : rel.releaseDate ? String(rel.releaseDate) : undefined;
                    r.cover = sanitize(rel.cover || '').substring(0, 400);
                    r.status = sanitize(rel.status || '').substring(0, 50);
                    r.description = typeof rel.description === 'string' ? sanitize(rel.description).substring(0, 2000) : rel.description || undefined;

                    if (Array.isArray(rel.tracks)) {
                        r.tracks = rel.tracks.map(t => ({ title: sanitize(t.title || '').substring(0, 200), duration: sanitize(t.duration || '').substring(0, 50) }));
                    } else {
                        r.tracks = [];
                    }

                    r.streaming = {
                        spotify: sanitize(rel.streaming?.spotify || current.discography?.releases?.find(x => x.title === rel.title)?.streaming?.spotify || ''),
                        youtube: sanitize(rel.streaming?.youtube || current.discography?.releases?.find(x => x.title === rel.title)?.streaming?.youtube || ''),
                        appleMusic: sanitize(rel.streaming?.appleMusic || current.discography?.releases?.find(x => x.title === rel.title)?.streaming?.appleMusic || '')
                    };
                    return r;
                });
            } else {
                out.discography = current.discography || { releases: [] };
            }

            // Backup
            const backupDir = path.join(process.cwd(), 'data', 'backups');
            try { await fs.mkdir(backupDir, { recursive: true }); } catch (e) { }
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            const backupPath = path.join(backupDir, `band-info-${ts}.json`);
            await fs.writeFile(backupPath, JSON.stringify(current, null, 2), 'utf8');

            await fs.writeFile(dataPath, JSON.stringify(out, null, 2), 'utf8');
            res.json({ success: true, message: 'Band info updated' });
        } catch (error) {
            console.error('Error updating band info:', error);
            res.status(500).json({ error: 'Failed to update band information' });
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
