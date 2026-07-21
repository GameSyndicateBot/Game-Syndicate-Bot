const { createCanvas, loadImage } = require('canvas');

const { installIconRenderer } = require('../ui/icons');
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.closePath();
}

function drawCrown(ctx, x, y, size = 20, color = '#FBBF24') {
    const w = size * 1.35;
    const h = size;

    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, size * 0.09);
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(x, y + h * 0.35);
    ctx.lineTo(x + w * 0.18, y + h * 0.72);
    ctx.lineTo(x + w * 0.38, y + h * 0.22);
    ctx.lineTo(x + w * 0.56, y + h * 0.72);
    ctx.lineTo(x + w * 0.82, y + h * 0.18);
    ctx.lineTo(x + w, y + h * 0.72);
    ctx.lineTo(x + w * 0.93, y + h);
    ctx.lineTo(x + w * 0.08, y + h);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x + w * 0.1, y + h * 1.1);
    ctx.lineTo(x + w * 0.91, y + h * 1.1);
    ctx.stroke();
    ctx.restore();
}

const streakConfig = [
    { type: 'daily_claim', icon: '▲', title: 'Ежедневные задания' }
    { type: 'chat', icon: '●', title: 'Серия сообщений' }
    { type: 'voice', icon: '◉', title: 'Голосовая активность' }
    { type: 'given_reactions', icon: '+', title: 'Выданные реакции' }
    { type: 'received_reactions', icon: '♥', title: 'Полученные реакции' }
    { type: 'achievement', icon: '★', title: 'Достижения' }
    { type: 'level_up', icon: '★', title: 'Повышение уровня' }
    { type: 'event', icon: '◆', title: 'Игровые вечера' }
];

function getStreakValue(streaks, type, field) {
    const streak = streaks.find(item => item.type === type);
    return streak?.[field] ?? 0;
}

function getBestStreak(streaks) {
    let best = null;

    for (const config of streakConfig) {
        const streak = streaks.find(item => item.type === config.type);
        const bestValue = streak?.best ?? 0;

        if (!best || bestValue > best.best) {
            best = {
                ...config,
                best: bestValue,
                current: streak?.current ?? 0,
            };
        }
    }

    return best;
}

function getActiveStreaksCount(streaks) {
    return streakConfig.filter(config =>
        getStreakValue(streaks, config.type, 'current') > 0
    ).length;
}

function getTotalCurrentDays(streaks) {
    return streakConfig.reduce((sum, config) => {
        return sum + getStreakValue(streaks, config.type, 'current');
    }, 0);
}

function drawStreakRow(ctx, x, y, w, config, streaks, bestType) {
    const current = getStreakValue(streaks, config.type, 'current');
    const best = getStreakValue(streaks, config.type, 'best');
    const isActive = current > 0;
    const isBest = bestType === config.type && best > 0;

    ctx.shadowColor = isBest ? '#FBBF24' : 'transparent';
    ctx.shadowBlur = isBest ? 18 : 0;

    roundRect(ctx, x, y, w, 68, 17);
    ctx.fillStyle = isActive
        ? 'rgba(139, 92, 246, 0.18)'
        : 'rgba(255, 255, 255, 0.045)';
    ctx.fill();

    ctx.strokeStyle = isBest
        ? '#FBBF24'
        : isActive
            ? 'rgba(192, 132, 252, 0.8)'
            : 'rgba(192, 132, 252, 0.25)';
    ctx.lineWidth = isBest ? 3 : 2;
    ctx.stroke();

    ctx.shadowBlur = 0;

    ctx.fillStyle = isActive ? '#C084FC' : '#6B7280';
    ctx.font = 'bold 30px Arial';
    ctx.fillText(config.icon, x + 24, y + 44);

    ctx.fillStyle = isActive ? '#FFFFFF' : '#9CA3AF';
    ctx.font = 'bold 23px Arial';
    ctx.fillText(config.title, x + 75, y + 30);

    ctx.fillStyle = isBest ? '#FBBF24' : '#A78BFA';
    ctx.font = 'bold 18px Arial';
    ctx.fillText(`Рекорд: ${best} дн.`, x + 75, y + 55);

    const valueText = `${current} дн.`;
    const valueRight = x + w - 24;

    ctx.fillStyle = isActive ? '#FBBF24' : '#6B7280';
    ctx.font = 'bold 28px Arial';

    if (current >= 7) {
        const valueWidth = ctx.measureText(valueText).width;
        const crownSize = 17;
        const crownWidth = crownSize * 1.35;
        const crownGap = 13;
        const crownX = valueRight - valueWidth - crownGap - crownWidth;
        const crownY = y + 22;
        drawCrown(ctx, crownX, crownY, crownSize, '#FBBF24');
    }

    ctx.textAlign = 'right';
    ctx.fillText(valueText, valueRight, y + 44);
    ctx.textAlign = 'left';
}

function drawMiniStat(ctx, x, y, w, title, value) {
    roundRect(ctx, x, y, w, 70, 18);
    ctx.fillStyle = 'rgba(139, 92, 246, 0.12)';
    ctx.fill();

    ctx.strokeStyle = 'rgba(192, 132, 252, 0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#A78BFA';
    ctx.font = 'bold 18px Arial';
    ctx.fillText(title, x + 22, y + 28);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 26px Arial';
    ctx.fillText(String(value), x + 22, y + 56);
}

async function createStreakCard(user, streaks) {
    const canvas = createCanvas(1200, 920);
    const ctx = canvas.getContext('2d');
    installIconRenderer(ctx);

    const avatar = await loadImage(
        user.displayAvatarURL({ extension: 'png', size: 256 })
    );

    const bg = ctx.createLinearGradient(0, 0, 1200, 920);
    bg.addColorStop(0, '#030008');
    bg.addColorStop(0.45, '#160827');
    bg.addColorStop(1, '#05000A');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1200, 920);

    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#C084FC';
    ctx.font = 'bold 230px Arial';
    ctx.fillText('STREAK', 405, 335);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = '#8B5CF6';
    ctx.lineWidth = 5;
    roundRect(ctx, 35, 35, 1130, 850, 36);
    ctx.stroke();

    ctx.shadowColor = '#A855F7';
    ctx.shadowBlur = 30;
    ctx.strokeStyle = '#C084FC';
    ctx.lineWidth = 2;
    roundRect(ctx, 55, 55, 1090, 810, 28);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.save();
    ctx.beginPath();
    ctx.arc(155, 150, 66, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, 89, 84, 132, 132);
    ctx.restore();

    ctx.shadowColor = '#A855F7';
    ctx.shadowBlur = 24;
    ctx.strokeStyle = '#C084FC';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(155, 150, 70, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 48px Arial';
    ctx.fillText('▲ СЕРИИ АКТИВНОСТИ', 255, 130);

    ctx.fillStyle = '#A855F7';
    ctx.font = 'bold 25px Arial';
    ctx.fillText(`GAME SYNDICATE • ${(user.gsDisplayName || user.username).toUpperCase()}`, 255, 172);

    const best = getBestStreak(streaks);
    const activeCount = getActiveStreaksCount(streaks);
    const totalCurrentDays = getTotalCurrentDays(streaks);

    ctx.fillStyle = '#FBBF24';
    ctx.font = 'bold 25px Arial';
    ctx.fillText(
        best && best.best > 0
            ? `★ Личный рекорд: ${best.icon} ${best.title} • ${best.best} дн.`
            : '★ Лучшей серии пока нет',
        255,
        215
    );

    const left = streakConfig.slice(0, 4);
    const right = streakConfig.slice(4);
    const bestType = best?.best > 0 ? best.type : null;

    for (let i = 0; i < left.length; i++) {
        drawStreakRow(ctx, 90, 285 + i * 92, 490, left[i], streaks, bestType);
    }

    for (let i = 0; i < right.length; i++) {
        drawStreakRow(ctx, 620, 285 + i * 92, 490, right[i], streaks, bestType);
    }

    drawMiniStat(ctx, 90, 690, 310, 'Активных серий', `${activeCount} / ${streakConfig.length}`);
    drawMiniStat(ctx, 445, 690, 310, 'Дней в текущих сериях', totalCurrentDays);
    drawMiniStat(ctx, 800, 690, 310, 'Лучший рекорд', best?.best ?? 0);

    ctx.fillStyle = '#A78BFA';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(
        'Серия увеличивается один раз в день при выполнении действия',
        600,
        820
    );

    ctx.textAlign = 'left';

    return canvas.toBuffer('image/png');
}

module.exports = {
    createStreakCard,
};
