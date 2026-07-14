const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const colors = require('../ui/colors');
const { installIconRenderer } = require('../ui/icons');
const {
    drawBackground,
    drawFrame,
    drawHeader,
    drawPanel,
    drawStatBox,
    drawTag,
} = require('../ui/draw');

const WIDTH = 1600;
const HEIGHT = 900;

const rarityColors = {
    common: colors.common,
    rare: colors.rare,
    epic: colors.epic,
    legendary: colors.legendary,
    mythic: colors.mythic,
};

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

function formatCopyNumber(number) {
    return `#${String(number ?? 1).padStart(6, '0')}`;
}

function truncate(text, max = 24) {
    const value = String(text ?? '');
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function drawEnergy(ctx, accent, intensity = 1, cx = 800, cy = 455) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < 64; i++) {
        const angle = (Math.PI * 2 / 64) * i;
        const r1 = 155 + (i % 6) * 8;
        const r2 = 355 + (i % 9) * 22 * intensity;

        ctx.globalAlpha = 0.08 + (i % 6) * 0.032;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2 + (i % 3);

        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
        ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
        ctx.stroke();
    }

    ctx.restore();
    ctx.globalAlpha = 1;
}

function drawParticles(ctx, accent, phase = 1, cx = 800, cy = 455) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < 130; i++) {
        const angle = (Math.PI * 2 / 130) * i;
        const radius = 60 + phase * (160 + (i % 14) * 24);
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius * 0.68;

        ctx.globalAlpha = Math.max(0.16, 0.9 - phase * 0.34);
        ctx.fillStyle = i % 6 === 0 ? colors.white : accent;

        ctx.beginPath();
        ctx.arc(x, y, 3 + (i % 5), 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
    ctx.globalAlpha = 1;
}

function drawCracks(ctx, accent, strength = 1) {
    const cx = 800;
    const cy = 455;

    ctx.strokeStyle = colors.white;
    ctx.globalAlpha = 0.55 + strength * 0.32;
    ctx.lineWidth = 4;

    for (let i = 0; i < 24; i++) {
        const angle = (Math.PI * 2 / 24) * i;
        const len = 95 + strength * (120 + (i % 5) * 18);

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
        ctx.stroke();
    }

    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 3;

    for (let i = 0; i < 18; i++) {
        const angle = (Math.PI * 2 / 18) * i + 0.25;
        const len = 150 + strength * (135 + (i % 6) * 16);

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
        ctx.stroke();
    }

    ctx.globalAlpha = 1;
}

async function drawCard(ctx, item, x, y, w, h, accent, alpha = 1) {
    const card = item.card;
    const imagePath = resolveImagePath(card.image);

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = accent;
    ctx.shadowBlur = 42;

    drawPanel(ctx, x, y, w, h, {
        fill: 'rgba(0, 0, 0, 0.62)',
        stroke: accent,
        radius: 30,
        lineWidth: 5,
    });

    ctx.shadowBlur = 0;

    if (imagePath) {
        try {
            const img = await loadImage(imagePath);
            const scale = Math.min((w - 24) / img.width, (h - 24) / img.height);
            const iw = img.width * scale;
            const ih = img.height * scale;
            const ix = x + (w - iw) / 2;
            const iy = y + (h - ih) / 2;

            ctx.save();
            ctx.beginPath();
            ctx.roundRect(x + 12, y + 12, w - 24, h - 24, 24);
            ctx.clip();
            ctx.drawImage(img, ix, iy, iw, ih);
            ctx.restore();
        } catch (_) {
            drawFallback(ctx, card, x, y, w, h, accent);
        }
    } else {
        drawFallback(ctx, card, x, y, w, h, accent);
    }

    ctx.restore();
}

function drawFallback(ctx, card, x, y, w, h, accent) {
    ctx.fillStyle = '#160827';
    ctx.beginPath();
    ctx.roundRect(x + 12, y + 12, w - 24, h - 24, 24);
    ctx.fill();

    ctx.fillStyle = accent;
    ctx.font = 'bold 130px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('GS', x + w / 2, y + h / 2 + 20);

    ctx.fillStyle = colors.white;
    ctx.font = 'bold 32px Arial';
    ctx.fillText(card.code ?? '???', x + w / 2, y + h / 2 + 78);
    ctx.textAlign = 'left';
}

async function createDismantlePanel(user, item, phase = 'charge', result = null) {
    const accent = rarityColors[item.rarity] ?? colors.violet;
    const card = item.card;

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');
    installIconRenderer(ctx);

    drawBackground(ctx, WIDTH, HEIGHT, 'DUST');
    drawFrame(ctx, WIDTH, HEIGHT);

    const titles = {
        charge: '✦ КАРТОЧКА ЗАРЯЖАЕТСЯ',
        crack: '⚡ СТРУКТУРА ЛОМАЕТСЯ',
        burst: '✦ КАРТОЧКА РАССЫПАЕТСЯ',
        result: '✦ РАСПЫЛЕНИЕ УСПЕШНО',
    };

    drawHeader(ctx, titles[phase] ?? '♻ РАСПЫЛЕНИЕ', `GAME SYNDICATE • ${(user.gsDisplayName || user.username).toUpperCase()}`, WIDTH);

    if (phase === 'charge') {
        drawEnergy(ctx, accent, 0.85);
        await drawCard(ctx, item, 545, 155, 510, 710, accent, 1);

        drawTag(ctx, 90, 805, `${card.code} • ${truncate(card.name, 24)}`, accent);
        drawTag(ctx, 430, 805, `${String(item.rarity).toUpperCase()} • +${item.dust} GS DUST`, colors.gold);
    }

    if (phase === 'crack') {
        drawEnergy(ctx, accent, 1.15);
        await drawCard(ctx, item, 545, 155, 510, 710, accent, 0.9);
        drawCracks(ctx, accent, 0.85);

        drawTag(ctx, 90, 805, 'СТРУКТУРА КАРТОЧКИ НЕСТАБИЛЬНА', accent);
        drawTag(ctx, 555, 805, `ПЫЛЬ: +${item.dust}`, colors.gold);
    }

    if (phase === 'burst') {
        drawEnergy(ctx, accent, 1.5);
        drawParticles(ctx, accent, 1.15);
        await drawCard(ctx, item, 655, 245, 290, 405, accent, 0.12);
        drawCracks(ctx, accent, 1.35);

        ctx.fillStyle = colors.gold;
        ctx.font = 'bold 96px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`+${item.dust}`, WIDTH / 2, 445);

        ctx.fillStyle = colors.white;
        ctx.font = 'bold 42px Arial';
        ctx.fillText('GS DUST', WIDTH / 2, 510);
        ctx.textAlign = 'left';

        drawTag(ctx, 90, 805, 'КАРТОЧКА ПРЕВРАЩАЕТСЯ В ЭНЕРГИЮ', colors.gold);
    }

    if (phase === 'result') {
        drawParticles(ctx, accent, 0.95);

        drawPanel(ctx, 300, 235, 1000, 410, {
            fill: 'rgba(0,0,0,0.56)',
            stroke: colors.gold,
            radius: 38,
            lineWidth: 5,
        });

        ctx.fillStyle = colors.gold;
        ctx.font = 'bold 92px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`+${result?.dust ?? item.dust} GS DUST`, WIDTH / 2, 385);

        ctx.fillStyle = colors.white;
        ctx.font = 'bold 40px Arial';
        ctx.fillText(`${card.code} • ${card.name}`, WIDTH / 2, 465);

        ctx.fillStyle = colors.muted;
        ctx.font = 'bold 30px Arial';
        ctx.fillText(`Баланс: ${result?.balance ?? '?'} GS Dust`, WIDTH / 2, 535);
        ctx.textAlign = 'left';

        drawStatBox(ctx, 300, 695, 430, 120, 'ЭКЗЕМПЛЯР', formatCopyNumber(item.copy_number), accent);
        drawStatBox(ctx, 870, 695, 430, 120, 'СТАТУС', 'УНИЧТОЖЕНА', colors.red);
    }

    return canvas.toBuffer('image/png');
}

module.exports = {
    createDismantlePanel,
};
