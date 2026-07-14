'use strict';

const path = require('path');
const cards = require('../cards-v2/cards.json');
const { renderCard } = require('../cards-v2/src/renderCard');

const RARITIES = [
    'common',
    'rare',
    'epic',
    'legendary',
    'mythic',
];

async function main() {
    for (const card of cards) {
        for (const rarity of RARITIES) {
            const outputPath = path.join(
                __dirname,
                '..',
                'cards-v2',
                'output',
                card.id,
                `${card.id}_${rarity}.png`,
            );

            try {
                await renderCard(
                    card.id,
                    rarity,
                    outputPath,
                );
            } catch (error) {
                console.error(
                    `[${card.id}/${rarity}] ${error.message}`,
                );
            }
        }
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
