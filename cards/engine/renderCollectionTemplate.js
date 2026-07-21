const fs = require('fs');
const path = require('path');
const { renderCard } = require('./renderTemplateCard');

const CARDS = require('../data/cards.json');
const RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic'];

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function renderCollection() {
    const rootOut = path.join(__dirname, '..', 'output');
    ensureDir(rootOut);

    for (const card of CARDS) {
        const cardOut = path.join(rootOut, card.id);
        ensureDir(cardOut);

        for (const rarity of RARITIES) {
            const buffer = await renderCard(card.id, rarity);
            const outPath = path.join(cardOut, `${card.id}_${rarity}.png`);
            fs.writeFileSync(outPath, buffer);
            console.log(`Saved: ${outPath}`);
        }
    }
}

if (require.main === module) {
    renderCollection().catch(error => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = {
    renderCollection,
};
