const { createCanvas } = require('canvas');
const colors = require('../ui/colors');
const { drawBackground, drawFrame, drawHeader, drawPanel, drawProgressBar } = require('../ui/draw');
const WIDTH = 1600, HEIGHT = 900;

function drawPack(ctx, x, y, w, h, pack, balance, accent) {
    drawPanel(ctx, x, y, w, h, { fill: 'rgba(0,0,0,0.42)', stroke: accent });
    ctx.save();
    ctx.shadowColor = accent; ctx.shadowBlur = 24; ctx.strokeStyle = accent; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(x + 28, y + 28, 88, 88, 20); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.fillStyle = accent; ctx.font = 'bold 48px Arial'; ctx.textAlign = 'center';
    ctx.fillText(pack.id === 'base' ? 'B' : pack.id === 'premium' ? 'P' : pack.id === 'elite' ? 'E' : 'X', x + 72, y + 88);
    ctx.textAlign = 'left';
    ctx.fillStyle = colors.white; ctx.font = 'bold 31px Arial'; ctx.fillText(pack.name.toUpperCase(), x + 138, y + 62);
    ctx.fillStyle = accent; ctx.font = 'bold 25px Arial'; ctx.fillText(`${pack.cost} GS DUST`, x + 138, y + 100);
    ctx.fillStyle = colors.muted; ctx.font = '18px Arial';
    const rows = pack.chances.map(c => `${c.value.toUpperCase()} ${c.weight}%`);
    rows.forEach((row, i) => ctx.fillText(row, x + 38 + (i % 2) * 300, y + 135 + Math.floor(i / 2) * 25));
    const enough = balance >= pack.cost;
    const disabled = Boolean(pack.disabled);
    ctx.fillStyle = disabled ? colors.gold : enough ? colors.green : colors.red; ctx.font = 'bold 19px Arial';
    ctx.fillText(disabled ? 'СКОРО' : enough ? 'ДОСТУПЕН' : `НЕ ХВАТАЕТ ${pack.cost - balance}`, x + 38, y + h - 18);
    ctx.restore();
}

async function createCardShopPanel(user, data = {}) {
    const balance = data.balance ?? 0;
    const packs = Object.values(data.packs ?? {});
    const canvas = createCanvas(WIDTH, HEIGHT); const ctx = canvas.getContext('2d');
    drawBackground(ctx, WIDTH, HEIGHT, 'SHOP'); drawFrame(ctx, WIDTH, HEIGHT);
    drawHeader(ctx, 'CARD SHOP', `GAME SYNDICATE • ${(user.gsDisplayName || user.username).toUpperCase()}`, WIDTH);
    ctx.fillStyle = colors.gold; ctx.font = 'bold 30px Arial'; ctx.fillText(`БАЛАНС: ${balance} GS DUST`, 95, 220);
    ctx.fillStyle = colors.muted; ctx.font = '20px Arial'; ctx.fillText('Один пак = одна случайная карточка. Повторки разрешены. Treasure: отдельная проверка 0.02%.', 95, 258);
    const accents = [colors.green, colors.purpleLight, colors.gold, colors.purpleLight];
    packs.forEach((pack, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        drawPack(ctx, 85 + col * 755, 285 + row * 250, 675, 230, pack, balance, accents[i]);
    });
    const availablePacks = packs.filter(pack => !pack.disabled);
    const min = Math.min(...availablePacks.map(p => p.cost));
    drawProgressBar(ctx, 90, 805, 1420, 22, Math.min(balance, min), min, balance >= min ? colors.green : colors.red);
    ctx.fillStyle = balance >= min ? colors.green : colors.red; ctx.font = 'bold 21px Arial'; ctx.textAlign = 'center';
    ctx.fillText(balance >= min ? 'Можно купить Base Pack' : `До Base Pack не хватает ${min - balance} Dust`, WIDTH / 2, 850);
    return canvas.toBuffer('image/png');
}
module.exports = { createCardShopPanel };
