const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const multer = require('multer');
const { randomUUID } = require('crypto');
const { requireAuth } = require('../middleware');
const config = require('../config');

const router = express.Router();

function getGalleryDir() {
    return config.uploads?.galleryPath || path.join(process.cwd(), 'public', 'assets', 'gallery');
}

function getTracksDir() {
    return config.uploads?.tracksPath || path.join(process.cwd(), 'public', 'assets', 'audio', 'tracks');
}

function ensureGalleryDir() {
    const dir = getGalleryDir();
    try {
        fsSync.mkdirSync(dir, { recursive: true });
    } catch (e) {}
    return dir;
}

function ensureTracksDir() {
    const dir = getTracksDir();
    try {
        fsSync.mkdirSync(dir, { recursive: true });
    } catch (e) {}
    return dir;
}

function getCoversDir() {
    return config.uploads?.coversPath || path.join(process.cwd(), 'public', 'assets', 'covers');
}

function ensureCoversDir() {
    const dir = getCoversDir();
    try {
        fsSync.mkdirSync(dir, { recursive: true });
    } catch (e) {}
    return dir;
}

// Configure multer for gallery (safe filename: UUID + ext)
const galleryStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        try {
            cb(null, ensureGalleryDir());
        } catch (err) {
            cb(err);
        }
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname) || '';
        const safeName = randomUUID() + ext;
        cb(null, safeName);
    }
});

const upload = multer({
    storage: galleryStorage,
    limits: { fileSize: 200 * 1024 * 1024 },
    fileFilter: function (req, file, cb) {
        if (file.fieldname === 'media') {
            const isImage = file.mimetype.startsWith('image/');
            const isVideo = file.mimetype.startsWith('video/');
            if (isImage || isVideo) return cb(null, true);
            return cb(new Error('Unsupported media type. Please upload images or videos only.'), false);
        }
        if (file.fieldname === 'thumbnail') {
            if (file.mimetype.startsWith('image/')) return cb(null, true);
            return cb(new Error('Thumbnail must be an image file.'), false);
        }
        return cb(new Error('Unexpected file field received'), false);
    }
});

const uploadMedia = upload.fields([
    { name: 'media', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 }
]);

function handleMediaUpload(req, res, next) {
    uploadMedia(req, res, (err) => {
        if (err) {
            let status = 400;
            let message = 'Media upload failed';
            if (err instanceof multer.MulterError) {
                if (err.code === 'LIMIT_FILE_SIZE') {
                    status = 413;
                    message = 'File exceeds the 200 MB size limit';
                }
            } else if (err.message) {
                message = err.message;
            }
            return res.status(status).json({ error: message });
        }
        next();
    });
}

// Multer for song audio (reuses the tracks upload dir)
const audioStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        try {
            cb(null, ensureTracksDir());
        } catch (err) {
            cb(err);
        }
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
        cb(null, randomUUID() + (ext || ''));
    }
});

const uploadAudio = multer({
    storage: audioStorage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: function (req, file, cb) {
        const name = file.originalname.toLowerCase();
        if (name.endsWith('.mp3') || name.endsWith('.wav')) {
            cb(null, true);
        } else {
            cb(new Error('Només es permeten fitxers .mp3 i .wav'), false);
        }
    }
}).single('audio');

// Multer for release covers
const coverStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        try {
            cb(null, ensureCoversDir());
        } catch (err) {
            cb(err);
        }
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase().replace(/[^a-z0-9.]/g, '');
        cb(null, randomUUID() + (ext || ''));
    }
});

const uploadCover = multer({
    storage: coverStorage,
    limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
    fileFilter: function (req, file, cb) {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('La portada ha de ser una imatge'), false);
    }
}).single('cover');

module.exports = (db) => {

    async function handleDeletePhoto(req, res) {
        try {
            const { photoId } = req.body;
            if (photoId == null || photoId === '') {
                return res.status(400).json({ error: 'photoId is required' });
            }

            const gallery = db.getGallery();
            const photo = (gallery.gallery.photos || []).find((p) => String(p.id) === String(photoId));

            if (!photo) {
                return res.status(404).json({ error: 'Media item not found' });
            }

            if (db.deletePhoto(photo.id)) {
                try {
                    await fs.unlink(path.join(getGalleryDir(), photo.filename));
                } catch (e) {
                    console.warn(`Could not delete file ${photo.filename}:`, e.message);
                }
                if (photo.thumbnail && photo.thumbnail !== photo.filename) {
                    try {
                        await fs.unlink(path.join(getGalleryDir(), photo.thumbnail));
                    } catch (e) {
                        console.warn(`Could not delete thumbnail ${photo.thumbnail}:`, e.message);
                    }
                }
                return res.json({ success: true, message: 'Media item deleted successfully' });
            }

            return res.status(404).json({ error: 'Media item not found in database' });
        } catch (error) {
            console.error('Error deleting media item:', error);
            return res.status(500).json({ error: 'Error deleting media item' });
        }
    }

    // Helper: delete a cover file referenced as /api/covers/<filename>
    async function deleteCoverFile(cover) {
        const prefix = '/api/covers/';
        if (!cover || !cover.startsWith(prefix)) return;
        const filename = cover.slice(prefix.length);
        if (!filename || filename.includes('..') || filename.includes('/')) return;
        try {
            await fs.unlink(path.join(getCoversDir(), filename));
        } catch (e) {
            console.warn('No s\'ha pogut eliminar la portada:', e.message);
        }
    }

    async function deleteAudioFile(filename) {
        if (!filename) return;
        try {
            await fs.unlink(path.join(getTracksDir(), filename));
        } catch (e) {
            console.warn('No s\'ha pogut eliminar el fitxer d\'àudio:', e.message);
        }
    }

    router.post('/songs/:id/audio', requireAuth, (req, res) => {
        uploadAudio(req, res, async (err) => {
            if (err) {
                return res.status(400).json({ error: err.message || 'Error pujant l\'àudio' });
            }
            if (!req.file) {
                return res.status(400).json({ error: 'No s\'ha pujat cap fitxer d\'àudio' });
            }
            const songId = parseInt(req.params.id, 10);
            const result = Number.isNaN(songId)
                ? null
                : db.setSongAudio(songId, { filename: req.file.filename, mimeType: req.file.mimetype });
            if (!result) {
                await deleteAudioFile(req.file.filename);
                return res.status(404).json({ error: 'Cançó no trobada' });
            }
            await deleteAudioFile(result.previousFilename);
            res.json({ success: true, song: result.song });
        });
    });

    router.delete('/songs/:id/audio', requireAuth, async (req, res) => {
        const songId = parseInt(req.params.id, 10);
        const result = Number.isNaN(songId) ? null : db.clearSongAudio(songId);
        if (!result) return res.status(404).json({ error: 'Cançó no trobada' });
        await deleteAudioFile(result.previousFilename);
        res.json({ success: true, song: result.song });
    });

    router.delete('/songs/:id', requireAuth, async (req, res) => {
        const songId = parseInt(req.params.id, 10);
        const deleted = Number.isNaN(songId) ? null : db.deleteSong(songId);
        if (!deleted) return res.status(404).json({ error: 'Cançó no trobada' });
        await deleteAudioFile(deleted.audioFilename);
        res.json({ success: true });
    });

    router.post('/releases/:id/cover', requireAuth, (req, res) => {
        uploadCover(req, res, async (err) => {
            if (err) {
                return res.status(400).json({ error: err.message || 'Error pujant la portada' });
            }
            if (!req.file) {
                return res.status(400).json({ error: 'No s\'ha pujat cap imatge' });
            }
            const releaseId = parseInt(req.params.id, 10);
            const result = Number.isNaN(releaseId)
                ? null
                : db.setReleaseCover(releaseId, `/api/covers/${req.file.filename}`);
            if (!result) {
                try {
                    await fs.unlink(path.join(getCoversDir(), req.file.filename));
                } catch (e) {}
                return res.status(404).json({ error: 'Llançament no trobat' });
            }
            await deleteCoverFile(result.previousCover);
            res.json({ success: true, release: result.release });
        });
    });

    router.delete('/releases/:id', requireAuth, async (req, res) => {
        const releaseId = parseInt(req.params.id, 10);
        const deleted = Number.isNaN(releaseId) ? null : db.deleteRelease(releaseId);
        if (!deleted) return res.status(404).json({ error: 'Llançament no trobat' });
        await deleteCoverFile(deleted.cover);
        res.json({ success: true });
    });

    router.post('/delete-photo', requireAuth, handleDeletePhoto);
    router.delete('/delete-photo', requireAuth, handleDeletePhoto);

    router.post('/reorder-photos', requireAuth, async (req, res) => {
        try {
            const { photoId, targetIndex } = req.body;
            const gallery = db.getGallery();
            const photos = gallery.gallery.photos || [];

            const photoIndex = photos.findIndex((p) => String(p.id) === String(photoId));
            if (photoIndex === -1) return res.status(404).json({ error: 'Media item not found' });

            const [moved] = photos.splice(photoIndex, 1);
            photos.splice(Number(targetIndex), 0, moved);

            const ordered = photos.map((p, i) => ({ id: p.id, order: i + 1 }));
            db.reorderPhotos(ordered);
            res.json({ success: true, message: 'Media reordered successfully' });
        } catch (error) {
            console.error('Error reordering media:', error);
            res.status(500).json({ error: 'Error reordering media' });
        }
    });

    router.post('/add-photo', requireAuth, handleMediaUpload, async (req, res) => {
        const mediaFile = req.files?.media?.[0];
        const thumbnailFile = req.files?.thumbnail?.[0];

        if (!mediaFile) return res.status(400).json({ error: 'No media file uploaded' });

        const generateId = () => randomUUID();

        const newPhoto = {
            id: generateId(),
            filename: mediaFile.filename,
            title: (req.body && req.body.title) || mediaFile.originalname,
            description: (req.body && req.body.description) || '',
            order: parseInt(req.body && req.body.order, 10),
            mediaType: (req.body && req.body.mediaType || '').toLowerCase() === 'video' || mediaFile.mimetype.startsWith('video/') ? 'video' : 'photo',
            thumbnail: thumbnailFile ? thumbnailFile.filename : undefined,
            mimeType: mediaFile.mimetype
        };

        if (!newPhoto.thumbnail && newPhoto.mediaType === 'photo') {
            newPhoto.thumbnail = mediaFile.filename;
        }

        if (!newPhoto.order) {
            newPhoto.order = db.getNextGalleryOrder();
        }

        try {
            const result = db.addPhoto(newPhoto);
            if (!result || result.changes === 0) throw new Error('No rows inserted');
            res.json({ success: true, photo: newPhoto, message: 'Media uploaded successfully' });
        } catch (insertErr) {
            const galleryDir = getGalleryDir();
            try {
                await fs.unlink(path.join(galleryDir, mediaFile.filename));
            } catch (e) {
                console.warn('Could not remove file after failed insert:', e.message);
            }
            if (thumbnailFile) {
                try {
                    await fs.unlink(path.join(galleryDir, thumbnailFile.filename));
                } catch (e) {
                    console.warn('Could not remove thumbnail after failed insert:', e.message);
                }
            }
            console.error('Error saving photo to DB:', insertErr);
            res.status(500).json({ error: 'Error uploading media' });
        }
    });

    return router;
};
