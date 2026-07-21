'use strict';

const path = require('path');
const { renderCard } = require('../cards-v2/src/renderCard');

async function main() {
    const id = String(process.argv[2] ?? '2').padStart(6, '0');
    const rarity = String(process.argv[3] ?? 'common').toLowerCase();
    const outputPath = path.join(
        __dirname,
        '..',
        'cards-v2',
        'output',
        id,
        `${id}_${rarity}.png`);

    await renderCard(id, rarity, outputPath);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
