const BandDatabase = require('../database');
const fs = require('fs');

async function migrateExistingData() {
    console.log('🔄 Migrating existing data to database...');
    
    const db = new BandDatabase();
    await db.initialize();
    
    try {
        // First, add some tours back (from your original data)
        const tours = [
            { date: "15 Agost 2025", city: "Collbató", venue: "Casa del Pol (assaig obert)", ticketLink: "https://www.youtube.com/" },
            { date: "26 Agost 2025", city: "Barcelona", venue: "Sala Apolo (si no la liem)", ticketLink: "https://www.youtube.com/" },
            { date: "23 Setembre 2025", city: "Barcelona", venue: "Sala Apolo (segona oportunitat)", ticketLink: "" }
        ];
        
        for (const tour of tours) {
            db.addTour(tour);
        }
        console.log(`✅ Added ${tours.length} tours`);
        
        // Add countdown data
        const countdownData = {
            title: "Divisió del Joi",
            description: "El segon EP (fet amb més diners)",
            releaseDate: "2025-09-19T10:00:00.000Z",
            enabled: true,
            completedTitle: "Divisió del Joi JA ÉS AQUÍ!",
            completedDescription: "Escolta el nostre EP on vulguis (o baixa'l pirata, què vols que et digui)",
            preReleaseMessage: "🎸 Rock català que mola de veritat! 🎸"
        };
        
        db.updateCountdown(countdownData);
        console.log('✅ Added countdown data');
        
        // Migrate gallery from existing gallery.json
        if (fs.existsSync('./data/gallery.json')) {
            const galleryData = JSON.parse(fs.readFileSync('./data/gallery.json', 'utf8'));
            
            // Add gallery settings
            db.updateGallerySettings(galleryData.gallery.enabled);
            console.log('✅ Migrated gallery settings');
            
            // Add photos
            for (const photo of galleryData.gallery.photos) {
                db.addPhoto({
                    id: photo.id,
                    filename: photo.filename,
                    title: photo.title,
                    description: photo.description,
                    order: photo.order
                });
            }
            console.log(`✅ Migrated ${galleryData.gallery.photos.length} photos`);
        }
        
        console.log('🎉 All data migrated successfully!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error);
    } finally {
        db.close();
    }
}

migrateExistingData();
