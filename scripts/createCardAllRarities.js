'use strict';

const path = require('path');
const { createCard } = require('./createCard');

const RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic'];

async function main() {
    const configArg = process.argv[2] ?? 'cards-v2/data/000002.json';
    const configPath = path.resolve(configArg);

    for (const rarity of RARITIES) {
        await createCard(configPath, rarity);
    }
}

main().catch(error => {
    console.error('\nОшибка пакетной генерации:');
    console.error(error.stack || error.message);
    process.exit(1);
});
