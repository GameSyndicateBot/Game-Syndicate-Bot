const { createCanvas } = require('canvas');
const colors = require('../ui/colors');
const { drawBackground, drawFrame, drawHeader, drawPanel, drawStatBox, drawTag } = require('../ui/draw');

const { installIconRenderer } = require('../ui/icons');
const WIDTH = 1600;
const HEIGHT = 900;

function truncate(text, max = 22) {
    const value = String(text ?? '');
    return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

async function createDustPanel(user, data = {}) {
    const balance = data.balance ?? 0;
    const duplicates = data.duplicates ?? [];
    const totalDuplicates = data.totalDuplicates ?? duplicates.length;
    const page = data.page ?? 1;
    const totalPages = data.totalPages ?? 1;
    const totalDust = data.totalDust ?? 0;

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');
    installIconRenderer(ctx);

    drawBackground(ctx, WIDTH, HEIGHT, 'DUST');
    drawFrame(ctx, WIDTH, HEIGHT);
    drawHeader(ctx, '✦ GS DUST', `GAME SYNDICATE • ${(user.gsDisplayName || user.username).toUpperCase()}`, WIDTH);

    drawStatBox(ctx, 90, 200, 440, 135, 'БАЛАНС', `✦ ${balance}`, colors.gold);
    drawStatBox(ctx, 580, 200, 440, 135, 'МОЖНО ПОЛУЧИТЬ', `✦ ${totalDust}`, colors.purpleLight);
    drawStatBox(ctx, 1070, 200, 440, 135, 'ПОВТОРОК', totalDuplicates, colors.green);

    drawPanel(ctx, 90, 375, 1420, 390);

    ctx.fillStyle = colors.white;
    ctx.font = 'bold 38px Arial';
    ctx.fillText('♻ ПОВТОРКИ ДЛЯ РАСПЫЛЕНИЯ', 130, 440);

    ctx.fillStyle = colors.muted;
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`Страница ${page} / ${totalPages}`, 1470, 440);
    ctx.textAlign = 'left';

    if (!duplicates.length) {
        ctx.fillStyle = colors.muted;
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Повторок для распыления пока нет', WIDTH / 2, 590);
        ctx.font = '24px Arial';
        ctx.fillText('Последние копии карточек защищены от случайного удаления', WIDTH / 2, 635);
        ctx.textAlign = 'left';
    } else {
        let y = 490;
        for (const item of duplicates.slice(0, 8)) {
            drawPanel(ctx, 130, y, 1340, 42, {
                radius: 14,
                fill: 'rgba(255,255,255,0.045)',
                stroke: 'rgba(192,132,252,0.20)',
                lineWidth: 1,
            });
            ctx.fillStyle = colors.white;
            ctx.font = 'bold 22px Arial';
            ctx.fillText(`${item.card.code} • ${truncate(item.card.name, 26)}`, 155, y + 28);
            ctx.fillStyle = colors.muted;
            ctx.font = 'bold 19px Arial';
            ctx.fillText(`${String(item.rarity).toUpperCase()} • ${String(item.edition).toUpperCase()}`, 600, y + 28);
            ctx.fillStyle = colors.gold;
            ctx.textAlign = 'right';
            ctx.font = 'bold 22px Arial';
            ctx.fillText(`+${item.dust} Dust`, 1445, y + 28);
            ctx.textAlign = 'left';
            y += 50;
        }
    }

    drawTag(ctx, 90, 802, 'РАСПЫЛЯЮТСЯ ТОЛЬКО ЛИШНИЕ КОПИИ', colors.green);
    drawTag(ctx, 560, 802, 'ВЫБЕРИ КАРТОЧКУ В МЕНЮ НИЖЕ', colors.purpleLight);

    return canvas.toBuffer('image/png');
}

module.exports = { createDustPanel };
