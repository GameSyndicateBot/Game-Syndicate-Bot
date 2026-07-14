const { createCanvas } = require('canvas');

const { normalizeServerNickname } = require('../../utils/displayName');
const { installIconRenderer } = require('../ui/icons');
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.closePath();
}

const icons = {
    daily_claim: '▲',
    chat: '●',
    voice: '◉',
    given_reactions: '+',
    received_reactions: '♥',
    achievement: '★',
    level_up: '★',
    event: '◆',
};

async function createStreakTopCard(players, type, mode, title) {
    const canvas = createCanvas(1200, 850);
    const ctx = canvas.getContext('2d');
    installIconRenderer(ctx);

    const bg = ctx.createLinearGradient(0, 0, 1200, 850);
    bg.addColorStop(0, '#030008');
    bg.addColorStop(0.45, '#160827');
    bg.addColorStop(1, '#05000A');

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1200, 850);

    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#C084FC';
    ctx.font = 'bold 230px Arial';
    ctx.fillText('STREAK', 400, 300);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = '#8B5CF6';
    ctx.lineWidth = 5;
    roundRect(ctx, 35, 35, 1130, 780, 34);
    ctx.stroke();

    ctx.shadowColor = '#A855F7';
    ctx.shadowBlur = 30;
    ctx.strokeStyle = '#C084FC';
    ctx.lineWidth = 2;
    roundRect(ctx, 52, 52, 1096, 746, 26);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 44px Arial';
    ctx.fillText(`${icons[type] || '▲'} ТОП СЕРИЙ`, 90, 115);

    ctx.fillStyle = '#A855F7';
    ctx.font = 'bold 25px Arial';
    ctx.fillText(`${title.toUpperCase()} • ${mode === 'best' ? 'РЕКОРД' : 'ТЕКУЩАЯ СЕРИЯ'}`, 90, 155);

    const startY = 220;
    const gap = 66;

    for (let i = 0; i < players.length; i++) {
        const player = players[i];
        const y = startY + i * gap;
        const place = i + 1;
        const value = mode === 'best' ? player.best : player.current;

        roundRect(ctx, 90, y, 1020, 52, 14);
        ctx.fillStyle = place <= 3
            ? 'rgba(139, 92, 246, 0.22)'
            : 'rgba(139, 92, 246, 0.10)';
        ctx.fill();

        ctx.strokeStyle = place <= 3
            ? '#C084FC'
            : 'rgba(192, 132, 252, 0.35)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = place <= 3 ? '#FBBF24' : '#C084FC';
        ctx.font = 'bold 24px Arial';
        ctx.fillText(`#${place}`, 120, y + 35);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 24px Arial';
        ctx.fillText(normalizeServerNickname(player.username || player.user_id), 210, y + 35);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#FBBF24';
        ctx.font = 'bold 25px Arial';
        ctx.fillText(`${value ?? 0} дн.`, 1070, y + 35);
        ctx.textAlign = 'left';
    }

    if (!players.length) {
        ctx.fillStyle = '#A78BFA';
        ctx.font = 'bold 30px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Пока нет данных по этой серии', 600, 430);
        ctx.textAlign = 'left';
    }

    ctx.fillStyle = '#A78BFA';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('GAME SYNDICATE • STREAK LEADERBOARD', 600, 765);
    ctx.textAlign = 'left';

    return canvas.toBuffer('image/png');
}

module.exports = {
    createStreakTopCard,
};
