const fs = require('fs');
const path = require('path');

function backupDatabase() {
    const source = path.join(__dirname, '..', 'database', 'database.sqlite');
    const backupDir = path.join(__dirname, '..', 'backups');

    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir);
    }

    const now = new Date();
    const fileName = `database-backup-${now.toISOString().replace(/[:.]/g, '-')}.sqlite`;
    const destination = path.join(backupDir, fileName);

    fs.copyFileSync(source, destination);

    return destination;
}

module.exports = {
    backupDatabase,
};