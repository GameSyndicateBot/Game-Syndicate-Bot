const { createCanvas } = require('canvas');

const { normalizeServerNickname } = require('../../utils/displayName');
const { installIconRenderer } = require('../ui/icons');
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.closePath();
}

function formatVoice(seconds) {
    const hours = Math.floor((seconds || 0) / 3600);
    const minutes = Math.floor(((seconds || 0) % 3600) / 60);

    if (hours > 0) return `${hours} ч. ${minutes} мин.`;
    return `${minutes} мин.`;
}

function formatValue(player, type) {
    switch (type) {
        case 'xp':
            return `${player.xp} XP • ${player.level} ур.`;
        case 'messages':
            return `${player.messages} сообщений`;
        case 'voice':
            return formatVoice(player.voice_seconds);
        case 'achievements':
            return `${player.achievements} достижений`;
        case 'given_reactions':
            return `${player.given_reactions ?? 0} реакций`;
        case 'received_reactions':
            return `${player.received_reactions ?? 0} реакций`;
        case 'achievement_points':
            return `${player.achievement_points ?? 0} AP`;
        case 'events':
            return `${player.events_count ?? 0} вечеров`;
        default:
            return '';
    }
}

function getTitle(type) {
    const titles = {
        xp: '⬆ ТОП ПО XP',
        messages: '💬 ТОП ПО СООБЩЕНИЯМ',
        voice: '🎤 ТОП ПО ГОЛОСОВОМУ',
        achievements: '🏆 ТОП ПО ДОСТИЖЕНИЯМ',
        given_reactions: '+ ТОП ПО ПОСТАВЛЕННЫМ РЕАКЦИЯМ',
        received_reactions: '❤ ТОП ПО ПОЛУЧЕННЫМ РЕАКЦИЯМ',
        achievement_points: '★ ТОП ПО ACHIEVEMENT POINTS',
        events: '◆ ТОП ПО ИГРОВЫМ ВЕЧЕРАМ',
    };

    return titles[type] || 'ЛИДЕРБОРД';
}

async function createTopCard(players, type, meta = {}) {
    const canvas = createCanvas(1200, 850);
    const ctx = canvas.getContext('2d');
    installIconRenderer(ctx);

    const bg = ctx.createLinearGradient(0, 0, 1200, 850);
    bg.addColorStop(0, '#030008');
    bg.addColorStop(0.45, '#160827');
    bg.addColorStop(1, '#05000A');

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1200, 850);

    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#C084FC';
    ctx.font = 'bold 260px Arial';
    ctx.fillText('GS', 710, 290);
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
    ctx.font = 'bold 42px Arial';
    ctx.fillText(getTitle(type), 90, 115);

    ctx.fillStyle = '#A855F7';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('GAME SYNDICATE • ЛИДЕРБОРД', 90, 155);

    ctx.fillStyle = '#A78BFA';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(
        `Страница ${meta.page ?? 1} / ${meta.totalPages ?? 1}`,
        1110,
        155
    );
    ctx.textAlign = 'left';

    const startY = 210;
    const gap = 70;

    for (let i = 0; i < players.length; i++) {
        const player = players[i];
        const y = startY + i * gap;
        const globalPlace = (meta.offset ?? 0) + i + 1;

        roundRect(ctx, 90, y, 1020, 54, 14);

        ctx.fillStyle =
            globalPlace <= 3
                ? 'rgba(139,92,246,0.22)'
                : 'rgba(139,92,246,0.10)';
        ctx.fill();

        ctx.strokeStyle =
            globalPlace <= 3
                ? '#C084FC'
                : 'rgba(192,132,252,0.35)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#C084FC';
        ctx.font = 'bold 25px Arial';
        ctx.fillText(`#${globalPlace}`, 120, y + 36);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 25px Arial';
        ctx.fillText(normalizeServerNickname(player.username), 210, y + 36);

        ctx.fillStyle = '#A78BFA';
        ctx.font = 'bold 23px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(formatValue(player, type), 1070, y + 36);
        ctx.textAlign = 'left';
    }

    if (!players.length) {
        ctx.fillStyle = '#A78BFA';
        ctx.font = 'bold 30px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Пока нет данных', 600, 430);
        ctx.textAlign = 'left';
    }

    return canvas.toBuffer('image/png');
}

module.exports = {
    createTopCard,
};
