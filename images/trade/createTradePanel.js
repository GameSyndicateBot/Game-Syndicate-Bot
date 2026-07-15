const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const colors = require('../ui/colors');
const { sanitizeCanvasText } = require('../../utils/displayName');
const { drawBackground, drawFrame, drawHeader, drawPanel, drawTag, drawAutoText, roundRect } = require('../ui/draw');

const { installIconRenderer } = require('../ui/icons');
const WIDTH = 1600;
const HEIGHT = 900;
const RARITY = { common: colors.common, rare: colors.rare, epic: colors.epic, legendary: colors.legendary, mythic: colors.mythic, exclusive: '#22D3EE', holographic: '#F472B6', treasure: colors.gold };

async function drawCard(ctx, owned, x, y, w, h, sideTitle, confirmed) {
    const accent = owned ? (RARITY[owned.rarity] || colors.purpleLight) : colors.muted;
    drawPanel(ctx, x, y, w, h, { fill: 'rgba(0,0,0,0.42)', stroke: accent, lineWidth: 3, radius: 28 });
    ctx.fillStyle = accent;
    drawAutoText(ctx, sanitizeCanvasText(sideTitle, 'Участник'), x + 34, y + 52, w - 68, 26, { minSize: 18 });

    const artX = x + 34, artY = y + 82, artW = 245, artH = 340;
    roundRect(ctx, artX, artY, artW, artH, 22);
    ctx.save(); ctx.clip();
    if (owned?.image) {
        try {
            const image = await loadImage(path.resolve(process.cwd(), owned.image));
            const scale = Math.max(artW / image.width, artH / image.height);
            const sw = artW / scale, sh = artH / scale;
            ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, artX, artY, artW, artH);
        } catch (_) { ctx.fillStyle = colors.dark; ctx.fillRect(artX, artY, artW, artH); }
    } else { ctx.fillStyle = colors.dark; ctx.fillRect(artX, artY, artW, artH); }
    ctx.restore();
    ctx.strokeStyle = accent; ctx.lineWidth = 3; roundRect(ctx, artX, artY, artW, artH, 22); ctx.stroke();

    const tx = x + 315;
    ctx.fillStyle = colors.white;
    drawAutoText(ctx, owned ? `${owned.code} • ${owned.name}` : 'КАРТОЧКА НЕ ВЫБРАНА', tx, y + 145, w - 350, 34, { minSize: 20 });
    ctx.fillStyle = accent;
    ctx.font = 'bold 25px Arial';
    ctx.fillText(owned ? String(owned.rarity).toUpperCase() : 'ОЖИДАНИЕ', tx, y + 195);
    ctx.fillStyle = colors.muted;
    ctx.font = 'bold 22px Arial';
    ctx.fillText(owned ? `Экземпляр #${String(owned.copy_number).padStart(6, '0')}` : 'Участник ещё не сделал выбор', tx, y + 238);
    drawTag(ctx, tx, y + 282, confirmed ? 'ПОДТВЕРЖДЕНО' : 'НЕ ПОДТВЕРЖДЕНО', confirmed ? colors.green : colors.red);
}

async function createTradePanel(data = {}) {
    const canvas = createCanvas(WIDTH, HEIGHT); const ctx = canvas.getContext('2d');
    installIconRenderer(ctx);
    drawBackground(ctx, WIDTH, HEIGHT, 'TRADE'); drawFrame(ctx, WIDTH, HEIGHT);
    drawHeader(ctx, '↻ ОБМЕН КАРТОЧКАМИ', `GAME SYNDICATE • СДЕЛКА #${data.id ?? '—'}`, WIDTH);
    ctx.fillStyle = data.statusColor || colors.purpleLight; ctx.font = 'bold 26px Arial'; ctx.textAlign = 'center';
    ctx.fillText(data.statusText || 'Ожидание действий участников', WIDTH / 2, 202); ctx.textAlign = 'left';
    await drawCard(ctx, data.left, 75, 245, 665, 490, data.leftTitle || 'АВТОР ПРЕДЛОЖЕНИЯ', Boolean(data.leftConfirmed));
    await drawCard(ctx, data.right, 860, 245, 665, 490, data.rightTitle || 'ВТОРАЯ СТОРОНА', Boolean(data.rightConfirmed));
    ctx.fillStyle = colors.purpleLight; ctx.font = 'bold 82px Arial'; ctx.textAlign = 'center'; ctx.fillText('↔', WIDTH / 2, 515); ctx.textAlign = 'left';
    ctx.fillStyle = colors.muted; ctx.font = 'bold 21px Arial'; ctx.textAlign = 'center';
    ctx.fillText(`Срок сделки: ${data.ttlMinutes ?? 10} минут • обе стороны должны подтвердить обмен`, WIDTH / 2, 805); ctx.textAlign = 'left';
    return canvas.toBuffer('image/png');
}
module.exports = { createTradePanel };
