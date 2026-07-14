'use strict';

const path = require('path');
const { buildReferenceCard } = require('../images/cardBuilder/builder');

async function main() {
    const inputPath = process.argv[2];
    const rarity = process.argv[3];
    const outputPath = process.argv[4];

    if (!inputPath || !rarity) {
        console.log('Usage: node scripts/build-reference-card.js "input/11 дон.png" legendary');
        process.exit(1);
    }

    const idMatch = path.basename(inputPath).match(/\d{1,6}/);
    const id = idMatch ? idMatch[0].padStart(6, '0') : path.parse(inputPath).name;
    const finalOutput = outputPath || path.join('output-reference', id, `${id}_${rarity}.png`);

    await buildReferenceCard(inputPath, rarity, finalOutput);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
