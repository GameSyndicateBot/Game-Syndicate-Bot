const { createCanvas, loadImage } = require('canvas');
const { getRequiredXP } = require('../../utils/levelSystem');
const achievements = require('../../data/achievements.json');
const { getEffectiveJoinedTimestamp, getEffectiveJoinedAt } = require('../../utils/memberJoinOverrides');

const { installIconRenderer, drawIcon: drawGsIcon } = require('../ui/icons');
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.closePath();
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

function getRank(level) {
    if (level >= 35) return 'Легенда';
    if (level >= 20) return 'Чемпион';
    if (level >= 10) return 'Воин';
    if (level >= 5) return 'Искатель';
    return 'Новичок';
}

function drawPanel(ctx, x, y, w, h, stroke = '#8B5CF6') {
    roundRect(ctx, x, y, w, h, 22);
    ctx.fillStyle = 'rgba(10, 3, 20, 0.78)';
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.stroke();
}

function drawStatBox(ctx, x, y, w, h, icon, value, label) {
    drawPanel(ctx, x, y, w, h, '#8B5CF6');

    const iconMap = { messages: 'message', achievements: 'trophy', calendar: 'calendar', clock: 'clock', rank: 'star', given: 'reaction', received: 'heart', points: 'trophy' };
    drawGsIcon(ctx, iconMap[icon] || icon, x + 22, y + 22, 56, '#C084FC');

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 58px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(String(value), x + w / 2 + 45, y + 76);

    ctx.fillStyle = '#C084FC';
    ctx.font = 'bold 25px Arial';
    ctx.fillText(label, x + w / 2, y + 122);

    ctx.textAlign = 'left';
}

function drawProgressBar(ctx, x, y, w, h, progress, text) {
    roundRect(ctx, x, y, w, h, 18);
    ctx.fillStyle = '#12071F';
    ctx.fill();

    const fillWidth = Math.max(h, w * progress);
    const grad = ctx.createLinearGradient(x, y, x + w, y);
    grad.addColorStop(0, '#6D28D9');
    grad.addColorStop(0.5, '#A855F7');
    grad.addColorStop(1, '#E879F9');

    roundRect(ctx, x, y, fillWidth, h, 18);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = '#C084FC';
    ctx.lineWidth = 3;
    roundRect(ctx, x, y, w, h, 18);
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 26px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(text, x + w / 2, y + 36);
    ctx.textAlign = 'left';
}

function drawRightStat(ctx, icon, label, value, x, y) {
    const iconMap = { calendar: 'calendar', clock: 'clock', rank: 'star', given: 'reaction', received: 'heart', points: 'trophy' };
    drawGsIcon(ctx, iconMap[icon] || icon, x, y - 34, 36, '#C084FC');

    ctx.fillStyle = '#C084FC';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(label, x + 44, y - 5);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 25px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(String(value), x + 335, y + 2);
    ctx.textAlign = 'left';

    ctx.strokeStyle = 'rgba(192, 132, 252, 0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + 22);
    ctx.lineTo(x + 335, y + 22);
    ctx.stroke();
}

async function createProfileCard(player, user, member) {
    const canvas = createCanvas(1600, 940);
    const ctx = canvas.getContext('2d');
    installIconRenderer(ctx);

    const avatar = await loadImage(user.displayAvatarURL({ extension: 'png', size: 512 }));

    const requiredXP = getRequiredXP(player.level);
    const progress = Math.min(player.xp / requiredXP, 1);
    const rank = getRank(player.level);
    const effectiveJoinedTimestamp = getEffectiveJoinedTimestamp(member);
    const effectiveJoinedAt = getEffectiveJoinedAt(member);
    const timeOnServer = formatTimeOnServer(effectiveJoinedTimestamp);
    const joinedDate = effectiveJoinedAt ? effectiveJoinedAt.toLocaleDateString('ru-RU') : '—';

    const totalAchievements = achievements.length;
    const achievementsText = `${player.achievements ?? 0} / ${totalAchievements}`;

    const bg = ctx.createLinearGradient(0, 0, 1600, 940);
    bg.addColorStop(0, '#030008');
    bg.addColorStop(0.45, '#160827');
    bg.addColorStop(1, '#05000A');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1600, 940);

    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#C084FC';
    ctx.font = 'bold 310px Arial';
    ctx.fillText('GS', 760, 360);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = '#8B5CF6';
    ctx.lineWidth = 6;
    roundRect(ctx, 35, 35, 1530, 870, 36);
    ctx.stroke();

    ctx.shadowColor = '#A855F7';
    ctx.shadowBlur = 35;
    ctx.strokeStyle = '#C084FC';
    ctx.lineWidth = 2;
    roundRect(ctx, 55, 55, 1490, 830, 26);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 40px Arial';
    ctx.fillText('GAME SYNDICATE', 165, 105);

    ctx.fillStyle = '#A855F7';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('PLAYER PROFILE', 165, 140);

    ctx.save();
    ctx.beginPath();
    ctx.arc(245, 315, 135, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, 110, 180, 270, 270);
    ctx.restore();

    ctx.shadowColor = '#A855F7';
    ctx.shadowBlur = 35;
    ctx.strokeStyle = '#C084FC';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(245, 315, 143, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 76px Arial';
    ctx.fillText((user.gsDisplayName || user.username).toUpperCase(), 470, 250);

    ctx.fillStyle = '#C084FC';
    ctx.font = 'bold 40px Arial';
    ctx.fillText(`УРОВЕНЬ ${player.level}`, 470, 315);

    ctx.fillStyle = '#C084FC';
    ctx.font = 'bold 36px Arial';
    ctx.fillText(`РАНГ: ${rank}`, 470, 375);

    ctx.fillStyle = '#C084FC';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('XP ДО СЛЕДУЮЩЕГО УРОВНЯ', 470, 435);

    drawProgressBar(ctx, 470, 460, 560, 52, progress, `${player.xp} / ${requiredXP} XP`);

    const leftToNext = Math.max(requiredXP - player.xp, 0);
    ctx.fillStyle = '#A78BFA';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`${leftToNext} XP до следующего уровня`, 750, 550);
    ctx.textAlign = 'left';

    drawStatBox(ctx, 100, 610, 430, 150, 'messages', player.messages, 'СООБЩЕНИЙ');
    drawStatBox(ctx, 570, 610, 430, 150, 'achievements', achievementsText, 'ДОСТИЖЕНИЙ');

    drawPanel(ctx, 1080, 190, 420, 650, '#8B5CF6');

    ctx.fillStyle = '#C084FC';
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('СТАТИСТИКА', 1290, 250);
    ctx.textAlign = 'left';

    drawRightStat(ctx, 'calendar', 'ВСТУПИЛ', joinedDate, 1120, 335);
    drawRightStat(ctx, 'clock', 'НА СЕРВЕРЕ', timeOnServer, 1120, 425);
    drawRightStat(ctx, 'rank', 'РАНГ', rank, 1120, 515);
    drawRightStat(ctx, 'given', 'РЕАКЦИЙ ПОСТАВИЛ', player.given_reactions ?? 0, 1120, 605);
    drawRightStat(ctx, 'received', 'РЕАКЦИЙ ПОЛУЧИЛ', player.received_reactions ?? 0, 1120, 695);
    drawRightStat(ctx, 'points', 'ACHIEVEMENT POINTS', player.achievement_points ?? 0, 1120, 785);

    return canvas.toBuffer('image/png');
}

module.exports = {
    createProfileCard,
};
