const { createCanvas, loadImage } = require('canvas');
const colors = require('../ui/colors');
const { getServerDisplayName } = require('../../utils/displayName');
const { installIconRenderer, drawIcon: drawGsIcon } = require('../ui/icons');
const { getEffectiveJoinedTimestamp, getEffectiveJoinedAt } = require('../../utils/memberJoinOverrides');
const {
    drawBackground,
    drawFrame,
    drawHeader,
    drawPanel,
    drawProgressBar,
} = require('../ui/draw');

const WIDTH = 1600;
const HEIGHT = 900;

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
    while (clipped.length > 3 && ctx.measureText(`${clipped}…`).width > maxWidth) {
        clipped = clipped.slice(0, -1);
    }

    return `${clipped}…`;
}

function getRank(level) {
    if (level >= 35) return 'Легенда';
    if (level >= 20) return 'Чемпион';
    if (level >= 10) return 'Воин';
    if (level >= 5) return 'Искатель';
    return 'Новичок';
}

function formatDate(date) {
    if (!date) return '—';
    try {
        return date.toLocaleDateString('ru-RU');
    } catch (_) {
        return '—';
    }
}

function formatTimeOnServer(joinedTimestamp) {
    if (!joinedTimestamp) return '—';

    const hours = Math.floor((Date.now() - joinedTimestamp) / 1000 / 60 / 60);
    const days = Math.floor(hours / 24);

    if (days >= 365) return `${Math.floor(days / 365)} г. ${Math.floor((days % 365) / 30)} мес.`;
    if (days >= 30) return `${Math.floor(days / 30)} мес. ${days % 30} дн.`;
    if (days >= 1) return `${days} дн. ${hours % 24} ч.`;
    return `${hours} ч.`;
}

async function drawAvatar(ctx, user, x, y, size) {
    try {
        const url = user.displayAvatarURL({
            extension: 'png',
            size: 512,
        });

        const img = await loadImage(url);

        ctx.save();
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(img, x, y, size, size);
        ctx.restore();

        ctx.shadowColor = colors.violet;
        ctx.shadowBlur = 26;
        ctx.strokeStyle = colors.purpleLight;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2 + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
    } catch (_) {
        ctx.fillStyle = colors.violet;
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = colors.white;
        ctx.font = 'bold 70px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('GS', x + size / 2, y + size / 2 + 24);
        ctx.textAlign = 'left';
    }
}

function drawSimpleIcon(ctx, type, x, y, accent, size = 28) {
    const aliases = {
        messages: 'message', voice: 'voice', collection: 'card', achievements: 'trophy',
        calendar: 'calendar', clock: 'clock', reactions: 'reaction', dust: 'dust', xp: 'star'
    };
    drawGsIcon(ctx, aliases[type] || type, x, y - size, size, accent);
}

function drawMiniStat(ctx, x, y, w, h, iconType, label, value, accent = colors.purpleLight) {
    drawPanel(ctx, x, y, w, h, {
        fill: 'rgba(139,92,246,0.10)',
        stroke: 'rgba(192,132,252,0.35)',
        radius: 22,
    });

    drawSimpleIcon(ctx, iconType, x + 24, y + 58, accent, 42);

    ctx.fillStyle = colors.muted;
    ctx.font = 'bold 18px Arial';
    ctx.fillText(label, x + 86, y + 34);

    ctx.fillStyle = colors.white;
    ctx.font = 'bold 30px Arial';
    ctx.fillText(fitText(ctx, value, w - 110, 30), x + 86, y + 72);
}

function drawRightStat(ctx, x, y, iconType, label, value) {
    drawSimpleIcon(ctx, iconType, x, y + 3, colors.purpleLight, 36);

    ctx.fillStyle = colors.muted;
    ctx.font = 'bold 17px Arial';
    ctx.fillText(label, x + 54, y - 7);

    ctx.fillStyle = colors.white;
    ctx.font = 'bold 25px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(fitText(ctx, value, 220, 25), x + 380, y + 1);
    ctx.textAlign = 'left';

    ctx.strokeStyle = 'rgba(192,132,252,0.20)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + 25);
    ctx.lineTo(x + 380, y + 25);
    ctx.stroke();
}

async function createGsProfilePanel(user, member, data = {}) {
    const player = data.player ?? {};
    const level = player.level ?? 1;
    const xp = player.xp ?? 0;
    const requiredXP = data.requiredXP ?? 150;
    const leftXP = Math.max(requiredXP - xp, 0);
    const dust = data.dust ?? 0;
    const cardStats = data.cardStats ?? { unique: 0, available: 0, total: 0 };
    const achievements = data.achievements ?? 0;
    const totalAchievements = data.totalAchievements ?? 0;
    const rank = getRank(level);
    const displayName = getServerDisplayName(member, user);

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');
    installIconRenderer(ctx);

    drawBackground(ctx, WIDTH, HEIGHT, 'PROFILE');
    drawFrame(ctx, WIDTH, HEIGHT);
    drawHeader(ctx, '👤 GS PROFILE', `GAME SYNDICATE • ${displayName.toUpperCase()}`, WIDTH);

    drawPanel(ctx, 90, 190, 520, 620, {
        fill: 'rgba(0,0,0,0.42)',
        stroke: 'rgba(192,132,252,0.42)',
        radius: 32,
    });

    await drawAvatar(ctx, user, 245, 230, 210);

    ctx.fillStyle = colors.white;
    ctx.textAlign = 'center';
    const safeUsername = fitText(ctx, displayName, 430, 46);
    ctx.fillText(safeUsername, 350, 505);

    ctx.fillStyle = colors.gold;
    ctx.font = 'bold 32px Arial';
    ctx.fillText(`LEVEL ${level}`, 350, 555);

    ctx.fillStyle = colors.purpleLight;
    ctx.font = 'bold 25px Arial';
    ctx.fillText(`Ранг: ${rank}`, 350, 598);
    ctx.textAlign = 'left';

    drawProgressBar(ctx, 155, 650, 390, 28, xp, requiredXP, colors.gold);

    ctx.fillStyle = colors.white;
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${xp} / ${requiredXP} XP`, 350, 705);

    ctx.fillStyle = colors.muted;
    ctx.font = 'bold 18px Arial';
    ctx.fillText(`${leftXP} XP до следующего уровня`, 350, 735);
    ctx.textAlign = 'left';

    drawMiniStat(ctx, 660, 190, 390, 105, 'xp', 'XP', String(xp), colors.gold);
    drawMiniStat(ctx, 1090, 190, 420, 105, 'dust', 'GS DUST', String(dust), colors.gold);

    drawMiniStat(ctx, 660, 320, 390, 105, 'messages', 'СООБЩЕНИЯ', String(player.messages ?? 0), colors.purpleLight);
    drawMiniStat(ctx, 1090, 320, 420, 105, 'voice', 'ГОЛОС', `${Math.floor((player.voice_seconds ?? 0) / 60)} мин`, colors.green);

    drawMiniStat(ctx, 660, 450, 390, 105, 'collection', 'КОЛЛЕКЦИЯ', `${cardStats.unique}/${cardStats.available}`, colors.violet);
    drawMiniStat(ctx, 1090, 450, 420, 105, 'achievements', 'ДОСТИЖЕНИЯ', totalAchievements ? `${achievements}/${totalAchievements}` : String(achievements), colors.orange);

    drawPanel(ctx, 660, 585, 850, 225, {
        fill: 'rgba(0,0,0,0.36)',
        stroke: 'rgba(192,132,252,0.40)',
        radius: 28,
    });

    ctx.fillStyle = colors.white;
    ctx.font = 'bold 32px Arial';
    ctx.fillText('СТАТИСТИКА', 700, 645);

    const effectiveJoinedAt = getEffectiveJoinedAt(member);
    const effectiveJoinedTimestamp = getEffectiveJoinedTimestamp(member);
    drawRightStat(ctx, 700, 700, 'calendar', 'ВСТУПИЛ', formatDate(effectiveJoinedAt));
    drawRightStat(ctx, 700, 760, 'clock', 'НА СЕРВЕРЕ', formatTimeOnServer(effectiveJoinedTimestamp));

    drawRightStat(ctx, 1085, 700, 'reactions', 'РЕАКЦИЙ ПОСТАВИЛ', String(player.given_reactions ?? 0));
    drawRightStat(ctx, 1085, 760, 'reactions', 'РЕАКЦИЙ ПОЛУЧИЛ', String(player.received_reactions ?? 0));

    return canvas.toBuffer('image/png');
}

module.exports = {
    createGsProfilePanel,
};
