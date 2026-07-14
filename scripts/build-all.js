const fs = require('fs');
const path = require('path');
const { buildCard } = require('./build-card');

const ROOT = path.join(__dirname, '..');
const RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic'];

async function main() {
    const inputPath = process.argv[2];

    if (!inputPath) {
        console.log('Usage: node scripts/build-all.js input/000003.png');
        process.exit(1);
    }

    const cardName = path.parse(inputPath).name;
    const outputDir = path.join(ROOT, 'output', cardName);
    fs.mkdirSync(outputDir, { recursive: true });

    for (const rarity of RARITIES) {
        const outputPath = path.join(outputDir, `${cardName}_${rarity}.png`);
        await buildCard(inputPath, rarity, outputPath);
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
