const { createCanvas } = require('canvas');

const { installIconRenderer } = require('../ui/icons');
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.closePath();
}

function getTheme(type) {
    const themes = {
        created: {
            title: 'ИГРОВОЙ ВЕЧЕР СОЗДАН',
            icon: 'EVT',
            color: '#8B5CF6',
            status: 'ОЖИДАНИЕ',
        }
        started: {
            title: 'ИГРОВОЙ ВЕЧЕР НАЧАЛСЯ',
            icon: 'LIVE',
            color: '#22C55E',
            status: 'ИДЁТ СЕЙЧАС',
        }
        finished: {
            title: 'ИГРОВОЙ ВЕЧЕР ЗАВЕРШЁН',
            icon: 'DONE',
            color: '#F59E0B',
            status: 'ЗАВЕРШЁН',
        }
    };

    return themes[type] || themes.created;
}

function drawBox(ctx, x, y, w, h, label, value, color) {
    roundRect(ctx, x, y, w, h, 20);
    ctx.fillStyle = 'rgba(10, 3, 20, 0.82)';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#A78BFA';
    ctx.font = 'bold 20px Arial';
    ctx.fillText(label, x + 24, y + 34);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 30px Arial';
    ctx.fillText(String(value ?? '—'), x + 24, y + 76);
}

async function createEventCard(type, data) {
    const canvas = createCanvas(1200, 720);
    const ctx = canvas.getContext('2d');
    installIconRenderer(ctx);
    const theme = getTheme(type);

    const bg = ctx.createLinearGradient(0, 0, 1200, 720);
    bg.addColorStop(0, '#030008');
    bg.addColorStop(0.45, '#160827');
    bg.addColorStop(1, '#05000A');

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1200, 720);

    ctx.globalAlpha = 0.08;
    ctx.fillStyle = theme.color;
    ctx.font = 'bold 260px Arial';
    ctx.fillText('GS', 735, 315);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = theme.color;
    ctx.lineWidth = 5;
    roundRect(ctx, 35, 35, 1130, 650, 36);
    ctx.stroke();

    ctx.shadowColor = theme.color;
    ctx.shadowBlur = 32;
    ctx.strokeStyle = theme.color;
    ctx.lineWidth = 2;
    roundRect(ctx, 55, 55, 1090, 610, 28);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 46px Arial';
    ctx.fillText(`${theme.icon} ${theme.title}`, 80, 115);

    ctx.fillStyle = theme.color;
    ctx.font = 'bold 24px Arial';
    ctx.fillText('GAME SYNDICATE • EVENT SYSTEM', 80, 155);

    drawBox(ctx, 80, 215, 500, 110, 'ИГРА', data.gameName, theme.color);
    drawBox(ctx, 620, 215, 500, 110, 'СТАТУС', theme.status, theme.color);

    drawBox(ctx, 80, 355, 320, 110, 'МИНИМУМ', `${data.minMinutes ?? 30} мин.`, theme.color);
    drawBox(ctx, 440, 355, 320, 110, 'УЧАСТНИКОВ', data.totalParticipants ?? '—', theme.color);
    drawBox(ctx, 800, 355, 320, 110, 'ЗАЧЁТ', data.countedParticipants ?? '—', theme.color);

    if (data.notCounted !== undefined) {
        drawBox(ctx, 80, 495, 320, 90, 'НЕ ХВАТИЛО', data.notCounted, theme.color);
    }

    if (data.reward) {
        drawBox(ctx, 440, 495, 320, 90, 'НАГРАДА', data.reward, theme.color);
    }

    if (data.leader) {
        drawBox(ctx, 800, 495, 320, 90, 'ЛИДЕР', data.leader, theme.color);
    }

    ctx.fillStyle = '#A78BFA';
    ctx.font = 'bold 22px Arial';
    ctx.fillText(data.footer || 'Game Syndicate • Игровые вечера', 80, 635);

    return canvas.toBuffer('image/png');
}

module.exports = {
    createEventCard,
};
