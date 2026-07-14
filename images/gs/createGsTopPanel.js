const { createCanvas } = require('canvas');
const colors = require('../ui/colors');
const { installIconRenderer } = require('../ui/icons');
const {
    drawBackground,
    drawFrame,
    drawHeader,
    drawPanel,
} = require('../ui/draw');
const { normalizeServerNickname } = require('../../utils/displayName');

const WIDTH = 1600;
const HEIGHT = 900;

const labels = {
    xp: 'XP',
    messages: 'Сообщения',
    voice: 'Голосовой онлайн',
    achievements: 'Достижения',
    given_reactions: 'Поставленные реакции',
    received_reactions: 'Полученные реакции',
    achievement_points: 'Achievement Points',
    events: 'Игровые вечера',
};

function fitText(ctx, text, maxWidth, fontSize, fontWeight = 'bold', fontFamily = 'Arial', minSize = 16) {
    let size = fontSize;
    const value = String(text ?? '');

    while (size > minSize) {
        ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
        if (ctx.measureText(value).width <= maxWidth) return value;
        size -= 2;
    }

    ctx.font = `${fontWeight} ${size}px ${fontFamily}`;
    let clipped = value;
    while (clipped.length > 2 && ctx.measureText(`${clipped}…`).width > maxWidth) {
        clipped = clipped.slice(0, -1);
    }

    return `${clipped}…`;
}

function formatValue(player, type) {
    if (type === 'voice') {
        const seconds = player.voice_seconds ?? 0;
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);

        if (hours > 0) return `${hours}ч ${minutes}м`;
        return `${minutes}м`;
    }

    if (type === 'events') return player.events_count ?? 0;
    if (type === 'xp') return player.total_xp ?? player.xp ?? 0;

    return player[type] ?? 0;
}

function valueLabel(type) {
    return {
        xp: 'XP',
        messages: 'сообщений',
        voice: 'в голосе',
        achievements: 'достижений',
        given_reactions: 'поставил',
        received_reactions: 'получил',
        achievement_points: 'points',
        events: 'вечеров',
    }[type] ?? '';
}

function drawMedal(ctx, rank, x, y) {
    const medal = rank === 1 ? '1' : rank === 2 ? '2' : rank === 3 ? '3' : `#${rank}`;

    ctx.fillStyle = rank <= 3 ? colors.gold : colors.muted;
    ctx.font = rank <= 3 ? 'bold 38px Arial' : 'bold 34px Arial';
    ctx.fillText(medal, x, y);
}

function drawRankCard(ctx, player, rank, y, type) {
    const topAccent = rank === 1
        ? colors.gold
        : rank === 2
            ? '#D1D5DB'
            : rank === 3
                ? colors.orange
                : 'rgba(192,132,252,0.40)';

    const fill = rank <= 3
        ? 'rgba(139,92,246,0.15)'
        : 'rgba(255,255,255,0.045)';

    drawPanel(ctx, 130, y, 1340, 92, {
        fill,
        stroke: topAccent,
        radius: 24,
        lineWidth: rank <= 3 ? 3 : 1,
    });

    drawMedal(ctx, rank, 165, y + 59);

    ctx.fillStyle = colors.white;
    const safeName = fitText(ctx, normalizeServerNickname(player.username ?? 'Unknown'), 430, 31);
    ctx.fillText(safeName, 270, y + 41);

    ctx.fillStyle = colors.muted;
    ctx.font = 'bold 22px Arial';
    ctx.fillText(`LEVEL ${player.level ?? 1}`, 270, y + 73);

    ctx.fillStyle = colors.purpleLight;
    ctx.font = 'bold 22px Arial';
    ctx.fillText(valueLabel(type), 720, y + 59);

    ctx.fillStyle = rank <= 3 ? colors.gold : colors.white;
    ctx.font = 'bold 34px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(fitText(ctx, String(formatValue(player, type)), 330, 34), 1425, y + 59);
    ctx.textAlign = 'left';
}

async function createGsTopPanel(players, type, data = {}) {
    const page = data.page ?? 1;
    const totalPages = data.totalPages ?? 1;
    const offset = data.offset ?? 0;
    const label = data.label ?? labels[type] ?? type;

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');
    installIconRenderer(ctx);

    drawBackground(ctx, WIDTH, HEIGHT, 'TOP');
    drawFrame(ctx, WIDTH, HEIGHT);
    drawHeader(ctx, '★ GS LEADERBOARD', `GAME SYNDICATE • ${String(label).toUpperCase()}`, WIDTH);

    drawPanel(ctx, 90, 185, 1420, 95, {
        fill: 'rgba(0,0,0,0.36)',
        stroke: 'rgba(192,132,252,0.42)',
        radius: 26,
    });

    ctx.fillStyle = colors.white;
    const safeTitle = fitText(ctx, `Рейтинг: ${label}`, 900, 36);
    ctx.fillText(safeTitle, 130, 245);

    ctx.fillStyle = colors.muted;
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`Страница ${page} / ${totalPages}`, 1470, 245);
    ctx.textAlign = 'left';

    let y = 315;

    if (!players.length) {
        ctx.fillStyle = colors.muted;
        ctx.font = 'bold 34px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Пока нет игроков в рейтинге', WIDTH / 2, 520);
        ctx.textAlign = 'left';
    } else {
        players.slice(0, 5).forEach((player, index) => {
            drawRankCard(ctx, player, offset + index + 1, y, type);
            y += 104;
        });
    }

    // Нижнюю подпись убрали полностью: теперь у leaderboard есть безопасная зона,
    // и карточки никогда не пересекают рамку снизу.

    return canvas.toBuffer('image/png');
}

module.exports = {
    createGsTopPanel,
};
