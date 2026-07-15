const { createCanvas, loadImage } = require('canvas');

const { installIconRenderer } = require('../ui/icons');
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.closePath();
}

function getRarityLabel(rarity) {
    const labels = {
        common: 'Обычное',
        rare: 'Редкое',
        epic: 'Эпическое',
        legendary: 'Легендарное',
        mythic: 'Мифическое',
    };

    return labels[rarity] || 'Обычное';
}

function drawAchievementRow(ctx, achievement, unlocked, x, y, w) {
    roundRect(ctx, x, y, w, 70, 16);
    ctx.fillStyle = unlocked
        ? 'rgba(139, 92, 246, 0.18)'
        : 'rgba(80, 65, 100, 0.16)';
    ctx.fill();

    ctx.strokeStyle = unlocked ? '#8B5CF6' : 'rgba(192, 132, 252, 0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = unlocked ? '#C084FC' : '#6B5B7A';
    ctx.font = 'bold 28px Arial';
    ctx.fillText(unlocked ? 'OK' : '--', x + 22, y + 45);

    ctx.fillStyle = unlocked ? '#FFFFFF' : '#9CA3AF';
    ctx.font = 'bold 22px Arial';
    ctx.fillText(achievement.title, x + 70, y + 30);

    ctx.fillStyle = unlocked ? '#C4B5FD' : '#6B7280';
    ctx.font = '16px Arial';
    ctx.fillText(achievement.description, x + 70, y + 54);

    ctx.fillStyle = unlocked ? '#A78BFA' : '#6B7280';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(getRarityLabel(achievement.rarity), x + w - 24, y + 30);
    ctx.fillText(`+${achievement.xp} XP`, x + w - 24, y + 54);
    ctx.textAlign = 'left';
}

async function createAchievementsListCard(user, achievements, unlockedIds, meta = {}) {
    const canvas = createCanvas(1200, 900);
    const ctx = canvas.getContext('2d');
    installIconRenderer(ctx);

    const avatar = await loadImage(user.displayAvatarURL({ extension: 'png', size: 256 }));

    const unlockedCount = meta.unlockedTotal ?? unlockedIds.length;
const total = meta.totalAchievements ?? achievements.length;
const percent = total ? Math.round((unlockedCount / total) * 100) : 0;

    const bg = ctx.createLinearGradient(0, 0, 1200, 900);
    bg.addColorStop(0, '#030008');
    bg.addColorStop(0.45, '#160827');
    bg.addColorStop(1, '#05000A');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1200, 900);

ctx.fillStyle = '#A78BFA';
ctx.font = 'bold 20px Arial';
ctx.textAlign = 'right';
ctx.fillText(`Страница ${meta.page ?? 1} / ${meta.totalPages ?? 1}`, 1085, 155);
ctx.textAlign = 'left';

    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#C084FC';
    ctx.font = 'bold 260px Arial';
    ctx.fillText('GS', 710, 280);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = '#8B5CF6';
    ctx.lineWidth = 5;
    roundRect(ctx, 35, 35, 1130, 830, 34);
    ctx.stroke();

    ctx.shadowColor = '#A855F7';
    ctx.shadowBlur = 30;
    ctx.strokeStyle = '#C084FC';
    ctx.lineWidth = 2;
    roundRect(ctx, 52, 52, 1096, 796, 26);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.save();
    ctx.beginPath();
    ctx.arc(125, 125, 58, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, 67, 67, 116, 116);
    ctx.restore();

    ctx.strokeStyle = '#C084FC';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(125, 125, 62, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 42px Arial';
    ctx.fillText('ДОСТИЖЕНИЯ', 220, 105);

    ctx.fillStyle = '#C084FC';
    ctx.font = 'bold 24px Arial';
    ctx.fillText((user.gsDisplayName || user.username).toUpperCase(), 220, 145);

    ctx.fillStyle = '#A78BFA';
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`${unlockedCount} / ${total} • ${percent}%`, 1085, 125);
    ctx.textAlign = 'left';

    roundRect(ctx, 220, 170, 865, 26, 13);
    ctx.fillStyle = '#12071F';
    ctx.fill();

    roundRect(ctx, 220, 170, Math.max(26, 865 * (percent / 100)), 26, 13);
    ctx.fillStyle = '#8B5CF6';
    ctx.fill();

    ctx.strokeStyle = '#C084FC';
    ctx.lineWidth = 2;
    roundRect(ctx, 220, 170, 865, 26, 13);
    ctx.stroke();

    const startY = 235;
    const rowGap = 82;
    const maxRows = 7;

    const sorted = [...achievements].sort((a, b) => {
        const aUnlocked = unlockedIds.includes(a.id);
        const bUnlocked = unlockedIds.includes(b.id);
        return Number(bUnlocked) - Number(aUnlocked);
    });

    for (let i = 0; i < Math.min(sorted.length, maxRows); i++) {
        const achievement = sorted[i];
        const unlocked = unlockedIds.includes(achievement.id);

        drawAchievementRow(ctx, achievement, unlocked, 90, startY + i * rowGap, 1020);
    }

    if (sorted.length > maxRows) {
        ctx.fillStyle = '#A78BFA';
        ctx.font = 'bold 20px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(`И ещё ${sorted.length - maxRows} достижений...`, 600, 835);
        ctx.textAlign = 'left';
    }

    return canvas.toBuffer('image/png');
}

module.exports = {
    createAchievementsListCard,
};
