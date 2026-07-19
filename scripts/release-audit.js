const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ignoredDirs = new Set(['node_modules', '.git', 'backups']);
const textExtensions = new Set(['.js', '.json', '.md', '.txt', '.example', '.yml', '.yaml']);
const findings = [];

function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ignoredDirs.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else inspect(full);
    }
}

function inspect(file) {
    const rel = path.relative(ROOT, file).replaceAll('\\\\', '/');
    const ext = path.extname(file).toLowerCase();

    if (/\.(sqlite|db|bak|log|tmp)$/i.test(file)) {
        findings.push({ level: 'WARN', message: `release содержит служебный файл: ${rel}` });
        return;
    }

    if (!textExtensions.has(ext) && !file.endsWith('.env.example')) return;
    const text = fs.readFileSync(file, 'utf8');

    const discordToken = /(?:mfa\.[A-Za-z0-9_-]{20,}|[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{20,})/;
    const telegramToken = /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/;
    if (discordToken.test(text) || telegramToken.test(text)) {
        findings.push({ level: 'ERROR', message: `возможный реальный токен в ${rel}` });
    }

    const ids = [...text.matchAll(/(?<![A-Za-z0-9_])\d{17,20}(?![A-Za-z0-9_])/g)];
    if (ids.length && !rel.startsWith('UPDATE-') && !rel.startsWith('PATCH_NOTES')) {
        findings.push({ level: 'INFO', message: `${rel}: найдено Discord ID — ${ids.length}` });
    }
}

walk(ROOT);

const errors = findings.filter(item => item.level === 'ERROR');
for (const item of findings) console.log(`[${item.level}] ${item.message}`);
console.log(`\nAudit: ${errors.length ? 'FAILED' : 'PASSED'}; замечаний: ${findings.length}`);
process.exitCode = errors.length ? 1 : 0;
