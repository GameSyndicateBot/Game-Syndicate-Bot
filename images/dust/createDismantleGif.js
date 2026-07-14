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

function drawEnergy(ctx, accent, intensity = 1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const cx = 800;
    const cy = 475;

    for (let i = 0; i < 48; i++) {
        const angle = (Math.PI * 2 / 48) * i;
        const r1 = 120 + (i % 5) * 12;
        const r2 = 330 + (i % 8) * 25 * intensity;

        ctx.globalAlpha = 0.08 + (i % 5) * 0.035;
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

function drawParticles(ctx, accent, phase = 1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const cx = 800;
    const cy = 475;

    for (let i = 0; i < 90; i++) {
        const angle = (Math.PI * 2 / 90) * i;
        const radius = 80 + phase * (120 + (i % 12) * 20);
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius * 0.72;

        ctx.globalAlpha = Math.max(0.18, 0.85 - phase * 0.3);
        ctx.fillStyle = i % 5 === 0 ? colors.white : accent;
        ctx.beginPath();
        ctx.arc(x, y, 3 + (i % 4), 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
    ctx.globalAlpha = 1;
}

function drawCracks(ctx, accent, strength = 1) {
    const cx = 800;
    const cy = 475;

    ctx.strokeStyle = colors.white;
    ctx.globalAlpha = 0.45 + strength * 0.35;
    ctx.lineWidth = 3;

    for (let i = 0; i < 18; i++) {
        const angle = (Math.PI * 2 / 18) * i;
        const len = 75 + strength * (90 + (i % 4) * 18);

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * len, cy + Math.sin(angle) * len);
        ctx.stroke();
    }

    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;

    for (let i = 0; i < 14; i++) {
        const angle = (Math.PI * 2 / 14) * i + 0.2;
        const len = 115 + strength * (100 + (i % 5) * 14);

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
    ctx.shadowBlur = 35;

    drawPanel(ctx, x, y, w, h, {
        fill: 'rgba(0, 0, 0, 0.60)',
        stroke: accent,
        radius: 28,
        lineWidth: 4,
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
            ctx.roundRect(x + 12, y + 12, w - 24, h - 24, 22);
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
    ctx.roundRect(x + 12, y + 12, w - 24, h - 24, 22);
    ctx.fill();

    ctx.fillStyle = accent;
    ctx.font = 'bold 110px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('GS', x + w / 2, y + h / 2 + 20);

    ctx.fillStyle = colors.white;
    ctx.font = 'bold 28px Arial';
    ctx.fillText(card.code ?? '???', x + w / 2, y + h / 2 + 70);
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
        result: '✦ РАСПЫЛЕНИЕ ЗАВЕРШЕНО',
    };

    drawHeader(ctx, titles[phase] ?? '♻ РАСПЫЛЕНИЕ', `GAME SYNDICATE • ${(user.gsDisplayName || user.username).toUpperCase()}`, WIDTH);

    if (phase === 'charge') {
        drawEnergy(ctx, accent, 0.75);
        await drawCard(ctx, item, 590, 205, 420, 585, accent, 1);

        drawStatBox(ctx, 90, 225, 420, 125, 'РЕДКОСТЬ', String(item.rarity).toUpperCase(), accent);
        drawStatBox(ctx, 1090, 225, 420, 125, 'ПОЛУЧИШЬ', `✦ ${item.dust}`, colors.gold);
        drawTag(ctx, 90, 805, 'КАРТОЧКА НАПОЛНЯЕТСЯ ЭНЕРГИЕЙ', accent);
    }

    if (phase === 'crack') {
        drawEnergy(ctx, accent, 1.05);
        await drawCard(ctx, item, 590, 205, 420, 585, accent, 0.92);
        drawCracks(ctx, accent, 0.75);

        drawStatBox(ctx, 90, 225, 420, 125, 'СТАТУС', 'РАЗЛОМ', accent);
        drawStatBox(ctx, 1090, 225, 420, 125, 'ПЫЛЬ', `+${item.dust}`, colors.gold);
        drawTag(ctx, 90, 805, 'РАМКА ТЕРЯЕТ СТАБИЛЬНОСТЬ', accent);
    }

    if (phase === 'burst') {
        drawEnergy(ctx, accent, 1.35);
        drawParticles(ctx, accent, 1.1);
        await drawCard(ctx, item, 650, 250, 300, 420, accent, 0.18);
        drawCracks(ctx, accent, 1.25);

        ctx.fillStyle = colors.gold;
        ctx.font = 'bold 78px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`+${item.dust} GS DUST`, WIDTH / 2, 490);
        ctx.textAlign = 'left';

        drawTag(ctx, 90, 805, 'ОСКОЛКИ СОБИРАЮТСЯ В GS DUST', colors.gold);
    }

    if (phase === 'result') {
        drawParticles(ctx, accent, 0.95);

        drawPanel(ctx, 340, 245, 920, 380, {
            fill: 'rgba(0,0,0,0.52)',
            stroke: colors.gold,
            radius: 34,
            lineWidth: 4,
        });

        ctx.fillStyle = colors.gold;
        ctx.font = 'bold 86px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`+${result?.dust ?? item.dust} GS DUST`, WIDTH / 2, 390);

        ctx.fillStyle = colors.white;
        ctx.font = 'bold 34px Arial';
        ctx.fillText(`${card.code} • ${card.name}`, WIDTH / 2, 465);

        ctx.fillStyle = colors.muted;
        ctx.font = 'bold 26px Arial';
        ctx.fillText(`Баланс: ${result?.balance ?? '?'} GS Dust`, WIDTH / 2, 525);
        ctx.textAlign = 'left';

        drawStatBox(ctx, 90, 680, 420, 120, 'ЭКЗЕМПЛЯР', formatCopyNumber(item.copy_number), accent);
        drawStatBox(ctx, 1090, 680, 420, 120, 'СТАТУС', 'УНИЧТОЖЕНА', colors.red);
    }

    return canvas.toBuffer('image/png');
}

module.exports = {
    createDismantlePanel,
};
