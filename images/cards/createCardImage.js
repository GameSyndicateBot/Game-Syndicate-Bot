const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

const { installIconRenderer } = require('../ui/icons');
function resolveImagePath(imagePath) {
    if (!imagePath) return null;

    const normalized = imagePath.replaceAll('\\', '/');

    const candidates = [
        path.join(process.cwd(), normalized),
        path.join(process.cwd(), 'assets', normalized),
        path.join(process.cwd(), 'images', normalized),
        path.join(process.cwd(), 'data', normalized),
    ];

    return candidates.find(candidate => fs.existsSync(candidate)) ?? null;
}

function createMissingCardImage(card) {
    const canvas = createCanvas(1000, 1400);
    const ctx = canvas.getContext('2d');
    installIconRenderer(ctx);

    const bg = ctx.createLinearGradient(0, 0, 1000, 1400);
    bg.addColorStop(0, '#030008');
    bg.addColorStop(0.5, '#160827');
    bg.addColorStop(1, '#05000A');

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1000, 1400);

    ctx.strokeStyle = '#A855F7';
    ctx.lineWidth = 8;
    ctx.roundRect(40, 40, 920, 1320, 36);
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 58px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('КАРТОЧКА НЕ НАЙДЕНА', 500, 600);

    ctx.fillStyle = '#C4B5FD';
    ctx.font = 'bold 36px Arial';
    ctx.fillText(`${card.code ?? '???'} • ${card.name ?? 'UNKNOWN'}`, 500, 680);

    ctx.fillStyle = '#A78BFA';
    ctx.font = '28px Arial';
    ctx.fillText('Проверь путь image в data/cards.json', 500, 760);

    return canvas.toBuffer('image/png');
}

async function createCardImage(card, owned = null, options = {}) {
    const rarity = owned?.rarity ?? options.rarity ?? card.base_rarity;
    const selectedImage = card.images?.[rarity] ?? owned?.image ?? card.image;
    const imagePath = resolveImagePath(selectedImage);

    if (!imagePath) {
        return createMissingCardImage(card);
    }

    return fs.readFileSync(imagePath);
}

module.exports = {
    createCardImage,
};

// ensure card saved
