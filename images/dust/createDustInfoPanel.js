const { createCanvas } = require('canvas');
const colors = require('../ui/colors');
const { drawBackground, drawFrame, drawHeader, drawPanel, drawTag } = require('../ui/draw');

const WIDTH = 1600;
const HEIGHT = 900;

function roundedRect(ctx, x, y, w, h, r = 18) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

function drawCrystal(ctx, x, y, size, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = `${color}22`;
    ctx.lineWidth = Math.max(2, size * 0.075);
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.25;
    ctx.beginPath();
    ctx.moveTo(x, y - size * 0.5);
    ctx.lineTo(x + size * 0.38, y - size * 0.08);
    ctx.lineTo(x + size * 0.18, y + size * 0.5);
    ctx.lineTo(x - size * 0.18, y + size * 0.5);
    ctx.lineTo(x - size * 0.38, y - size * 0.08);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - size * 0.5);
    ctx.lineTo(x, y + size * 0.5);
    ctx.moveTo(x - size * 0.38, y - size * 0.08);
    ctx.lineTo(x + size * 0.38, y - size * 0.08);
    ctx.stroke();
    ctx.restore();
}

function drawIcon(ctx, type, x, y, size, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = 'transparent';
    ctx.lineWidth = Math.max(3, size * 0.07);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = size * 0.18;

    if (type === 'daily') {
        roundedRect(ctx, x - size * 0.42, y - size * 0.34, size * 0.84, size * 0.72, size * 0.1);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - size * 0.42, y - size * 0.12);
        ctx.lineTo(x + size * 0.42, y - size * 0.12);
        ctx.moveTo(x - size * 0.22, y - size * 0.46);
        ctx.lineTo(x - size * 0.22, y - size * 0.24);
        ctx.moveTo(x + size * 0.22, y - size * 0.46);
        ctx.lineTo(x + size * 0.22, y - size * 0.24);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - size * 0.18, y + size * 0.1);
        ctx.lineTo(x - size * 0.02, y + size * 0.25);
        ctx.lineTo(x + size * 0.25, y - size * 0.02);
        ctx.stroke();
    } else if (type === 'streak') {
        ctx.beginPath();
        ctx.moveTo(x, y - size * 0.48);
        ctx.bezierCurveTo(x + size * 0.34, y - size * 0.18, x + size * 0.42, y + size * 0.18, x, y + size * 0.46);
        ctx.bezierCurveTo(x - size * 0.42, y + size * 0.18, x - size * 0.32, y - size * 0.1, x - size * 0.08, y - size * 0.28);
        ctx.bezierCurveTo(x - size * 0.02, y - size * 0.04, x + size * 0.02, y + size * 0.02, x, y + size * 0.22);
        ctx.stroke();
    } else if (type === 'achievement') {
        ctx.beginPath();
        ctx.arc(x, y - size * 0.12, size * 0.28, 0, Math.PI * 2);
        ctx.moveTo(x - size * 0.18, y + size * 0.08);
        ctx.lineTo(x - size * 0.24, y + size * 0.48);
        ctx.lineTo(x, y + size * 0.34);
        ctx.lineTo(x + size * 0.24, y + size * 0.48);
        ctx.lineTo(x + size * 0.18, y + size * 0.08);
        ctx.stroke();
    } else if (type === 'category') {
        ctx.beginPath();
        ctx.moveTo(x, y - size * 0.5);
        ctx.lineTo(x + size * 0.4, y - size * 0.28);
        ctx.lineTo(x + size * 0.32, y + size * 0.2);
        ctx.quadraticCurveTo(x, y + size * 0.52, x - size * 0.32, y + size * 0.2);
        ctx.lineTo(x - size * 0.4, y - size * 0.28);
        ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x, y - size * 0.02, size * 0.12, 0, Math.PI * 2);
        ctx.stroke();
    } else if (type === 'duplicate') {
        roundedRect(ctx, x - size * 0.38, y - size * 0.32, size * 0.58, size * 0.72, size * 0.08);
        ctx.stroke();
        roundedRect(ctx, x - size * 0.12, y - size * 0.42, size * 0.58, size * 0.72, size * 0.08);
        ctx.stroke();
    } else if (type === 'weekly') {
        roundedRect(ctx, x - size * 0.42, y - size * 0.22, size * 0.84, size * 0.62, size * 0.08);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x - size * 0.48, y - size * 0.22);
        ctx.lineTo(x + size * 0.48, y - size * 0.22);
        ctx.moveTo(x, y - size * 0.5);
        ctx.lineTo(x, y + size * 0.38);
        ctx.moveTo(x - size * 0.42, y - size * 0.02);
        ctx.lineTo(x + size * 0.42, y - size * 0.02);
        ctx.stroke();
    }

    ctx.restore();
}

function drawSourceCard(ctx, x, y, w, h, icon, title, lines, accent) {
    drawPanel(ctx, x, y, w, h, {
        radius: 22,
        fill: 'rgba(18, 8, 34, 0.90)',
        stroke: `${accent}88`,
        lineWidth: 2,
    });

    ctx.save();
    roundedRect(ctx, x + 22, y + 22, 84, 84, 20);
    ctx.fillStyle = `${accent}1f`;
    ctx.fill();
    drawIcon(ctx, icon, x + 64, y + 64, 52, accent);

    ctx.fillStyle = colors.white;
    ctx.font = 'bold 28px Arial';
    ctx.fillText(title, x + 130, y + 50);

    let textY = y + 82;
    for (const line of lines) {
        ctx.fillStyle = line.highlight ? colors.gold : colors.muted;
        ctx.font = line.highlight ? 'bold 21px Arial' : '20px Arial';
        ctx.fillText(line.text, x + 130, textY);
        textY += 27;
    }
    ctx.restore();
}

async function createDustInfoPanel(user) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    drawBackground(ctx, WIDTH, HEIGHT, 'DUST GUIDE');
    drawFrame(ctx, WIDTH, HEIGHT);
    drawHeader(ctx, 'GS DUST GUIDE', `GAME SYNDICATE • ${(user.gsDisplayName || user.username).toUpperCase()}`, WIDTH);

    drawPanel(ctx, 90, 175, 1420, 105, {
        radius: 24,
        fill: 'rgba(30, 13, 53, 0.88)',
        stroke: 'rgba(192,132,252,0.45)',
        lineWidth: 2,
    });
    drawCrystal(ctx, 145, 227, 58, colors.purpleLight);
    ctx.fillStyle = colors.white;
    ctx.font = 'bold 34px Arial';
    ctx.fillText('КАК ПОЛУЧИТЬ GS DUST', 200, 218);
    ctx.fillStyle = colors.muted;
    ctx.font = '22px Arial';
    ctx.fillText('Пыль выдаётся за активность, серии, достижения и распыление лишних карточек.', 200, 252);

    const leftX = 90;
    const rightX = 810;
    const cardW = 700;
    const cardH = 150;

    drawSourceCard(ctx, leftX, 310, cardW, cardH, 'daily', 'Ежедневные задания', [
        { text: '4 задания: +15 / +20 / +10 / +10 Dust' },
        { text: 'Бонус за полный день: +45 Dust', highlight: true },
        { text: 'Максимум за день: 100 Dust' },
    ], colors.green);

    drawSourceCard(ctx, rightX, 310, cardW, cardH, 'streak', 'Серии полного дня', [
        { text: '3 / 7 / 14 дней: +40 / +100 / +250 Dust' },
        { text: '30 / 60 / 100 дней: +600 / +1500 / +3500 Dust', highlight: true },
        { text: 'Серия растёт только при закрытии всех ежедневок' },
    ], '#ff6b4a');

    drawSourceCard(ctx, leftX, 485, cardW, cardH, 'achievement', 'Достижения', [
        { text: 'Common 5 • Rare 10 • Epic 20 Dust' },
        { text: 'Legendary 35 • Mythic 60 Dust', highlight: true },
        { text: 'Награда выдаётся один раз при получении' },
    ], colors.gold);

    drawSourceCard(ctx, rightX, 485, cardW, cardH, 'category', 'Категории достижений', [
        { text: 'Bronze 30 • Silver 60 Dust' },
        { text: 'Gold 100 • Platinum 150 Dust', highlight: true },
        { text: 'Начисляется при открытии новой роли категории' },
    ], colors.purpleLight);

    drawSourceCard(ctx, leftX, 650, cardW, 116, 'duplicate', 'Распыление повторок', [
        { text: 'Common 20 • Rare 50 • Epic 120 • Legendary 300' },
        { text: 'Mythic 700 • Exclusive 1500 • Holographic 2500', highlight: true },
    ], '#4aa3ff');

    drawSourceCard(ctx, rightX, 650, cardW, 116, 'weekly', 'Недельный сундук', [
        { text: 'Закрой все ежедневки 7 дней подряд' },
        { text: '+300 Dust и 1 Base Pack', highlight: true },
    ], '#f7c948');

    drawTag(ctx, 90, 786, 'TREASURE НЕ РАСПЫЛЯЕТСЯ', '#ff5c72');
    drawTag(ctx, 455, 786, 'ПОСЛЕДНЯЯ КОПИЯ КАРТЫ ЗАЩИЩЕНА', colors.green);
    drawTag(ctx, 1015, 786, 'ОТКРОЙ /DUST ДЛЯ РАСПЫЛЕНИЯ', colors.purpleLight);

    return canvas.toBuffer('image/png');
}

module.exports = { createDustInfoPanel };
