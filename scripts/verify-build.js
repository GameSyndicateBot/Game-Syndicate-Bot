const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const buildInfo = require(path.join(ROOT, 'build-info.json'));
const packageJson = require(path.join(ROOT, 'package.json'));

const errors = [];
if (!buildInfo.name || !buildInfo.version || !buildInfo.buildId || !buildInfo.startup) {
    errors.push('build-info.json содержит не все обязательные поля.');
}
if (packageJson.version !== buildInfo.version) {
    errors.push(`package.json version=${packageJson.version}, build-info version=${buildInfo.version}`);
}

const required = [
    'index.js',
    'scripts/container-entrypoint.sh',
    'scripts/restoreDatabaseFromDiscord.js',
    'scripts/storageDiagnostics.js',
    'services/automaticBackups.js',
];
for (const rel of required) {
    if (!fs.existsSync(path.join(ROOT, rel))) errors.push(`Отсутствует ${rel}`);
}

const fingerprintSources = [
    'build-info.json',
    'index.js',
    'scripts/container-entrypoint.sh',
    'database/db.js',
    'services/automaticBackups.js',
];
const hash = crypto.createHash('sha256');
for (const rel of fingerprintSources) {
    hash.update(rel);
    hash.update(fs.readFileSync(path.join(ROOT, rel)));
}
const fingerprint = hash.digest('hex').slice(0, 16);

if (errors.length) {
    for (const error of errors) console.error(`❌ Build verification: ${error}`);
    process.exit(1);
}

console.log(`🏷️ Build: ${buildInfo.name}`);
console.log(`🆔 Build ID: ${buildInfo.buildId}`);
console.log(`🚪 Startup: ${buildInfo.startup}`);
console.log(`🔐 Build fingerprint: ${fingerprint}`);
