const fs = require('fs');
const path = require('path');
const { db, databasePath } = require('../database/db');

const DEFAULT_RETENTION = 30;

function getBackupDir() {
    return process.env.BACKUP_DIR
        ? path.resolve(process.env.BACKUP_DIR)
        : path.join(__dirname, '..', 'backups');
}

function getRetentionCount() {
    const value = Number(process.env.BACKUP_RETENTION);
    return Number.isInteger(value) && value > 0 ? value : DEFAULT_RETENTION;
}

function cleanupOldBackups(backupDir, keep = getRetentionCount()) {
    const files = fs.readdirSync(backupDir)
        .filter(name => /^database-backup-.*\.sqlite$/.test(name))
        .map(name => {
            const fullPath = path.join(backupDir, name);
            return {
                name,
                fullPath,
                mtimeMs: fs.statSync(fullPath).mtimeMs,
            };
        })
        .sort((a, b) => b.mtimeMs - a.mtimeMs);

    for (const file of files.slice(keep)) {
        fs.unlinkSync(file.fullPath);
    }
}

async function backupDatabase({ reason = 'manual' } = {}) {
    const backupDir = getBackupDir();
    fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const destination = path.join(backupDir, `database-backup-${timestamp}.sqlite`);

    // better-sqlite3 backup() creates a consistent snapshot even with WAL enabled.
    await db.backup(destination);

    const stats = fs.statSync(destination);
    if (stats.size === 0) {
        throw new Error(`Created backup is empty: ${destination}`);
    }

    cleanupOldBackups(backupDir);

    console.log(
        `✅ SQLite backup created (${reason}): ${destination} ` +
        `(${Math.ceil(stats.size / 1024)} KB), source: ${databasePath}`
    );

    return destination;
}

module.exports = {
    backupDatabase,
    cleanupOldBackups,
    getBackupDir,
};
