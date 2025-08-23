#!/usr/bin/env node

/**
 * Database connectivity test script
 * Use this to debug database issues on the server
 * 
 * Usage:
 *   NODE_ENV=production node scripts/test-database.js
 *   node scripts/test-database.js  (for development)
 */

console.log('🧪 Testing Database Connectivity...');
console.log('===================================');

const path = require('path');
const fs = require('fs');

// Show environment info
console.log(`📊 Environment Info:`);
console.log(`   NODE_ENV: ${process.env.NODE_ENV || 'not set'}`);
console.log(`   Current working directory: ${process.cwd()}`);
console.log(`   Node.js version: ${process.version}`);
console.log('');

// Test database import
try {
    const BandDatabase = require('../database');
    console.log('✅ Database module imported successfully');
    
    // Create database instance
    const db = new BandDatabase();
    console.log(`📁 Expected database path: ${db.dbPath}`);
    
    // Check if database directory exists
    const dbDir = path.dirname(db.dbPath);
    if (fs.existsSync(dbDir)) {
        console.log(`✅ Database directory exists: ${dbDir}`);
        
        // Check permissions
        const stats = fs.statSync(dbDir);
        console.log(`📋 Directory permissions: ${stats.mode.toString(8)}`);
    } else {
        console.log(`❌ Database directory does not exist: ${dbDir}`);
        console.log(`   Creating directory...`);
        fs.mkdirSync(dbDir, { recursive: true });
        console.log(`✅ Directory created`);
    }
    
    // Test database initialization
    console.log('🔄 Testing database initialization...');
    db.initialize()
        .then(() => {
            console.log('✅ Database initialization successful!');
            
            // Test basic operations
            console.log('🔄 Testing basic database operations...');
            
            try {
                // Test tours
                const tours = db.getAllTours();
                console.log(`✅ Tours query successful: ${tours.length} tours found`);
                
                // Test countdown
                const countdown = db.getCountdown();
                console.log(`✅ Countdown query successful: ${countdown ? 'data found' : 'no data'}`);
                
                // Test gallery
                const gallery = db.getGalleryPhotos();
                console.log(`✅ Gallery query successful: ${gallery.length} photos found`);
                
                console.log('');
                console.log('🎉 All database tests passed!');
                console.log('   The database is working correctly.');
                
            } catch (opError) {
                console.error('❌ Database operation failed:', opError.message);
                process.exit(1);
            }
        })
        .catch((initError) => {
            console.error('❌ Database initialization failed:', initError.message);
            console.error('');
            console.error('🔍 Troubleshooting steps:');
            console.error('1. Check if better-sqlite3 is properly installed');
            console.error('2. Verify database directory permissions');
            console.error('3. Ensure NODE_ENV is set correctly');
            console.error('4. Check if the database file is corrupted');
            console.error('');
            process.exit(1);
        });
        
} catch (importError) {
    console.error('❌ Failed to import database module:', importError.message);
    console.error('');
    console.error('🔍 Troubleshooting steps:');
    console.error('1. Run: npm install --production');
    console.error('2. Check if better-sqlite3 compiled correctly');
    console.error('3. Verify all dependencies are installed');
    console.error('');
    process.exit(1);
}
