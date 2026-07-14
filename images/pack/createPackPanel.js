const { createCanvas } = require('canvas');

const colors = require('../ui/colors');
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

async function createPackPanel(user, data = {}) {
    const isReady = data.isReady ?? true;
    const statusText = isReady ? 'ГОТОВ К ОТКРЫТИЮ' : 'УЖЕ ОТКРЫТ СЕГОДНЯ';

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    drawBackground(ctx, WIDTH, HEIGHT, 'PACK');
    drawFrame(ctx, WIDTH, HEIGHT);
    drawHeader(ctx, '□ DAILY PACK', `GAME SYNDICATE • ${(user.gsDisplayName || user.username).toUpperCase()}`, WIDTH);

    drawPanel(ctx, 90, 205, 680, 560, {
        fill: 'rgba(0,0,0,0.42)',
        stroke: 'rgba(192, 132, 252, 0.42)',
    });

    ctx.shadowColor = colors.purpleLight;
    ctx.shadowBlur = 35;
    ctx.fillStyle = colors.violet;
    ctx.font = 'bold 220px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('▥', 430, 510);
    ctx.shadowBlur = 0;

    ctx.fillStyle = colors.white;
    ctx.font = 'bold 46px Arial';
    ctx.fillText('BASE 2026 PACK', 430, 650);
    ctx.textAlign = 'left';

    drawStatBox(ctx, 835, 205, 675, 145, 'СТАТУС', statusText, isReady ? colors.green : colors.red);

    drawPanel(ctx, 835, 390, 675, 375);

    ctx.fillStyle = colors.white;
    ctx.font = 'bold 38px Arial';
    ctx.fillText('Что внутри?', 880, 455);

    ctx.fillStyle = colors.muted;
    ctx.font = 'bold 24px Arial';
    ctx.fillText('Одна случайная коллекционная карточка', 880, 500);

    const chances = [
        ['COMMON', '50%', colors.common],
        ['RARE', '27%', colors.rare],
        ['EPIC', '14%', colors.epic],
        ['LEGENDARY', '5%', colors.legendary],
        ['MYTHIC', '2%', colors.mythic],
        ['EXCLUSIVE', '1.2%', '#E5E7EB'],
        ['HOLOGRAPHIC', '0.8%', '#22D3EE'],
        ['◆ TREASURE', '0.02%*', '#FBBF24'],
    ];

    // Compact layout so all eight rarities stay inside the panel.
    let y = 526;

    for (const [name, percent, color] of chances) {
        ctx.fillStyle = color;
        ctx.font = 'bold 21px Arial';
        ctx.fillText(name, 880, y);

        ctx.fillStyle = colors.white;
        ctx.textAlign = 'right';
        ctx.fillText(percent, 1435, y);
        ctx.textAlign = 'left';

        y += 28;
    }

    ctx.fillStyle = colors.muted;
    ctx.font = 'bold 14px Arial';
    ctx.fillText('* отдельная проверка; максимум 1 TREASURE в месяц', 880, 754);

    drawTag(
        ctx,
        90,
        810,
        isReady ? 'НАЖМИ КНОПКУ, ЧТОБЫ ОТКРЫТЬ' : 'СЛЕДУЮЩИЙ ПАК БУДЕТ ЗАВТРА',
        isReady ? colors.green : colors.red
    );

    return canvas.toBuffer('image/png');
}

module.exports = {
    createPackPanel,
};
