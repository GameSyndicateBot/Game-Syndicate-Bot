const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const colors = require('../ui/colors');
const { drawBackground, drawFrame, drawHeader, drawPanel, drawTag, drawAutoText, roundRect } = require('../ui/draw');

const { installIconRenderer } = require('../ui/icons');
const WIDTH = 1600;
const ROW_H = 104;
const TOP = 205;
const BOTTOM = 85;
const RARITY = { common: colors.common, rare: colors.rare, epic: colors.epic, legendary: colors.legendary, mythic: colors.mythic, exclusive: '#22D3EE', holographic: '#F472B6', treasure: colors.gold };

function statusMeta(status) {
    if (status === 'completed') return { label: 'ЗАВЕРШЁН', color: colors.green };
    if (status === 'cancelled') return { label: 'ОТМЕНЁН', color: colors.red };
    return { label: 'ИСТЁК', color: colors.gold };
}

async function drawThumb(ctx, card, x, y, w, h) {
    const accent = card ? (RARITY[card.rarity] || colors.purpleLight) : colors.muted;
    roundRect(ctx, x, y, w, h, 14); ctx.save(); ctx.clip();
    if (card?.image) {
        try {
            const img = await loadImage(path.resolve(process.cwd(), card.image));
            const s = Math.max(w / img.width, h / img.height), sw = w / s, sh = h / s;
            ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
        } catch (_) { ctx.fillStyle = colors.dark; ctx.fillRect(x, y, w, h); }
    } else { ctx.fillStyle = colors.dark; ctx.fillRect(x, y, w, h); }
    ctx.restore(); ctx.strokeStyle = accent; ctx.lineWidth = 2; roundRect(ctx, x, y, w, h, 14); ctx.stroke();
}

async function createTradeHistoryCard(data = {}) {
    const entries = data.entries || [];
    const height = Math.max(900, TOP + entries.length * ROW_H + BOTTOM);
    const canvas = createCanvas(WIDTH, height), ctx = canvas.getContext('2d');
    drawBackground(ctx, WIDTH, height, 'TRADE HISTORY'); drawFrame(ctx, WIDTH, height);
    drawHeader(ctx, '↻ ИСТОРИЯ ОБМЕНОВ', `GAME SYNDICATE • ${data.ownerName || 'УЧАСТНИК'}`, WIDTH);

    if (!entries.length) {
        drawPanel(ctx, 100, 250, 1400, 380, { fill: 'rgba(0,0,0,0.42)', stroke: colors.purpleLight, lineWidth: 3, radius: 30 });
        ctx.fillStyle = colors.white; ctx.font = 'bold 42px Arial'; ctx.textAlign = 'center'; ctx.fillText('ИСТОРИЯ ПОКА ПУСТА', WIDTH / 2, 420);
        ctx.fillStyle = colors.muted; ctx.font = '25px Arial'; ctx.fillText('Завершённые, отменённые и истёкшие сделки появятся здесь', WIDTH / 2, 480); ctx.textAlign = 'left';
        return canvas.toBuffer('image/png');
    }

    for (let i = 0; i < entries.length; i++) {
        const e = entries[i], y = TOP + i * ROW_H;
        const meta = statusMeta(e.status);
        drawPanel(ctx, 72, y, 1456, 88, { fill: i % 2 ? 'rgba(15,8,28,0.68)' : 'rgba(6,4,15,0.72)', stroke: 'rgba(168,85,247,0.42)', lineWidth: 2, radius: 20 });
        await drawThumb(ctx, e.left, 92, y + 10, 54, 68);
        await drawThumb(ctx, e.right, 828, y + 10, 54, 68);

        ctx.fillStyle = colors.purpleLight; ctx.font = 'bold 19px Arial'; ctx.fillText(`#${e.id}`, 165, y + 26);
        ctx.fillStyle = colors.white; drawAutoText(ctx, e.leftName || 'Участник', 165, y + 52, 250, 24, { minSize: 16 });
        ctx.fillStyle = e.left ? (RARITY[e.left.rarity] || colors.text) : colors.muted;
        drawAutoText(ctx, e.left ? `${e.left.name}  #${String(e.left.copy_number).padStart(6, '0')}` : 'Карточка недоступна', 425, y + 52, 300, 21, { minSize: 14 });

        ctx.fillStyle = colors.purpleLight; ctx.font = 'bold 34px Arial'; ctx.textAlign = 'center'; ctx.fillText('↔', 785, y + 56); ctx.textAlign = 'left';

        ctx.fillStyle = colors.white; drawAutoText(ctx, e.rightName || 'Участник', 900, y + 52, 240, 24, { minSize: 16 });
        ctx.fillStyle = e.right ? (RARITY[e.right.rarity] || colors.text) : colors.muted;
        drawAutoText(ctx, e.right ? `${e.right.name}  #${String(e.right.copy_number).padStart(6, '0')}` : 'Карточка не выбрана', 1145, y + 52, 220, 21, { minSize: 13 });

        drawTag(ctx, 1378, y + 17, meta.label, meta.color);
        ctx.fillStyle = colors.muted; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'right'; ctx.fillText(e.dateLabel || '—', 1504, y + 73); ctx.textAlign = 'left';
    }

    ctx.fillStyle = colors.muted; ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center';
    ctx.fillText(`Показаны последние ${entries.length} сделок`, WIDTH / 2, height - 40); ctx.textAlign = 'left';
    return canvas.toBuffer('image/png');
}

module.exports = { createTradeHistoryCard };
