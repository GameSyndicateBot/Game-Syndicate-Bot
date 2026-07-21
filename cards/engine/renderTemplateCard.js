const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const CARDS = require('../data/cards.json');
const RARITIES = require('../data/rarities.json');
const LAYOUT = require('../data/layout.json');

const WIDTH = LAYOUT.size.width;
const HEIGHT = LAYOUT.size.height;

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function drawImageIfExists(ctx, imagePath, x, y, w, h) {
    if (!fs.existsSync(imagePath)) return false;
    const img = await loadImage(imagePath);
    ctx.drawImage(img, x, y, w, h);
    return true;
}

function drawText(ctx, text, cfg, color, options = {}) {
    ctx.save();
    ctx.fillStyle = color ?? cfg.color ?? '#FFFFFF';
    ctx.font = `${options.weight ?? 'bold'} ${cfg.size}px ${options.font ?? 'Arial'}`;
    ctx.textAlign = cfg.align ?? 'left';
    ctx.textBaseline = 'alphabetic';

    if (options.shadow !== false) {
        ctx.shadowColor = color ?? cfg.color ?? '#FFFFFF';
        ctx.shadowBlur = options.shadowBlur ?? 8;
    }

    ctx.fillText(String(text ?? ''), cfg.x, cfg.y);
    ctx.restore();
}

function drawStars(ctx, cfg, activeCount) {
    ctx.save();
    ctx.font = `bold ${cfg.size}px Arial`;

    for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i < activeCount ? '#F5B800' : '#333333';
        ctx.shadowColor = i < activeCount ? '#F5B800' : 'transparent';
        ctx.shadowBlur = i < activeCount ? 8 : 0;
        ctx.fillText('★', cfg.x + i * 42, cfg.y);
    }

    ctx.restore();
}

function drawMultiline(ctx, lines, cfg) {
    let y = cfg.y;

    for (const line of lines ?? []) {
        drawText(ctx, line, { ...cfg, y }, cfg.color, {
            weight: 'normal',
            shadow: false,
        });
        y += cfg.lineHeight ?? cfg.size + 10;
    }
}

async function renderCard(cardId, rarityName) {
    const card = CARDS.find(item => item.id === cardId);
    if (!card) throw new Error(`Card not found: ${cardId}`);

    const rarity = RARITIES[rarityName];
    if (!rarity) throw new Error(`Rarity not found: ${rarityName}`);

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, WIDTH, HEIGHT);

    const templateDir = path.join(__dirname, '..', 'assets', 'templates', rarity.template);
    const backgroundPath = path.join(templateDir, LAYOUT.template.background);
    const overlayPath = path.join(templateDir, LAYOUT.template.overlay);

    const hasBackground = await drawImageIfExists(ctx, backgroundPath, 0, 0, WIDTH, HEIGHT);

    if (!hasBackground) {
        ctx.fillStyle = '#050308';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    const artPath = path.join(__dirname, '..', 'assets', 'arts', card.art);
    const art = LAYOUT.art;

    const hasArt = await drawImageIfExists(ctx, artPath, art.x, art.y, art.width, art.height);

    if (!hasArt) {
        ctx.fillStyle = '#12091F';
        ctx.fillRect(art.x, art.y, art.width, art.height);
        drawText(ctx, `ADD ART: ${card.art}`, { x: WIDTH / 2, y: 490, size: 32, align: 'center' }, '#A855F7');
    }

    await drawImageIfExists(ctx, overlayPath, 0, 0, WIDTH, HEIGHT);

    const t = LAYOUT.text;

    drawText(ctx, rarity.label, t.rarityTop, rarity.mainColor);
    drawText(ctx, 'GAME SYNDICATE', t.gameSyndicate, rarity.mainColor);
    drawText(ctx, `№${card.id}`, t.cardNumber, rarity.mainColor);
    drawStars(ctx, t.stars, rarity.stars);

    drawText(ctx, card.name, t.name, rarity.nameColor);
    drawText(ctx, card.subtitle, t.subtitle, t.subtitle.color);

    drawMultiline(ctx, card.description, t.description);

    drawText(ctx, 'СПЕЦИАЛИЗАЦИЯ', t.specTitle, t.specTitle.color);
    drawText(ctx, card.specialization, t.specialization, t.specialization.color, { weight: 'normal', shadow: false });

    drawText(ctx, 'ОСОБЕННОСТЬ', t.abilityTitle, t.abilityTitle.color);
    drawText(ctx, card.ability, t.ability, t.ability.color);
    drawText(ctx, card.abilityDescription, t.abilityDescription, t.abilityDescription.color, { weight: 'normal', shadow: false });

    drawText(ctx, card.badge, t.badge, rarity.mainColor);
    drawText(ctx, 'GS', t.bottomGs, rarity.mainColor);
    drawText(ctx, 'ЭКЗЕМПЛЯР', t.instanceLabel, rarity.serialColor);
    drawText(ctx, `#${card.id}`, t.instanceNumber, rarity.serialColor);

    return canvas.toBuffer('image/png');
}

async function main() {
    const cardId = process.argv[2];
    const rarity = process.argv[3];

    if (!cardId || !rarity) {
        console.log('Usage: node cards/engine/renderTemplateCard.js 000002 legendary');
        process.exit(1);
    }

    const buffer = await renderCard(cardId, rarity);
    const outDir = path.join(__dirname, '..', 'output', cardId);
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

module.exports = {
    renderCard,
};

// ensure card saved
