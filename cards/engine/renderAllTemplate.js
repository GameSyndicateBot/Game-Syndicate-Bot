const fs = require('fs');
const path = require('path');
const { renderCard } = require('./renderTemplateCard');

const RARITIES = ['common', 'rare', 'epic', 'legendary', 'mythic'];

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function renderAll(cardId) {
    const outDir = path.join(__dirname, '..', 'output', cardId);
    ensureDir(outDir);

    for (const rarity of RARITIES) {
        const buffer = await renderCard(cardId, rarity);
        const outPath = path.join(outDir, `${cardId}_${rarity}.png`);
        fs.writeFileSync(outPath, buffer);
        console.log(`Saved: ${outPath}`);
    }
}

if (require.main === module) {
    const cardId = process.argv[2];

    if (!cardId) {
        console.log('Usage: node cards/engine/renderAllTemplate.js 000002');
        process.exit(1);
    }

    renderAll(cardId).catch(error => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = {
    renderAll,
};
