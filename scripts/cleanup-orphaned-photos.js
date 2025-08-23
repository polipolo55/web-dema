const fs = require('fs').promises;
const path = require('path');
const BandDatabase = require('../database');

async function cleanupOrphanedPhotos() {
    console.log('Starting cleanup of orphaned photo files...');
    
    try {
        // Initialize database
        const db = new BandDatabase();
        await db.initialize();
        
        // Get all photos from database
        const gallery = db.getGallery();
        const dbPhotos = gallery.gallery.photos || [];
        const dbFilenames = new Set(dbPhotos.map(photo => photo.filename));
        
        console.log(`Found ${dbPhotos.length} photos in database`);
        
        // Get all files from gallery directory
        const galleryDir = path.join(__dirname, '../assets/gallery');
        let filesList = [];
        
        try {
            filesList = await fs.readdir(galleryDir);
            filesList = filesList.filter(file => {
                // Only consider image files
                const ext = path.extname(file).toLowerCase();
                return ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
            });
        } catch (error) {
            console.log('Gallery directory not found or empty');
            return;
        }
        
        console.log(`Found ${filesList.length} image files in gallery directory`);
        
        // Find orphaned files (files not in database)
        const orphanedFiles = filesList.filter(filename => !dbFilenames.has(filename));
        
        if (orphanedFiles.length === 0) {
            console.log('✅ No orphaned files found!');
        } else {
            console.log(`Found ${orphanedFiles.length} orphaned files:`);
            
            for (const filename of orphanedFiles) {
                console.log(`  - ${filename}`);
                try {
                    await fs.unlink(path.join(galleryDir, filename));
                    console.log(`    ✅ Deleted`);
                } catch (error) {
                    console.log(`    ❌ Failed to delete: ${error.message}`);
                }
            }
        }
        
        // Also find missing files (files in database but not on filesystem)
        const missingFiles = dbPhotos.filter(photo => !filesList.includes(photo.filename));
        
        if (missingFiles.length > 0) {
            console.log(`\n⚠️  Found ${missingFiles.length} photos in database with missing files:`);
            for (const photo of missingFiles) {
                console.log(`  - ${photo.filename} (ID: ${photo.id}, Title: "${photo.title}")`);
            }
            console.log('Consider removing these database entries manually if the files are permanently lost.');
        }
        
        db.close();
        console.log('\n🧹 Cleanup completed!');
        
    } catch (error) {
        console.error('Error during cleanup:', error);
    }
}

// Run if called directly
if (require.main === module) {
    cleanupOrphanedPhotos();
}

module.exports = cleanupOrphanedPhotos;
