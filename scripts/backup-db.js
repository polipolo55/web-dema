const BandDatabase = require('../database');

async function main() {
    console.log('🔄 Creating database backup...');
    
    const db = new BandDatabase();
    await db.initialize();
    
    try {
        const backupPath = await db.createBackup();
        console.log(`✅ Backup created: ${backupPath}`);
        
        // Also export as JSON for extra safety
        const tours = db.getTours();
        const countdown = db.getCountdown();
        
        const fs = require('fs').promises;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        await fs.writeFile(
            `./backups/tours-backup-${timestamp}.json`, 
            JSON.stringify({ tours }, null, 2)
        );
        
        await fs.writeFile(
            `./backups/countdown-backup-${timestamp}.json`, 
            JSON.stringify({ release: countdown }, null, 2)
        );
        
        console.log(`✅ JSON backups also created in ./backups/`);
        
    } finally {
        db.close();
    }
}

main().catch(console.error);
