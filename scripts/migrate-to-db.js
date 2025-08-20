const BandDatabase = require('../database');

async function main() {
    console.log('🔄 Migrating from JSON files to SQLite database...');
    
    const db = new BandDatabase();
    await db.initialize();
    
    try {
        console.log('✅ Migration completed successfully!');
        console.log('\nYou can now:');
        console.log('1. Test the database with: node server.js');
        console.log('2. Create backups with: npm run backup');
        console.log('3. Remove old JSON files after confirming everything works');
        
        // Show migrated data
        const tours = db.getTours();
        const countdown = db.getCountdown();
        
        console.log(`\n📊 Migrated data:`);
        console.log(`   Tours: ${tours.length} entries`);
        console.log(`   Countdown: ${countdown.title ? 'configured' : 'empty'}`);
        
    } finally {
        db.close();
    }
}

main().catch(console.error);
