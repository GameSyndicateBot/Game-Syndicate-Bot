const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ignored = new Set(['node_modules', '.git', 'assets', 'input', 'templates']);
const patterns = [
    ['clientReady listeners', /(?:client\.(?:on|once)|name\s*:)\s*\(?['"]clientReady['"]/g],
    ['setInterval', /\bsetInterval\s*\(/g],
    ['cron schedules', /\bcron\.
const results = new Map(patterns.map(([name]) => [name, []]));

function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ignored.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile() && full.endsWith('.js')) inspect(full);
    }
}

function inspect(file) {
    const text = fs.readFileSync(file, 'utf8');
    for (const [name, regex] of patterns) {
        regex.lastIndex = 0;
        let match;
        while ((match = regex.exec(text))) {
            const line = text.slice(0, match.index).split('\n').length;
            results.get(name).push(`${path.relative(ROOT, file)}:${line}`);
        }
    }
}

walk(ROOT);
console.log('Game Syndicate Bot — startup audit');
for (const [name, entries] of results) {
    console.log(`\n${name}: ${entries.length}`);
    for (const entry of entries) console.log(`  - ${entry}`);
}
