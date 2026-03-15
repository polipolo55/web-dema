const express = require('express');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const multer = require('multer');
const { requireAuth } = require('../middleware');

const router = express.Router();
const GALLERY_DIR = path.join(process.cwd(), 'public', 'assets', 'gallery');
const TRACKS_DIR = path.join(process.cwd(), 'public', 'assets', 'audio', 'tracks');

// Ensure gallery & tracks dir exists
try { fsSync.mkdirSync(GALLERY_DIR, { recursive: true }); } catch (e) { }
try { fsSync.mkdirSync(TRACKS_DIR, { recursive: true }); } catch (e) { }

// Configure multer for gallery
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        try {
            fsSync.mkdirSync(GALLERY_DIR, { recursive: true });
            cb(null, GALLERY_DIR);
        } catch (err) {
            cb(err);
        }
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname))
    }
});

const upload = multer({
    storage: storage,
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
            fsSync.mkdirSync(TRACKS_DIR, { recursive: true });
            cb(null, TRACKS_DIR);
        } catch (err) {
            cb(err);
        }
    },
    filename: function (req, file, cb) {
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_ ()]/g, '');
        cb(null, safeName);
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

    router.post('/add-track', requireAuth, (req, res) => {
        uploadTrack(req, res, (err) => {
            if (err) {
                return res.status(400).json({ error: err.message || 'Error uploading track' });
            }
            if (!req.file) {
                return res.status(400).json({ error: 'No track file uploaded' });
            }
            res.json({ success: true, message: 'Track uploaded successfully' });
        });
    });

    router.post('/delete-track', requireAuth, async (req, res) => {
        try {
            const { filename } = req.body;
            if (!filename || typeof filename !== 'string' || filename.includes('..') || filename.includes('/')) {
                return res.status(400).json({ error: 'Invalid filename' });
            }
            const targetPath = path.join(TRACKS_DIR, filename);
            await fs.unlink(targetPath);
            res.json({ success: true, message: 'Track deleted successfully' });
        } catch (error) {
            console.error('Error deleting track:', error);
            res.status(500).json({ error: 'Error deleting track' });
        }
    });

    router.post('/delete-photo', requireAuth, async (req, res) => {
        try {
            const { photoId } = req.body;
            const gallery = db.getGallery();
            const photo = gallery.gallery.photos.find(p => p.id === photoId);

            if (!photo) {
                return res.status(404).json({ error: 'Media item not found' });
            }

            if (db.deletePhoto(photoId)) {
                try {
                    await fs.unlink(path.join(GALLERY_DIR, photo.filename));
                } catch (e) {
                    console.warn(`Could not delete file ${photo.filename}:`, e.message);
                }
                if (photo.thumbnail && photo.thumbnail !== photo.filename) {
                    try {
                        await fs.unlink(path.join(GALLERY_DIR, photo.thumbnail));
                    } catch (e) {
                        console.warn(`Could not delete thumbnail ${photo.thumbnail}:`, e.message);
                    }
                }
                res.json({ success: true, message: 'Media item deleted successfully' });
            } else {
                res.status(404).json({ error: 'Media item not found in database' });
            }
        } catch (error) {
            console.error('Error deleting media item:', error);
            res.status(500).json({ error: 'Error deleting media item' });
        }
    });

    router.post('/reorder-photos', requireAuth, async (req, res) => {
        try {
            const { photoId, targetIndex } = req.body;
            const gallery = db.getGallery();
            const photos = gallery.gallery.photos || [];

            const photoIndex = photos.findIndex(p => p.id === photoId);
            if (photoIndex === -1) return res.status(404).json({ error: 'Media item not found' });

            const [photo] = photos.splice(photoIndex, 1);
            photos.splice(targetIndex, 0, photo);

            for (let i = 0; i < photos.length; i++) {
                db.updatePhoto(photos[i].id, { ...photos[i], order: i + 1 });
            }
            res.json({ success: true, message: 'Media reordered successfully' });
        } catch (error) {
            console.error('Error reordering media:', error);
            res.status(500).json({ error: 'Error reordering media' });
        }
    });

    router.post('/add-photo', requireAuth, handleMediaUpload, async (req, res) => {
        try {
            const mediaFile = req.files?.media?.[0];
            const thumbnailFile = req.files?.thumbnail?.[0];

            if (!mediaFile) return res.status(400).json({ error: 'No media file uploaded' });

            const { randomUUID } = require('crypto');
            const generateId = () => {
                try { if (typeof randomUUID === 'function') return randomUUID(); } catch (e) { }
                return `${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
            };

            const newPhoto = {
                id: generateId(),
                filename: mediaFile.filename,
                title: req.body.title || mediaFile.originalname,
                description: req.body.description || '',
                order: parseInt(req.body.order, 10),
                mediaType: (req.body.mediaType || '').toLowerCase() === 'video' || mediaFile.mimetype.startsWith('video/') ? 'video' : 'photo',
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
            } catch (insertErr) {
                newPhoto.id = generateId();
                db.addPhoto(newPhoto);
            }

            res.json({ success: true, photo: newPhoto, message: 'Media uploaded successfully' });
        } catch (error) {
            console.error('Error uploading media:', error);
            res.status(500).json({ error: 'Error uploading media' });
        }
    });

    return router;
};
