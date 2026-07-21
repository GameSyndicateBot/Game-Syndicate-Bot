const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const WIDTH = 1024;
const HEIGHT = 1536;

const RARITIES = require('../data/rarities.json');
const CARDS = require('../data/cards.json');

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.closePath();
}

function drawText(ctx, text, x, y, options = {}) {
    ctx.save();
    ctx.fillStyle = options.color ?? '#FFFFFF';
    ctx.font = `${options.weight ?? 'bold'} ${options.size ?? 32}px ${options.font ?? 'Arial'}`;
    ctx.textAlign = options.align ?? 'left';
    ctx.textBaseline = options.baseline ?? 'alphabetic';

    if (options.shadow) {
        ctx.shadowColor = options.shadow;
        ctx.shadowBlur = options.shadowBlur ?? 12;
    }

    ctx.fillText(text, x, y);
    ctx.restore();
}

function drawPanel(ctx, x, y, w, h, color, alpha = 0.78) {
    ctx.save();
    roundedRect(ctx, x, y, w, h, 16);
    ctx.fillStyle = `rgba(3, 3, 8, ${alpha})`;
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
}

function drawStars(ctx, x, y, count) {
    ctx.font = 'bold 38px Arial';
    for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i < count ? '#F5B800' : '#333333';
        ctx.fillText('★', x + i * 42, y);
    }
}

function drawFrame(ctx, rarity) {
    const c = rarity.frameColor;

    ctx.save();
    ctx.strokeStyle = c;
    ctx.lineWidth = 8;
    ctx.shadowColor = c;
    ctx.shadowBlur = 18;

    roundedRect(ctx, 28, 28, WIDTH - 56, HEIGHT - 56, 28);
    ctx.stroke();

    ctx.lineWidth = 2;
    roundedRect(ctx, 48, 48, WIDTH - 96, HEIGHT - 96, 18);
    ctx.stroke();
    ctx.restore();

    drawPanel(ctx, 300, 18, 424, 62, c, 0.84);
    drawPanel(ctx, 55, 845, 914, 150, c, 0.82);
    drawPanel(ctx, 55, 1010, 914, 360, c, 0.62);
    drawPanel(ctx, 55, 1385, 270, 100, c, 0.78);
    drawPanel(ctx, 370, 1385, 284, 100, c, 0.78);
    drawPanel(ctx, 700, 1385, 269, 100, c, 0.78);
}

async function renderCard(cardId, rarityName) {
    const card = CARDS.find(item => item.id === cardId);
    if (!card) throw new Error(`Card not found: ${cardId}`);

    const rarity = RARITIES[rarityName];
    if (!rarity) throw new Error(`Rarity not found: ${rarityName}`);

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#050308';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const artPath = path.join(__dirname, '..', 'assets', 'arts', card.art);
    if (fs.existsSync(artPath)) {
        const art = await loadImage(artPath);
        ctx.drawImage(art, 55, 120, 914, 720);
    } else {
        ctx.fillStyle = '#12091F';
        ctx.fillRect(55, 120, 914, 720);
        drawText(ctx, `ADD ART: ${card.art}`, WIDTH / 2, 490, {
            align: 'center',
            color: '#A855F7',
            size: 32,
        });
    }

    drawFrame(ctx, rarity);

    drawText(ctx, rarity.label, WIDTH / 2, 60, { align: 'center', color: rarity.mainColor, size: 34, shadow: rarity.mainColor });
    drawText(ctx, rarity.label, 138, 142, { color: rarity.mainColor, size: 36, shadow: rarity.mainColor });
    drawText(ctx, 'GAME SYNDICATE', WIDTH / 2, 120, { align: 'center', color: rarity.mainColor, size: 28, shadow: rarity.mainColor });
    drawText(ctx, 'GS', WIDTH / 2, 162, { align: 'center', color: rarity.mainColor, size: 38, shadow: rarity.mainColor });
    drawText(ctx, `№${card.id}`, 910, 140, { align: 'right', color: rarity.mainColor, size: 44, shadow: rarity.mainColor });

    drawStars(ctx, 80, 188, rarity.stars);

    drawText(ctx, card.name, 210, 925, { color: rarity.nameColor, size: 58, shadow: rarity.nameColor });
    drawText(ctx, card.subtitle, 215, 965, { color: '#A855F7', size: 26, shadow: '#A855F7' });
    drawText(ctx, card.typeIcon === 'shield' ? '🛡️' : '♛', 85, 930, { color: rarity.mainColor, size: 62 });
    drawText(ctx, '////', 760, 930, { color: rarity.mainColor, size: 68, shadow: rarity.mainColor });

    let y = 1060;
    for (const line of card.description) {
        drawText(ctx, line, 150, y, { color: '#B8B8B8', size: 25, weight: 'normal' });
        y += 42;
    }

    drawText(ctx, '♟', 88, 1070, { color: '#A855F7', size: 34, shadow: '#A855F7' });
    drawText(ctx, '👥', 82, 1148, { color: '#A855F7', size: 30, shadow: '#A855F7' });
    drawText(ctx, '🎮', 82, 1260, { color: '#A855F7', size: 30, shadow: '#A855F7' });

    ctx.strokeStyle = '#A855F7';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(515, 1040);
    ctx.lineTo(515, 1320);
    ctx.stroke();

    drawText(ctx, '🤝', 560, 1080, { color: '#A855F7', size: 42, shadow: '#A855F7' });
    drawText(ctx, 'СПЕЦИАЛИЗАЦИЯ', 645, 1080, { color: '#A855F7', size: 27, shadow: '#A855F7' });
    drawText(ctx, card.specialization, 645, 1122, { color: '#D0D0D0', size: 30, weight: 'normal' });

    drawText(ctx, '👥', 560, 1210, { color: '#A855F7', size: 42, shadow: '#A855F7' });
    drawText(ctx, 'ОСОБЕННОСТЬ', 645, 1210, { color: '#A855F7', size: 27, shadow: '#A855F7' });
    drawText(ctx, card.ability, 645, 1252, { color: '#D0D0D0', size: 36 });
    drawText(ctx, card.abilityDescription, 645, 1295, { color: '#B8B8B8', size: 22, weight: 'normal' });

    drawText(ctx, card.badge, 185, 1452, { align: 'center', color: rarity.mainColor, size: 28, shadow: rarity.mainColor });
    drawText(ctx, 'GS', WIDTH / 2, 1450, { align: 'center', color: rarity.bottomGsColor, size: 56, shadow: rarity.bottomGsColor });
    drawText(ctx, 'ЭКЗЕМПЛЯР', 835, 1433, { align: 'center', color: rarity.serialColor, size: 24, shadow: rarity.serialColor });
    drawText(ctx, `#${card.id}`, 835, 1475, { align: 'center', color: rarity.serialColor, size: 40, shadow: rarity.serialColor });

    return canvas.toBuffer('image/png');
}

async function main() {
    const cardId = process.argv[2];
    const rarity = process.argv[3];

    if (!cardId || !rarity) {
        console.log('Usage: node cards/engine/renderCard.js 000001 legendary');
        process.exit(1);
    }

    const buffer = await renderCard(cardId, rarity);
    const outDir = path.join(__dirname, '..', 'output');
    ensureDir(outDir);

    const outPath = path.join(outDir, `${cardId}_${rarity}.png`);
    fs.writeFileSync(outPath, buffer);
    console.log(`Saved: ${outPath}`);
}

if (require.main === module) {
    main().catch(error => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = { renderCard, WIDTH, HEIGHT };
