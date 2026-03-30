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

// Configure multer for tracks
const trackStorage = multer.diskStorage({
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

const uploadTrack = multer({
    storage: trackStorage,
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
    fileFilter: function (req, file, cb) {
        const name = file.originalname.toLowerCase();
        if (name.endsWith('.mp3') || name.endsWith('.wav')) {
            cb(null, true);
        } else {
            cb(new Error('Only .mp3 and .wav files are allowed'), false);
        }
    }
}).single('track');

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

    router.post('/add-track', requireAuth, (req, res) => {
        uploadTrack(req, res, async (err) => {
            if (err) {
                return res.status(400).json({ error: err.message || 'Error uploading track' });
            }
            if (!req.file) {
                return res.status(400).json({ error: 'No track file uploaded' });
            }
            try {
                const track = db.addTrack({
                    filename: req.file.filename,
                    title: (req.body && req.body.title) || req.file.originalname,
                    mimeType: req.file.mimetype
                });
                res.json({ success: true, track, message: 'Track uploaded successfully' });
            } catch (e) {
                try {
                    await fs.unlink(path.join(getTracksDir(), req.file.filename));
                } catch (unlinkErr) {
                    console.warn('Could not remove file after failed insert:', unlinkErr.message);
                }
                console.error('Error saving track to DB:', e);
                res.status(500).json({ error: 'Error saving track' });
            }
        });
    });

    router.post('/delete-track', requireAuth, async (req, res) => {
        try {
            const { id, filename } = req.body;
            const track = id != null
                ? db.getTrackById(Number(id))
                : (filename && typeof filename === 'string' && !filename.includes('..') && !filename.includes('/'))
                    ? db.getTrackByFilename(filename)
                    : null;
            if (!track) {
                return res.status(404).json({ error: 'Track not found' });
            }
            const targetPath = path.join(getTracksDir(), track.filename);
            try {
                await fs.unlink(targetPath);
            } catch (e) {
                console.warn('Could not delete track file:', e.message);
            }
            db.deleteTrack(track.id);
            res.json({ success: true, message: 'Track deleted successfully' });
        } catch (error) {
            console.error('Error deleting track:', error);
            res.status(500).json({ error: 'Error deleting track' });
        }
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
