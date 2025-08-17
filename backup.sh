#!/bin/bash

# 🔄 Demà Band Website - Backup Script
# Run this periodically to backup your website data

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/dema-website"
WEBSITE_DIR="/var/www/web-dema"

# Create backup directory
mkdir -p $BACKUP_DIR

echo "🎸 Starting backup for Demà Band Website..."

# Create backup filename
BACKUP_FILE="$BACKUP_DIR/dema-backup-$DATE.tar.gz"

# Backup important files and data
cd $WEBSITE_DIR
tar -czf $BACKUP_FILE \
    --exclude='node_modules' \
    --exclude='logs/*.log' \
    --exclude='.git' \
    .

echo "✅ Backup created: $BACKUP_FILE"

# Keep only last 7 backups
cd $BACKUP_DIR
ls -t dema-backup-*.tar.gz | tail -n +8 | xargs --no-run-if-empty rm

echo "🧹 Old backups cleaned (keeping last 7)"

# Backup database/data files separately (if you have them)
if [ -d "$WEBSITE_DIR/data" ]; then
    DATA_BACKUP="$BACKUP_DIR/data-backup-$DATE.tar.gz"
    tar -czf $DATA_BACKUP $WEBSITE_DIR/data/
    echo "📁 Data files backed up: $DATA_BACKUP"
fi

echo "🎉 Backup complete!"

# Optional: Upload to cloud storage (uncomment and configure)
# echo "☁️  Uploading to cloud storage..."
# rsync -av $BACKUP_FILE your-user@your-backup-server:/backups/
# echo "📤 Backup uploaded to cloud"

echo ""
echo "Backup Summary:"
echo "==============="
echo "Location: $BACKUP_FILE"
echo "Size: $(du -h $BACKUP_FILE | cut -f1)"
echo "Total backups: $(ls -1 $BACKUP_DIR/dema-backup-*.tar.gz | wc -l)"
