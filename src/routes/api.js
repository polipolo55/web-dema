const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const config = require('../config');

const router = express.Router();

module.exports = (db) => {
    router.get('/health', (req, res) => {
        try {
            db.getTours();
            res.json({ ok: true, db: 'ok' });
        } catch (err) {
            res.status(503).json({ ok: false, db: 'error' });
        }
    });

    router.post('/contact', async (req, res, next) => {
        try {
            const { name, email, message, subject } = req.body || {};
            if (!name || typeof name !== 'string' || !name.trim()) {
                return res.status(400).json({ error: 'El nom és obligatori' });
            }
            if (!email || typeof email !== 'string' || !email.trim()) {
                return res.status(400).json({ error: 'El correu electrònic és obligatori' });
            }
            if (!message || typeof message !== 'string' || !message.trim()) {
                return res.status(400).json({ error: 'El missatge és obligatori' });
            }
            const trimmedName = name.trim().slice(0, 200);
            const trimmedEmail = email.trim().slice(0, 320);
            const trimmedMessage = message.trim().slice(0, 2000);
            const trimmedSubject = (subject && typeof subject === 'string' ? subject.trim() : '').slice(0, 100);
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedEmail)) {
                return res.status(400).json({ error: 'Introduïu un correu electrònic vàlid' });
            }
            res.json({ success: true, message: 'Missatge rebut. Us respondrem aviat.' });
        } catch (error) {
            next(error);
        }
    });

    router.get('/tours', async (req, res, next) => {
        try {
            const tours = db.getTours();
            const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
            const isIso = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
            const upcoming = tours
                .filter(t => !isIso(t.date) || t.date >= today)
                .sort((a, b) => {
                    if (!isIso(a.date) && !isIso(b.date)) return 0;
                    if (!isIso(a.date)) return 1;
                    if (!isIso(b.date)) return -1;
                    return a.date.localeCompare(b.date);
                });
            const past = tours
                .filter(t => isIso(t.date) && t.date < today)
                .sort((a, b) => b.date.localeCompare(a.date));
            res.json({ upcoming, past });
        } catch (error) {
            next(error);
        }
    });

    router.get('/countdown', async (req, res, next) => {
        try {
            const countdown = db.getCountdown();
            res.json({ release: countdown });
        } catch (error) {
            next(error);
        }
    });

    router.get('/band-info', async (req, res, next) => {
        try {
            res.json(db.getBandInfo());
        } catch (error) {
            next(error);
        }
    });

    router.get('/releases', async (req, res, next) => {
        try {
            res.json({ releases: db.getReleases() });
        } catch (error) {
            next(error);
        }
    });

    router.get('/window-config', async (req, res, next) => {
        try {
            res.json(db.getWindowConfig());
        } catch (error) {
            next(error);
        }
    });

    router.get('/mobile-config', async (req, res, next) => {
        try {
            res.json(db.getMobileConfig());
        } catch (error) {
            next(error);
        }
    });

    router.get('/gallery', async (req, res, next) => {
        try {
            res.json(db.getGallery());
        } catch (error) {
            next(error);
        }
    });

    router.get('/gallery/file/:filename', async (req, res, next) => {
        try {
            const filename = req.params.filename;
            if (!filename || filename.includes('..') || filename.includes('/')) {
                return res.status(400).json({ error: 'Invalid filename' });
            }
            const photo = db.getPhotoByFilename(filename);
            if (!photo) return res.status(404).json({ error: 'Not found' });
            const galleryPath = config.uploads?.galleryPath || path.join(process.cwd(), 'public', 'assets', 'gallery');
            const filePath = path.join(galleryPath, filename);
            await fs.access(filePath);
            res.setHeader('Content-Type', photo.mime_type || 'application/octet-stream');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            const { createReadStream } = require('fs');
            createReadStream(filePath).pipe(res);
        } catch (err) {
            if (err.code === 'ENOENT') return res.status(404).json({ error: 'Not found' });
            next(err);
        }
    });

    router.get('/tracks', async (req, res, next) => {
        try {
            const list = db.getTracks();
            const baseUrl = '/api/tracks/file';
            const tracks = list.map((t) => ({
                id: t.id,
                src: `${baseUrl}/${t.id}`,
                name: t.title || t.filename,
                filename: t.filename
            }));
            res.json({ tracks });
        } catch (error) {
            next(error);
        }
    });

    router.get('/tracks/file/:id', async (req, res, next) => {
        try {
            const id = parseInt(req.params.id, 10);
            if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
            const track = db.getTrackById(id);
            if (!track) return res.status(404).json({ error: 'Not found' });
            const tracksPath = config.uploads?.tracksPath || path.join(process.cwd(), 'public', 'assets', 'audio', 'tracks');
            const filePath = path.join(tracksPath, track.filename);
            await fs.access(filePath);
            res.setHeader('Content-Type', track.mime_type || 'audio/mpeg');
            res.setHeader('Cache-Control', 'public, max-age=86400');
            const { createReadStream } = require('fs');
            createReadStream(filePath).pipe(res);
        } catch (err) {
            if (err.code === 'ENOENT') return res.status(404).json({ error: 'Not found' });
            next(err);
        }
    });

    return router;
};
