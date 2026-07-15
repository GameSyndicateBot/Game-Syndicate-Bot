const fs = require('fs');
const path = require('path');
const { databasePath } = require('../database/db');

function backupDatabase() {
    const source = databasePath;
    const backupDir = process.env.BACKUP_DIR
        ? path.resolve(process.env.BACKUP_DIR)
        : path.join(__dirname, '..', 'backups');

    fs.mkdirSync(backupDir, { recursive: true });

    const now = new Date();
    const fileName = `database-backup-${now.toISOString().replace(/[:.]/g, '-')}.sqlite`;
    const destination = path.join(backupDir, fileName);

    fs.copyFileSync(source, destination);

    return destination;
}

module.exports = {
    backupDatabase,
};
