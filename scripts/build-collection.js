const fs = require('fs');
const path = require('path');
const { buildCard } = require('./build-card');

const ROOT = path.join(__dirname, '..');
const INPUT_DIR = path.join(ROOT, 'input');
const OUTPUT_DIR = path.join(ROOT, 'output');
const RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic'];
const SUPPORTED = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function extractId(filename) {
    const match = filename.match(/(?:^|\D)(\d{1,6})(?:\D|$)/);
    return match ? match[1].padStart(6, '0') : null;
}

function getSourceFiles() {
    return fs.readdirSync(INPUT_DIR, { withFileTypes: true })
        .filter(entry => entry.isFile())
        .map(entry => entry.name)
        .filter(name => SUPPORTED.has(path.extname(name).toLowerCase()))
        .map(name => ({
            name,
            id: extractId(path.parse(name).name),
            fullPath: path.join(INPUT_DIR, name),
        }))
        .filter(item => item.id)
        .sort((a, b) => a.id.localeCompare(b.id));
}

async function main() {
    if (!fs.existsSync(INPUT_DIR)) fs.mkdirSync(INPUT_DIR, { recursive: true });
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

    const files = getSourceFiles();

    if (!files.length) {
        console.log('В папке input не найдено карточек с номером в имени файла.');
        console.log('Пример: 000002 Сварщик.png');
        process.exit(1);
    }

    console.log(`Найдено карточек: ${files.length}`);

    for (const file of files) {
        const cardOut = path.join(OUTPUT_DIR, file.id);
        fs.mkdirSync(cardOut, { recursive: true });

        console.log(`\n[${file.id}] ${file.name}`);

        for (const rarity of RARITIES) {
            const outputPath = path.join(cardOut, `${file.id}_${rarity}.png`);
            await buildCard(file.fullPath, rarity, outputPath);
        }
    }

    console.log(`\nГотово: ${files.length * RARITIES.length} файлов.`);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
