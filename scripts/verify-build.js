const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const buildInfoPath = path.join(ROOT, 'build-info.json');
const packagePath = path.join(ROOT, 'package.json');

function readJson(file, label) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (error) {
        console.error(`❌ Build verification: не удалось прочитать ${label}: ${error.message}`);
        process.exit(1);
    }
}

const packageJson = readJson(packagePath, 'package.json');
const originalBuildInfo = fs.existsSync(buildInfoPath)
    ? readJson(buildInfoPath, 'build-info.json')
    : {};

// package.json является источником истины для версии и точки запуска.
// Недостающие или устаревшие поля build-info.json исправляются автоматически,
// чтобы релиз не падал только из-за несинхронизированной метаинформации.
const startup = packageJson.scripts?.start || `node ${packageJson.main || 'index.js'}`;
const buildInfo = {
    ...originalBuildInfo,
    name: originalBuildInfo.name || packageJson.description || packageJson.name || 'Game Syndicate Bot',
    version: packageJson.version,
    buildId: originalBuildInfo.buildId || `v${packageJson.version}`,
    startup: originalBuildInfo.startup || startup,
};

const normalized = `${JSON.stringify(buildInfo, null, 2)}\n`;
const current = fs.existsSync(buildInfoPath) ? fs.readFileSync(buildInfoPath, 'utf8') : '';
if (current !== normalized) {
    fs.writeFileSync(buildInfoPath, normalized, 'utf8');
    console.log('🛠️ build-info.json автоматически синхронизирован с package.json');
}

const errors = [];
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
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) continue;
    hash.update(rel);
    hash.update(fs.readFileSync(full));
}
const fingerprint = hash.digest('hex').slice(0, 16);

if (errors.length) {
    for (const error of errors) console.error(`❌ Build verification: ${error}`);
    process.exit(1);
}

console.log(`🏷️ Build: ${buildInfo.name}`);
console.log(`📦 Version: ${buildInfo.version}`);
console.log(`🆔 Build ID: ${buildInfo.buildId}`);
console.log(`🚪 Startup: ${buildInfo.startup}`);
console.log(`🔐 Build fingerprint: ${fingerprint}`);
