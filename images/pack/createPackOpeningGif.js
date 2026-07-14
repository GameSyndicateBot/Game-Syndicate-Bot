const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const { GifWriter } = require('omggif');

const { installIconRenderer } = require('../ui/icons');
const WIDTH = 800;
const HEIGHT = 450;

const palette = Array.from({ length: 256 }, (_, index) => {
    const r = ((index >> 5) & 7) * 255 / 7;
    const g = ((index >> 2) & 7) * 255 / 7;
    const b = (index & 3) * 255 / 3;

    return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
});

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

function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t) {
    return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
}

function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.closePath();
}

function hexToRgb(hex) {
    const value = String(hex).replace('#', '');
    return {
        r: parseInt(value.slice(0, 2), 16),
        g: parseInt(value.slice(2, 4), 16),
        b: parseInt(value.slice(4, 6), 16),
    };
}

function rgbaToRgb332Index(r, g, b, a) {
    if (a < 24) return 0;

    const ri = r >> 5;
    const gi = g >> 5;
    const bi = b >> 6;

    return (ri << 5) | (gi << 2) | bi;
}

function canvasToIndexedPixels(ctx) {
    const image = ctx.getImageData(0, 0, WIDTH, HEIGHT);
    const data = image.data;
    const pixels = new Uint8Array(WIDTH * HEIGHT);

    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
        pixels[p] = rgbaToRgb332Index(data[i], data[i + 1], data[i + 2], data[i + 3]);
    }

    return pixels;
}

function drawBackground(ctx, watermark, accent, intensity) {
    const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    bg.addColorStop(0, '#05000D');
    bg.addColorStop(0.52, '#160726');
    bg.addColorStop(1, '#06000B');

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.save();
    ctx.globalAlpha = 0.06 + intensity * 0.08;
    ctx.fillStyle = accent;
    ctx.font = 'bold 150px Arial';
    ctx.fillText(watermark, 440, 170);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.15 + intensity * 0.16;
    ctx.strokeStyle = '#8B5CF6';
    ctx.lineWidth = 3;
    roundedRect(ctx, 20, 20, WIDTH - 40, HEIGHT - 40, 24);
    ctx.stroke();

    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    roundedRect(ctx, 34, 34, WIDTH - 68, HEIGHT - 68, 18);
    ctx.stroke();
    ctx.restore();

    for (let i = 0; i < 55; i++) {
        const x = (i * 97 + Math.floor(intensity * 80)) % WIDTH;
        const y = (i * 53 + Math.floor(intensity * 50)) % HEIGHT;

        ctx.globalAlpha = 0.06 + (i % 5) * 0.018;
        ctx.fillStyle = i % 7 === 0 ? '#FFFFFF' : accent;
        ctx.beginPath();
        ctx.arc(x, y, 1.2 + (i % 3), 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalAlpha = 1;
}

function drawHeader(ctx, title, subtitle, accent) {
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 34px Arial';
    ctx.fillText(title, 55, 72);

    ctx.fillStyle = accent;
    ctx.font = 'bold 15px Arial';
    ctx.fillText(subtitle, 58, 98);

    ctx.fillStyle = '#C084FC';
    ctx.font = 'bold 30px Arial';
    ctx.textAlign = 'right';
    ctx.fillText('GS', WIDTH - 54, 74);
    ctx.textAlign = 'left';
}

function drawEnergy(ctx, cx, cy, accent, power, rotation) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    for (let i = 0; i < 5; i++) {
        ctx.globalAlpha = 0.08 + power * 0.13 - i * 0.01;
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2 + i;
        ctx.beginPath();
        ctx.arc(cx, cy, 80 + i * 36 + power * 45, 0, Math.PI * 2);
        ctx.stroke();
    }

    for (let i = 0; i < 70; i++) {
        const angle = rotation + (Math.PI * 2 / 70) * i;
        const radius = 60 + power * 165 + (i % 9) * 11;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius * 0.62;

        ctx.globalAlpha = 0.12 + power * 0.34;
        ctx.fillStyle = i % 8 === 0 ? '#FFFFFF' : accent;
        ctx.beginPath();
        ctx.arc(x, y, 2 + (i % 4), 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
    ctx.globalAlpha = 1;
}

function drawPack(ctx, cx, cy, scale, open, shakeX, accent) {
    const w = 210 * scale;
    const h = 285 * scale;
    const x = cx - w / 2 + shakeX;
    const y = cy - h / 2;

    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = 25 + open * 35;

    roundedRect(ctx, x, y, w, h, 22);
    ctx.fillStyle = '#090313';
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;

    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, 'rgba(255,255,255,0.14)');
    grad.addColorStop(0.42, 'rgba(168,85,247,0.42)');
    grad.addColorStop(1, 'rgba(0,0,0,0.52)');

    roundedRect(ctx, x + 11, y + 11, w - 22, h - 22, 16);
    ctx.fillStyle = grad;
    ctx.fill();

    if (open > 0.15) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.15 + open * 0.34;
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.moveTo(x + 22, y + h * 0.34);
        ctx.lineTo(x + w - 22, y + h * 0.34);
        ctx.lineTo(x + w / 2, y + h * (0.52 + open * 0.16));
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${Math.floor(23 * scale)}px Arial`;
    ctx.textAlign = 'center';
    ctx.fillText('GAME', x + w / 2, y + h * 0.21);
    ctx.fillText('SYNDICATE', x + w / 2, y + h * 0.31);

    ctx.fillStyle = accent;
    ctx.font = `bold ${Math.floor(62 * scale)}px Arial`;
    ctx.fillText(open > 0.7 ? '✦' : 'GS', x + w / 2, y + h * 0.58);

    ctx.fillStyle = '#C4B5FD';
    ctx.font = `bold ${Math.floor(14 * scale)}px Arial`;
    ctx.fillText('BASE 2026 PACK', x + w / 2, y + h - 34 * scale);
    ctx.textAlign = 'left';

    ctx.restore();
}

function drawFlash(ctx, accent, alpha) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    const grad = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 20, WIDTH / 2, HEIGHT / 2, 390);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.28, accent);
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.globalAlpha = alpha;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.globalAlpha = Math.max(0, alpha - 0.3);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.restore();
    ctx.globalAlpha = 1;
}

function drawRarity(ctx, rarity, edition, accent, t) {
    const scale = 0.8 + easeOutCubic(t) * 0.25;

    ctx.save();
    ctx.globalAlpha = clamp(t * 1.35);
    ctx.translate(WIDTH / 2, HEIGHT / 2);

    roundedRect(ctx, -270, -105, 540, 210, 30);
    ctx.fillStyle = 'rgba(0,0,0,0.62)';
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.scale(scale, scale);

    ctx.fillStyle = accent;
    ctx.font = 'bold 58px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(String(rarity).toUpperCase(), 0, -10);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px Arial';
    ctx.fillText(String(edition).toUpperCase(), 0, 45);

    ctx.restore();
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
}

async function drawCard(ctx, cardImage, card, accent, t) {
    const scale = 0.78 + easeOutCubic(t) * 0.22;
    const w = 265 * scale;
    const h = 355 * scale;
    const x = WIDTH / 2 - w / 2;
    const y = 72 + (1 - easeOutCubic(t)) * 70;

    ctx.save();
    ctx.globalAlpha = clamp(t * 1.3);
    ctx.shadowColor = accent;
    ctx.shadowBlur = 22 + t * 30;

    roundedRect(ctx, x, y, w, h, 22);
    ctx.fillStyle = 'rgba(0,0,0,0.64)';
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (cardImage) {
        const pad = 9;
        const scaleImage = Math.min((w - pad * 2) / cardImage.width, (h - pad * 2) / cardImage.height);
        const iw = cardImage.width * scaleImage;
        const ih = cardImage.height * scaleImage;

        ctx.save();
        roundedRect(ctx, x + pad, y + pad, w - pad * 2, h - pad * 2, 18);
        ctx.clip();
        ctx.drawImage(cardImage, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih);
        ctx.restore();
    } else {
        ctx.fillStyle = '#160827';
        roundedRect(ctx, x + 9, y + 9, w - 18, h - 18, 16);
        ctx.fill();

        ctx.fillStyle = accent;
        ctx.font = 'bold 62px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('GS', WIDTH / 2, y + h / 2);
        ctx.textAlign = 'left';
    }

    ctx.restore();

    if (card) {
        ctx.save();
        ctx.globalAlpha = clamp((t - 0.35) * 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 28px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`${card.code} • ${String(card.name).slice(0, 18)}`, WIDTH / 2, 410);

        ctx.fillStyle = '#C4B5FD';
        ctx.font = 'bold 17px Arial';
        ctx.fillText(card.role ?? 'Коллекционная карта', WIDTH / 2, 438);
        ctx.restore();
        ctx.textAlign = 'left';
    }
}

function drawBottomText(ctx, text, accent) {
    ctx.fillStyle = accent;
    ctx.font = 'bold 17px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(text, WIDTH / 2, HEIGHT - 38);
    ctx.textAlign = 'left';
}

async function createPackOpeningGif(user, drop, source = 'DAILY PACK') {
    const rarity = drop?.rarity ?? 'epic';
    const edition = drop?.edition ?? 'standard';
    const card = drop?.card ?? null;
    const accent = rarityColors[rarity] ?? '#A855F7';

    let cardImage = null;
    const imagePath = resolveImagePath(card?.image);

    if (imagePath) {
        try {
            cardImage = await loadImage(imagePath);
        } catch (_) {
            cardImage = null;
        }
    }

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');
    installIconRenderer(ctx);

    const estimatedSize = WIDTH * HEIGHT * 38;
    const buffer = Buffer.alloc(estimatedSize);
    const writer = new GifWriter(buffer, WIDTH, HEIGHT, {
        palette,
        loop: 0,
    });

    const frames = 54;
    const delay = 8;

    for (let frame = 0; frame < frames; frame++) {
        const p = frame / (frames - 1);

        let phase = 'charge';
        if (p > 0.28) phase = 'shake';
        if (p > 0.42) phase = 'open';
        if (p > 0.55) phase = 'flash';
        if (p > 0.64) phase = 'rarity';
        if (p > 0.78) phase = 'card';

        const flashAlpha =
            phase === 'flash'
                ? Math.sin(clamp((p - 0.55) / 0.09) * Math.PI) * 0.95
                : 0;

        const local = {
            charge: clamp(p / 0.28),
            shake: clamp((p - 0.28) / 0.14),
            open: clamp((p - 0.42) / 0.13),
            flash: clamp((p - 0.55) / 0.09),
            rarity: clamp((p - 0.64) / 0.14),
            card: clamp((p - 0.78) / 0.22),
        };

        const power = clamp(p * 1.25);
        const rotation = p * Math.PI * 4;

        drawBackground(ctx, phase === 'card' ? 'DROP' : 'PACK', accent, power);
        drawHeader(ctx, '▶ PACK OPENING', `GAME SYNDICATE • ${String((user.gsDisplayName || user.username)).toUpperCase()} • ${source}`, accent);

        drawEnergy(ctx, WIDTH / 2, HEIGHT / 2 + 10, accent, power, rotation);

        if (phase === 'charge') {
            drawPack(ctx, WIDTH / 2, HEIGHT / 2 + 20, 0.88 + local.charge * 0.12, local.charge * 0.22, Math.sin(frame * 0.7) * 4, accent);
            drawBottomText(ctx, 'Пак наполняется энергией...', accent);
        }

        if (phase === 'shake') {
            const shake = Math.sin(frame * 2.2) * (8 + local.shake * 14);
            drawPack(ctx, WIDTH / 2, HEIGHT / 2 + 20, 1.02 + local.shake * 0.1, 0.25 + local.shake * 0.35, shake, accent);
            drawBottomText(ctx, 'Энергия нестабильна...', accent);
        }

        if (phase === 'open') {
            drawPack(ctx, WIDTH / 2, HEIGHT / 2 + 20, 1.1 - local.open * 0.06, 0.58 + local.open * 0.38, 0, accent);
            drawBottomText(ctx, 'Карточка выходит из пака...', accent);
        }

        if (phase === 'flash') {
            drawPack(ctx, WIDTH / 2, HEIGHT / 2 + 20, 1.02, 1, 0, accent);
            drawFlash(ctx, accent, flashAlpha);
            drawBottomText(ctx, 'REVEAL', '#FFFFFF');
        }

        if (phase === 'rarity') {
            drawRarity(ctx, rarity, edition, accent, local.rarity);
            drawBottomText(ctx, 'Редкость раскрыта', accent);
        }

        if (phase === 'card') {
            await drawCard(ctx, cardImage, card, accent, local.card);
            drawBottomText(ctx, 'Карточка проявляется...', accent);
        }

        const pixels = canvasToIndexedPixels(ctx);
        writer.addFrame(0, 0, WIDTH, HEIGHT, pixels, {
            delay,
            disposal: 2,
        });
    }

    return buffer.subarray(0, writer.end());
}

module.exports = {
    createPackOpeningGif,
};
