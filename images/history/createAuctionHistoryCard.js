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
    if (status === 'sold') return { label: 'ПРОДАНО', color: colors.green };
    if (status === 'cancelled') return { label: 'СНЯТО', color: colors.red };
    if (status === 'expired') return { label: 'ИСТЕКЛО', color: colors.gold };
    return { label: 'АКТИВНО', color: colors.purpleLight };
}

async function drawThumb(ctx, card, x, y, w, h) {
    const accent = card ? (RARITY[card.rarity] || colors.gold) : colors.muted;
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

async function createAuctionHistoryCard(data = {}) {
    const entries = data.entries || [];
    const height = Math.max(900, TOP + entries.length * ROW_H + BOTTOM);
    const canvas = createCanvas(WIDTH, height), ctx = canvas.getContext('2d');
    drawBackground(ctx, WIDTH, height, 'AUCTION HISTORY'); drawFrame(ctx, WIDTH, height);
    drawHeader(ctx, '◇ ИСТОРИЯ АУКЦИОНА', `GAME SYNDICATE • ${data.ownerName || 'УЧАСТНИК'}`, WIDTH);

    if (!entries.length) {
        drawPanel(ctx, 100, 250, 1400, 380, { fill: 'rgba(0,0,0,0.42)', stroke: colors.gold, lineWidth: 3, radius: 30 });
        ctx.fillStyle = colors.white; ctx.font = 'bold 42px Arial'; ctx.textAlign = 'center'; ctx.fillText('ИСТОРИЯ ПОКА ПУСТА', WIDTH / 2, 420);
        ctx.fillStyle = colors.muted; ctx.font = '25px Arial'; ctx.fillText('Продажи, покупки и закрытые объявления появятся здесь', WIDTH / 2, 480); ctx.textAlign = 'left';
        return canvas.toBuffer('image/png');
    }

    for (let i = 0; i < entries.length; i++) {
        const e = entries[i], y = TOP + i * ROW_H, meta = statusMeta(e.status);
        drawPanel(ctx, 72, y, 1456, 88, { fill: i % 2 ? 'rgba(15,8,28,0.68)' : 'rgba(6,4,15,0.72)', stroke: 'rgba(234,179,8,0.34)', lineWidth: 2, radius: 20 });
        await drawThumb(ctx, e.card, 92, y + 10, 54, 68);
        ctx.fillStyle = colors.purpleLight; ctx.font = 'bold 19px Arial'; ctx.fillText(`#${e.id}`, 165, y + 26);
        ctx.fillStyle = e.card ? (RARITY[e.card.rarity] || colors.white) : colors.muted;
        drawAutoText(ctx, e.card ? `${e.card.code} • ${e.card.name}  #${String(e.card.copy_number).padStart(6, '0')}` : 'Карточка недоступна', 165, y + 58, 430, 25, { minSize: 15 });

        ctx.fillStyle = colors.muted; ctx.font = '18px Arial'; ctx.fillText('Продавец', 620, y + 28);
        ctx.fillStyle = colors.white; drawAutoText(ctx, e.sellerName || 'Участник', 620, y + 58, 250, 24, { minSize: 16 });
        ctx.fillStyle = colors.muted; ctx.font = '18px Arial'; ctx.fillText(e.buyerName ? 'Покупатель' : 'Результат', 885, y + 28);
        ctx.fillStyle = colors.white; drawAutoText(ctx, e.buyerName || e.resultText || '—', 885, y + 58, 230, 24, { minSize: 16 });

        ctx.fillStyle = colors.gold; ctx.font = 'bold 27px Arial'; ctx.textAlign = 'right'; ctx.fillText(`${Number(e.price || 0).toLocaleString('ru-RU')} DUST`, 1320, y + 53); ctx.textAlign = 'left';
        drawTag(ctx, 1378, y + 17, meta.label, meta.color);
        ctx.fillStyle = colors.muted; ctx.font = 'bold 16px Arial'; ctx.textAlign = 'right'; ctx.fillText(e.dateLabel || '—', 1504, y + 73); ctx.textAlign = 'left';
    }

    ctx.fillStyle = colors.muted; ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center';
    ctx.fillText(`Показаны последние ${entries.length} объявлений`, WIDTH / 2, height - 40); ctx.textAlign = 'left';
    return canvas.toBuffer('image/png');
}

module.exports = { createAuctionHistoryCard };
