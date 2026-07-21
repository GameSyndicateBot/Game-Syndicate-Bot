const { createCanvas } = require('canvas');
const GIFEncoder = require('gifencoder');

const { installIconRenderer } = require('../ui/icons');
const WIDTH = 900;
const HEIGHT = 520;

const rarityColors = {
    common: '#9CA3AF',
    rare: '#3B82F6',
    epic: '#A855F7',
    legendary: '#F59E0B',
    mythic: '#EF4444',
    exclusive: '#E5E7EB',
    holographic: '#22D3EE',
    treasure: '#FBBF24',
};

const rarityGlow = {
    common: 'rgba(156, 163, 175, 0.55)',
    rare: 'rgba(59, 130, 246, 0.65)',
    epic: 'rgba(168, 85, 247, 0.7)',
    legendary: 'rgba(245, 158, 11, 0.75)',
    mythic: 'rgba(239, 68, 68, 0.8)',
};

const rarityNames = {
    common: 'COMMON',
    rare: 'RARE',
    epic: 'EPIC',
    legendary: 'LEGENDARY',
    mythic: 'MYTHIC',
    exclusive: 'EXCLUSIVE',
    holographic: 'HOLOGRAPHIC',
    treasure: 'TREASURE',
};

const editionNames = {
    standard: 'STANDARD',
    foil: 'FOIL',
    galaxy: 'GALAXY',
    crystal: 'CRYSTAL',
    signature: 'SIGNATURE',
    glitch: 'GLITCH',
    gold: 'GOLD',
};

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.closePath();
}

function formatCopyNumber(number) {
    return `#${String(number).padStart(6, '0')}`;
}

function drawBackground(ctx, frame, rarity) {
    const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    bg.addColorStop(0, '#030008');
    bg.addColorStop(0.45, '#160827');
    bg.addColorStop(1, '#05000A');

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const color = rarityColors[rarity] ?? '#A855F7';

    ctx.globalAlpha = 0.08;
    ctx.fillStyle = color;
    ctx.font = 'bold 170px Arial';
    ctx.fillText('PACK', 430, 235);
    ctx.globalAlpha = 1;

    for (let i = 0; i < 45; i++) {
        const x = (i * 97 + frame * 11) % WIDTH;
        const y = (i * 53 + frame * 7) % HEIGHT;

        ctx.globalAlpha = 0.12 + ((i + frame) % 7) * 0.025;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 2 + ((i + frame) % 4), 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalAlpha = 1;
}

function drawOuterFrame(ctx, rarity) {
    const color = rarityColors[rarity] ?? '#A855F7';

    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    roundRect(ctx, 30, 30, WIDTH - 60, HEIGHT - 60, 34);
    ctx.stroke();

    ctx.shadowColor = color;
    ctx.shadowBlur = 28;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    roundRect(ctx, 48, 48, WIDTH - 96, HEIGHT - 96, 25);
    ctx.stroke();
    ctx.shadowBlur = 0;
}

function drawPackClosed(ctx, progress, rarity) {
    const color = rarityColors[rarity] ?? '#A855F7';
    const glow = rarityGlow[rarity] ?? 'rgba(168, 85, 247, 0.7)';

    const scale = 1 + Math.sin(progress * Math.PI * 4) * 0.025;
    const w = 260 * scale;
    const h = 355 * scale;
    const x = WIDTH / 2 - w / 2;
    const y = 105 - (progress * 10);

    ctx.shadowColor = color;
    ctx.shadowBlur = 40;
    roundRect(ctx, x, y, w, h, 28);
    ctx.fillStyle = 'rgba(10, 3, 20, 0.96)';
    ctx.fill();
    ctx.shadowBlur = 0;

    const packGrad = ctx.createLinearGradient(x, y, x + w, y + h);
    packGrad.addColorStop(0, '#12071F');
    packGrad.addColorStop(0.5, glow);
    packGrad.addColorStop(1, '#05000A');

    roundRect(ctx, x, y, w, h, 28);
    ctx.fillStyle = packGrad;
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 34px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('GAME', WIDTH / 2, y + 115);
    ctx.fillText('SYNDICATE', WIDTH / 2, y + 155);

    ctx.fillStyle = color;
    ctx.font = 'bold 88px Arial';
    ctx.fillText('GS', WIDTH / 2, y + 255);

    ctx.fillStyle = '#C4B5FD';
    ctx.font = 'bold 20px Arial';
    ctx.fillText('COLLECTIBLE CARD PACK', WIDTH / 2, y + 305);
    ctx.textAlign = 'left';
}

function drawOpeningBurst(ctx, progress, rarity) {
    const color = rarityColors[rarity] ?? '#A855F7';
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < 28; i++) {
        const angle = (Math.PI * 2 / 28) * i;
        const length = 70 + progress * 260;
        const x1 = cx + Math.cos(angle) * 35;
        const y1 = cy + Math.sin(angle) * 35;
        const x2 = cx + Math.cos(angle) * length;
        const y2 = cy + Math.sin(angle) * length;

        ctx.globalAlpha = 1 - progress * 0.35;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3 + (i % 3);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    }

    ctx.globalAlpha = 0.55;
    ctx.shadowColor = color;
    ctx.shadowBlur = 50;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, 40 + progress * 130, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
}

function drawCardReveal(ctx, progress, drop) {
    const card = drop.card;
    const rarity = drop.rarity;
    const color = rarityColors[rarity] ?? '#A855F7';

    const w = 330;
    const h = 410;
    const x = WIDTH / 2 - w / 2;
    const y = 70 - (1 - progress) * 40;

    ctx.save();
    ctx.globalAlpha = progress;
    ctx.shadowColor = color;
    ctx.shadowBlur = 38;

    roundRect(ctx, x, y, w, h, 30);
    ctx.fillStyle = 'rgba(10, 3, 20, 0.98)';
    ctx.fill();

    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, '#0B0313');
    grad.addColorStop(0.48, '#1C0B32');
    grad.addColorStop(1, '#05000A');

    roundRect(ctx, x, y, w, h, 30);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = color;
    ctx.font = 'bold 21px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(rarityNames[rarity] ?? rarity.toUpperCase(), WIDTH / 2, y + 45);

    ctx.fillStyle = '#A78BFA';
    ctx.font = 'bold 17px Arial';
    ctx.fillText(editionNames[drop.edition] ?? drop.edition.toUpperCase(), WIDTH / 2, y + 73);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 40px Arial';
    ctx.fillText(card.name.toUpperCase(), WIDTH / 2, y + 155);

    ctx.fillStyle = color;
    ctx.font = 'bold 28px Arial';
    ctx.fillText(card.code, WIDTH / 2, y + 202);

    ctx.fillStyle = '#C4B5FD';
    ctx.font = 'bold 20px Arial';
    ctx.fillText(card.series, WIDTH / 2, y + 240);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 18px Arial';
    ctx.fillText(card.type === 'role' ? 'РОЛЬ' : 'УЧАСТНИК', WIDTH / 2, y + 275);

    ctx.fillStyle = '#FBBF24';
    ctx.font = 'bold 24px Arial';
    ctx.fillText(formatCopyNumber(drop.copyNumber), WIDTH / 2, y + 335);

    ctx.fillStyle = '#A78BFA';
    ctx.font = 'bold 17px Arial';
    ctx.fillText('GAME SYNDICATE COLLECTION', WIDTH / 2, y + 380);

    ctx.restore();
    ctx.textAlign = 'left';
}

function drawTopText(ctx, frame, rarity) {
    const color = rarityColors[rarity] ?? '#A855F7';

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 34px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('▥ ОТКРЫТИЕ ПАКА', WIDTH / 2, 85);

    ctx.fillStyle = color;
    ctx.font = 'bold 22px Arial';
    ctx.fillText('GAME SYNDICATE • BASE 2026', WIDTH / 2, 118);

    ctx.textAlign = 'left';
}

async function createPackOpeningGif(drop) {
    const encoder = new GIFEncoder(WIDTH, HEIGHT);
    encoder.start();
    encoder.setRepeat(0);
    encoder.setDelay(75);
    encoder.setQuality(10);

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');
    installIconRenderer(ctx);

    const rarity = drop.rarity;

    const totalFrames = 32;

    for (let frame = 0; frame < totalFrames; frame++) {
        ctx.clearRect(0, 0, WIDTH, HEIGHT);

        drawBackground(ctx, frame, rarity);
        drawOuterFrame(ctx, rarity);
        drawTopText(ctx, frame, rarity);

        if (frame < 12) {
            drawPackClosed(ctx, frame / 12, rarity);
        } else if (frame < 20) {
            drawOpeningBurst(ctx, (frame - 12) / 8, rarity);
        } else {
            drawOpeningBurst(ctx, 1, rarity);
            drawCardReveal(ctx, (frame - 20) / 12, drop);
        }

        encoder.addFrame(ctx);
    }

    encoder.finish();

    return encoder.out.getData();
}

module.exports = {
    createPackOpeningGif,
};
