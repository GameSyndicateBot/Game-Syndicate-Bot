
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

function drawEnergy(ctx, accent, intensity = 1) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const cx = WIDTH / 2;
    const cy = 480;

    for (let i = 0; i < 40; i++) {
        const angle = (Math.PI * 2 / 40) * i;
        const r1 = 85 + (i % 6) * 7;
        const r2 = 240 + (i % 8) * 24 * intensity;

        ctx.globalAlpha = 0.10 + (i % 6) * 0.035;
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

function drawPack(ctx, accent, opened = false) {
    const x = 590;
    const y = 240;
    const w = 420;
    const h = 510;

    ctx.shadowColor = accent;
    ctx.shadowBlur = 38;

    drawPanel(ctx, x, y, w, h, {
        fill: 'rgba(10, 3, 20, 0.96)',
        stroke: accent,
        radius: 32,
        lineWidth: 5,
    });

    ctx.shadowBlur = 0;

    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, 'rgba(255,255,255,0.06)');
    grad.addColorStop(0.5, 'rgba(168,85,247,0.24)');
    grad.addColorStop(1, 'rgba(0,0,0,0.35)');

    ctx.beginPath();
    ctx.roundRect(x + 12, y + 12, w - 24, h - 24, 24);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.fillStyle = colors.white;
    ctx.font = 'bold 42px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('GAME', x + w / 2, y + 112);
    ctx.fillText('SYNDICATE', x + w / 2, y + 162);

    ctx.fillStyle = accent;
    ctx.font = 'bold 110px Arial';
    ctx.fillText(opened ? '✦' : 'GS', x + w / 2, y + 306);

    ctx.fillStyle = colors.muted;
    ctx.font = 'bold 22px Arial';
    ctx.fillText(opened ? 'CARD REVEAL' : 'BASE 2026 PACK', x + w / 2, y + h - 52);
    ctx.textAlign = 'left';
}

async function drawCardPreview(ctx, card, x, y, w, h, accent) {
    drawPanel(ctx, x, y, w, h, {
        fill: 'rgba(0, 0, 0, 0.55)',
        stroke: accent,
        radius: 26,
        lineWidth: 4,
    });

    const imagePath = resolveImagePath(card?.image);

    if (!imagePath) {
        ctx.fillStyle = accent;
        ctx.font = 'bold 120px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('GS', x + w / 2, y + h / 2 + 40);
        ctx.textAlign = 'left';
        return;
    }

    try {
        const img = await loadImage(imagePath);
        const scale = Math.min((w - 24) / img.width, (h - 24) / img.height);
        const iw = img.width * scale;
        const ih = img.height * scale;
        const ix = x + (w - iw) / 2;
        const iy = y + (h - ih) / 2;

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x + 12, y + 12, w - 24, h - 24, 20);
        ctx.clip();
        ctx.drawImage(img, ix, iy, iw, ih);
        ctx.restore();
    } catch (_) {
        ctx.fillStyle = accent;
        ctx.font = 'bold 120px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('GS', x + w / 2, y + h / 2 + 40);
        ctx.textAlign = 'left';
    }
}

async function createRevealPanel(user, data = {}) {
    const phase = data.phase ?? 'charge';
    const source = data.source ?? 'PACK';
    const drop = data.drop ?? null;
    const card = drop?.card ?? null;
    const rarity = drop?.rarity ?? 'epic';
    const accent = rarityColors[rarity] ?? colors.violet;

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');
    installIconRenderer(ctx);

    drawBackground(ctx, WIDTH, HEIGHT, phase === 'result' ? 'DROP' : 'OPEN');
    drawFrame(ctx, WIDTH, HEIGHT);

    const titles = {
        charge: '✦ ЭНЕРГИЯ СИНДИКАТА',
        burst: '✦ ПАК ОТКРЫВАЕТСЯ',
        rarity: `${String(rarity).toUpperCase()} REVEAL`,
        result: '▥ КАРТОЧКА ПОЛУЧЕНА',
    };

    drawHeader(ctx, titles[phase] ?? '▥ CARD REVEAL', `GAME SYNDICATE • ${(user.gsDisplayName || user.username).toUpperCase()} • ${source}`, WIDTH);

    if (phase === 'charge') {
        drawEnergy(ctx, colors.purpleLight, 0.7);
        drawPack(ctx, colors.purpleLight, false);
        drawStatBox(ctx, 90, 220, 420, 130, 'СТАТУС', 'ЗАРЯДКА', colors.purpleLight);
        drawStatBox(ctx, 1090, 220, 420, 130, 'СИГНАТУРА', 'СКАНИРУЕТСЯ', colors.gold);
        drawTag(ctx, 90, 805, 'ПАК НАПОЛНЯЕТСЯ ЭНЕРГИЕЙ', colors.purpleLight);
    }

    if (phase === 'burst') {
        drawEnergy(ctx, accent, 1.2);
        drawPack(ctx, accent, true);
        drawStatBox(ctx, 90, 220, 420, 130, 'СТАТУС', 'ВСКРЫТИЕ', accent);
        drawStatBox(ctx, 1090, 220, 420, 130, 'РЕДКОСТЬ', 'ОПРЕДЕЛЕНА', colors.gold);
        drawTag(ctx, 90, 805, 'КАРТОЧКА ВЫХОДИТ ИЗ ТЕНИ', accent);
    }

    if (phase === 'rarity') {
        drawEnergy(ctx, accent, 1.35);

        ctx.shadowColor = accent;
        ctx.shadowBlur = 45;

        drawPanel(ctx, 365, 265, 870, 320, {
            fill: 'rgba(0,0,0,0.48)',
            stroke: accent,
            radius: 34,
            lineWidth: 5,
        });

        ctx.shadowBlur = 0;

        ctx.fillStyle = accent;
        ctx.font = 'bold 88px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(String(rarity).toUpperCase(), WIDTH / 2, 415);

        ctx.fillStyle = colors.white;
        ctx.font = 'bold 38px Arial';
        ctx.fillText(String(drop?.edition ?? 'standard').toUpperCase(), WIDTH / 2, 485);

        ctx.fillStyle = colors.muted;
        ctx.font = 'bold 26px Arial';
        ctx.fillText('Карточка проявляется...', WIDTH / 2, 545);
        ctx.textAlign = 'left';
    }

    if (phase === 'result') {
        await drawCardPreview(ctx, card, 90, 235, 430, 555, accent);

        drawPanel(ctx, 565, 235, 945, 555, {
            fill: 'rgba(0,0,0,0.45)',
            stroke: accent,
            radius: 30,
            lineWidth: 4,
        });

        ctx.fillStyle = accent;
        ctx.font = 'bold 30px Arial';
        ctx.fillText(`${String(drop.rarity).toUpperCase()} • ${String(drop.edition).toUpperCase()}`, 620, 315);

        ctx.fillStyle = colors.white;
        ctx.font = 'bold 62px Arial';
        ctx.fillText(`${card.code} • ${truncate(card.name, 20)}`, 620, 398);

        ctx.fillStyle = colors.muted;
        ctx.font = 'bold 28px Arial';
        ctx.fillText(card.type === 'role' ? 'РОЛЬ GAME SYNDICATE' : 'УЧАСТНИК GAME SYNDICATE', 620, 450);

        drawTag(ctx, 620, 490, card.series ?? 'BASE2026', colors.purpleLight);
        drawTag(ctx, 795, 490, card.role ?? 'Коллекционная карта', accent);

        drawStatBox(ctx, 620, 575, 320, 120, 'ЭКЗЕМПЛЯР', formatCopyNumber(drop.copyNumber), colors.gold);
        drawStatBox(ctx, 980, 575, 470, 120, 'ИСТОЧНИК', source, accent);

        ctx.fillStyle = colors.gold;
        ctx.font = 'bold 25px Arial';
        ctx.fillText('Карточка добавлена в коллекцию.', 620, 750);
    }

    return canvas.toBuffer('image/png');
}

module.exports = {
    createRevealPanel,
};
