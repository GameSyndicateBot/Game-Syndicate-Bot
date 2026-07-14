'use strict';

const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const CARD_SIZE = Object.freeze({ width: 1054, height: 1492 });
const RARITIES = Object.freeze([
    'common',
    'rare',
    'epic',
    'legendary',
    'mythic',
]);

function getTemplatePath(rarity) {
    if (!RARITIES.includes(rarity)) {
        throw new Error(`Unknown rarity: ${rarity}`);
    }

    return path.join(ROOT, 'templates', `000001_${rarity}.png`);
}

module.exports = {
    ROOT,
    CARD_SIZE,
    RARITIES,
    getTemplatePath,
};
