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

function drawEnergyRings(ctx, accent, intensity = 1, cx = 800, cy = 465) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < 5; i++) {
        ctx.globalAlpha = 0.08 + i * 0.04;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 4 + i;
        ctx.beginPath();
        ctx.arc(cx, cy, 150 + i * 58 * intensity, 0, Math.PI * 2);
        ctx.stroke();
    }

    for (let i = 0; i < 56; i++) {
        const angle = (Math.PI * 2 / 56) * i;
        const r1 = 155 + (i % 5) * 10;
        const r2 = 355 + (i % 8) * 26 * intensity;

        ctx.globalAlpha = 0.08 + (i % 6) * 0.03;
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

function drawParticles(ctx, accent, phase = 1, cx = 800, cy = 465) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < 120; i++) {
        const angle = (Math.PI * 2 / 120) * i;
        const radius = 70 + phase * (135 + (i % 13) * 22);
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius * 0.68;

        ctx.globalAlpha = Math.max(0.12, 0.86 - phase * 0.31);
        ctx.fillStyle = i % 6 === 0 ? colors.white : accent;

        ctx.beginPath();
        ctx.arc(x, y, 3 + (i % 5), 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
    ctx.globalAlpha = 1;
}

function drawPack(ctx, x, y, w, h, accent, openAmount = 0) {
    ctx.save();

    ctx.shadowColor = accent;
    ctx.shadowBlur = 42;

    drawPanel(ctx, x, y, w, h, {
        fill: 'rgba(10, 3, 20, 0.96)',
        stroke: accent,
        radius: 34,
        lineWidth: 5,
    });

    ctx.shadowBlur = 0;

    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, 'rgba(255,255,255,0.08)');
    grad.addColorStop(0.48, 'rgba(168,85,247,0.28)');
    grad.addColorStop(1, 'rgba(0,0,0,0.38)');

    ctx.beginPath();
    ctx.roundRect(x + 14, y + 14, w - 28, h - 28, 26);
    ctx.fillStyle = grad;
    ctx.fill();

    if (openAmount > 0) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.18 + openAmount * 0.22;
        ctx.beginPath();
        ctx.moveTo(x + 42, y + h * 0.36);
        ctx.lineTo(x + w - 42, y + h * 0.36);
        ctx.lineTo(x + w / 2, y + h * 0.52 + openAmount * 90);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    ctx.fillStyle = colors.white;
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('GAME', x + w / 2, y + 120);
    ctx.fillText('SYNDICATE', x + w / 2, y + 178);

    ctx.fillStyle = accent;
    ctx.font = 'bold 132px Arial';
    ctx.fillText(openAmount > 0.65 ? '✦' : 'GS', x + w / 2, y + 345);

    ctx.fillStyle = colors.muted;
    ctx.font = 'bold 24px Arial';
    ctx.fillText('BASE 2026 PACK', x + w / 2, y + h - 58);

    ctx.textAlign = 'left';
    ctx.restore();
}

async function drawCard(ctx, card, x, y, w, h, accent, alpha = 1) {
    const imagePath = resolveImagePath(card?.image);

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
    ctx.fillText(card?.code ?? '???', x + w / 2, y + h / 2 + 78);
    ctx.textAlign = 'left';
}

function drawFlash(ctx, accent) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const grad = ctx.createRadialGradient(800, 465, 40, 800, 465, 620);
    grad.addColorStop(0, colors.white);
    grad.addColorStop(0.25, accent);
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.globalAlpha = 0.82;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.restore();
    ctx.globalAlpha = 1;
}

function getPhaseState(phase) {
    const states = {
        idle: { group: 'idle', ring: 0.7, open: 0, packScale: 1, shake: 0, flash: 0, cardAlpha: 0 }
        charge: { group: 'charge', ring: 0.9, open: 0.15, packScale: 1, shake: 0, flash: 0, cardAlpha: 0 }
        charge_1: { group: 'charge', ring: 0.75, open: 0.08, packScale: 0.96, shake: -8, flash: 0, cardAlpha: 0 }
        charge_2: { group: 'charge', ring: 1.02, open: 0.18, packScale: 1.02, shake: 7, flash: 0, cardAlpha: 0 }
        charge_3: { group: 'charge', ring: 1.22, open: 0.30, packScale: 1.07, shake: -5, flash: 0, cardAlpha: 0 }
        open: { group: 'open', ring: 1.2, open: 0.72, packScale: 1.05, shake: 0, flash: 0, cardAlpha: 0 }
        shake_1: { group: 'shake', ring: 1.18, open: 0.34, packScale: 1.06, shake: -18, flash: 0, cardAlpha: 0 }
        shake_2: { group: 'shake', ring: 1.26, open: 0.42, packScale: 1.09, shake: 18, flash: 0, cardAlpha: 0 }
        shake_3: { group: 'shake', ring: 1.36, open: 0.56, packScale: 1.12, shake: -12, flash: 0, cardAlpha: 0 }
        open_1: { group: 'open', ring: 1.38, open: 0.72, packScale: 1.10, shake: 0, flash: 0, cardAlpha: 0 }
        open_2: { group: 'open', ring: 1.50, open: 0.92, packScale: 1.04, shake: 0, flash: 0, cardAlpha: 0.25 }
        flash: { group: 'flash', ring: 1.35, open: 1, packScale: 1, shake: 0, flash: 0.78, cardAlpha: 0 }
        flash_1: { group: 'flash', ring: 1.65, open: 1, packScale: 1, shake: 0, flash: 0.65, cardAlpha: 0 }
        flash_2: { group: 'flash', ring: 1.95, open: 1, packScale: 1, shake: 0, flash: 0.92, cardAlpha: 0 }
        rarity: { group: 'rarity', ring: 1.4, open: 1, packScale: 1, shake: 0, flash: 0, cardAlpha: 0 }
        rarity_1: { group: 'rarity', ring: 1.25, open: 1, packScale: 1, shake: 0, flash: 0, cardAlpha: 0 }
        rarity_2: { group: 'rarity', ring: 1.55, open: 1, packScale: 1, shake: 0, flash: 0, cardAlpha: 0 }
        card_1: { group: 'card', ring: 1.1, open: 1, packScale: 1, shake: 0, flash: 0, cardAlpha: 0.55 }
        card_2: { group: 'card', ring: 1.25, open: 1, packScale: 1, shake: 0, flash: 0, cardAlpha: 0.82 }
        result: { group: 'result', ring: 0.8, open: 1, packScale: 1, shake: 0, flash: 0, cardAlpha: 1 }
    };

    return states[phase] ?? states.charge;
}

function drawScaledPack(ctx, x, y, w, h, accent, openAmount, scale = 1, dx = 0) {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const sw = w * scale;
    const sh = h * scale;

    drawPack(
        ctx,
        cx - sw / 2 + dx,
        cy - sh / 2,
        sw,
        sh,
        accent,
        openAmount
    );
}

async function createPackOpeningPanel(user, phase = 'charge', drop = null, source = 'DAILY PACK') {
    const card = drop?.card ?? null;
    const rarity = drop?.rarity ?? 'epic';
    const edition = drop?.edition ?? 'standard';
    const accent = rarityColors[rarity] ?? colors.violet;
    const state = getPhaseState(phase);
    const group = state.group;

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');
    installIconRenderer(ctx);

    drawBackground(ctx, WIDTH, HEIGHT, group === 'result' ? 'DROP' : 'PACK');
    drawFrame(ctx, WIDTH, HEIGHT);

    const titles = {
        idle: '□ ЕЖЕДНЕВНЫЙ ПАК',
        charge: '✦ ПАК ЗАРЯЖАЕТСЯ',
        shake: '⚡ ЭНЕРГИЯ НЕСТАБИЛЬНА',
        open: '□ ПАК ОТКРЫВАЕТСЯ',
        flash: '✦ ВСПЫШКА',
        rarity: `${String(rarity).toUpperCase()} REVEAL`,
        card: '▥ КАРТОЧКА ПРОЯВЛЯЕТСЯ',
        result: '▥ КАРТОЧКА ПОЛУЧЕНА',
    };

    drawHeader(ctx, titles[group] ?? '□ PACK OPENING', `GAME SYNDICATE • ${(user.gsDisplayName || user.username).toUpperCase()} • ${source}`, WIDTH);

    if (group === 'idle') {
        drawEnergyRings(ctx, colors.violet, state.ring);
        drawScaledPack(ctx, 535, 185, 530, 640, colors.violet, state.open, state.packScale, state.shake);
        drawTag(ctx, 90, 805, 'ПАК ГОТОВ К ОТКРЫТИЮ', colors.green);
    }

    if (group === 'charge') {
        drawEnergyRings(ctx, colors.purpleLight, state.ring);
        drawParticles(ctx, colors.purpleLight, 0.35 + state.ring * 0.22);
        drawScaledPack(ctx, 535, 185, 530, 640, colors.purpleLight, state.open, state.packScale, state.shake);
        drawTag(ctx, 90, 805, 'ПАК НАПОЛНЯЕТСЯ ЭНЕРГИЕЙ', colors.purpleLight);
    }

    if (group === 'shake' || group === 'open') {
        drawEnergyRings(ctx, accent, state.ring);
        drawParticles(ctx, accent, group === 'shake' ? 0.78 : 0.95);
        drawScaledPack(ctx, 535, 185, 530, 640, accent, state.open, state.packScale, state.shake);

        if (state.cardAlpha > 0 && card) {
            await drawCard(ctx, card, 670, 300, 260, 360, accent, state.cardAlpha);
        }

        drawTag(ctx, 90, 805, group === 'shake' ? 'ПАК ТРЯСЁТСЯ ОТ ЭНЕРГИИ' : 'КАРТОЧКА ВЫХОДИТ ИЗ ПАКА', accent);
    }

    if (group === 'flash') {
        drawEnergyRings(ctx, accent, state.ring);
        drawParticles(ctx, accent, 1.35);
        drawFlash(ctx, accent);

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = state.flash;
        ctx.fillStyle = colors.white;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        ctx.restore();

        ctx.fillStyle = state.flash > 0.8 ? accent : colors.white;
        ctx.font = 'bold 104px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('REVEAL', WIDTH / 2, 470);
        ctx.textAlign = 'left';
    }

    if (group === 'rarity') {
        drawEnergyRings(ctx, accent, state.ring);
        drawParticles(ctx, accent, phase === 'rarity_2' ? 1.15 : 0.85);

        drawPanel(ctx, 250, 235, 1100, 365, {
            fill: 'rgba(0,0,0,0.58)',
            stroke: accent,
            radius: 44,
            lineWidth: 6,
        });

        ctx.fillStyle = accent;
        ctx.font = phase === 'rarity_2' ? 'bold 116px Arial' : 'bold 82px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(String(rarity).toUpperCase(), WIDTH / 2, phase === 'rarity_2' ? 405 : 385);

        ctx.fillStyle = colors.white;
        ctx.font = 'bold 44px Arial';
        ctx.fillText(String(edition).toUpperCase(), WIDTH / 2, 490);

        ctx.fillStyle = colors.muted;
        ctx.font = 'bold 28px Arial';
        ctx.fillText(phase === 'rarity_2' ? 'Редкость зафиксирована' : 'Редкость проявляется...', WIDTH / 2, 545);
        ctx.textAlign = 'left';
    }

    if (group === 'card') {
        drawEnergyRings(ctx, accent, state.ring, 800, 475);
        drawParticles(ctx, accent, 0.75, 800, 475);

        drawPanel(ctx, 485, 155, 630, 710, {
            fill: 'rgba(0,0,0,0.56)',
            stroke: accent,
            radius: 42,
            lineWidth: 5,
        });

        if (card) {
            await drawCard(ctx, card, 525, 195, 550, 630, accent, state.cardAlpha);
        }

        drawTag(ctx, 90, 805, 'КАРТОЧКА ПРОЯВЛЯЕТСЯ', accent);
    }

    if (group === 'result') {
        drawParticles(ctx, accent, 0.8, 310, 475);

        await drawCard(ctx, card, 90, 155, 520, 725, accent, 1);

        drawPanel(ctx, 650, 235, 860, 510, {
            fill: 'rgba(0,0,0,0.52)',
            stroke: accent,
            radius: 36,
            lineWidth: 5,
        });

        ctx.fillStyle = accent;
        ctx.font = 'bold 34px Arial';
        ctx.fillText(`${String(drop.rarity).toUpperCase()} • ${String(drop.edition).toUpperCase()}`, 705, 315);

        ctx.fillStyle = colors.white;
        ctx.font = 'bold 66px Arial';
        ctx.fillText(`${card.code} • ${truncate(card.name, 20)}`, 705, 405);

        ctx.fillStyle = colors.muted;
        ctx.font = 'bold 30px Arial';
        ctx.fillText(card.type === 'role' ? 'РОЛЬ GAME SYNDICATE' : 'УЧАСТНИК GAME SYNDICATE', 705, 465);

        drawTag(ctx, 705, 505, card.series ?? 'BASE2026', colors.purpleLight);
        drawTag(ctx, 885, 505, card.role ?? 'Коллекционная карта', accent);

        drawStatBox(ctx, 705, 590, 330, 120, 'ЭКЗЕМПЛЯР', formatCopyNumber(drop.copyNumber), colors.gold);
        drawStatBox(ctx, 1080, 590, 330, 120, 'ИСТОЧНИК', source, accent);
    }

    return canvas.toBuffer('image/png');
}

module.exports = {
    createPackOpeningPanel,
};
