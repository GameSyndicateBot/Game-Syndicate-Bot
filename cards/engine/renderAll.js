const fs = require('fs');
const path = require('path');
const { renderCard } = require('./renderCard');

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

async function main() {
    const cardId = process.argv[2];

    if (!cardId) {
        console.log('Usage: node cards/engine/renderAll.js 000002');
        process.exit(1);
    }

    await renderAll(cardId);
}

if (require.main === module) {
    main().catch(error => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = {
    renderAll,
};

// ensure card saved
