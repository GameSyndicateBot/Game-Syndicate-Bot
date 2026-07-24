const { createCanvas, loadImage } = require('canvas');

const { installIconRenderer } = require('../ui/icons');
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.closePath();
}

function getCategoryInfo(category) {
    const categories = {
        messages: { icon: 'MSG', title: 'Сообщения' },
        levels: { icon: 'LVL', title: 'Уровни' },
        voice: { icon: 'VOC', title: 'Голос' },
        reactions: { icon: 'RCT', title: 'Реакции' },
        server: { icon: 'SRV', title: 'Сервер' },
        collection: { icon: 'CRD', title: 'Коллекция' },
        events: { icon: 'EVT', title: 'Игровые вечера' },
        quick_events: { icon: 'QEV', title: 'Quick Events' },
        daily: { icon: 'DAY', title: 'Ежедневки' },
        streaks: { icon: 'STR', title: 'Серии' },
        special: { icon: 'SPC', title: 'Особые' },
        xp: { icon: 'XP', title: 'XP' },
        guild: { icon: 'GLD', title: 'Гильдия героев' },
        expeditions: { icon: 'MAP', title: 'Экспедиции' },
    };

    return categories[category] || { icon: 'ACH', title: category };
}

function drawProgressBar(ctx, x, y, w, h, progress) {
    roundRect(ctx, x, y, w, h, 12);
    ctx.fillStyle = '#12071F';
    ctx.fill();

    const fillWidth = Math.max(h, w * progress);

    const grad = ctx.createLinearGradient(x, y, x + w, y);
    grad.addColorStop(0, '#6D28D9');
    grad.addColorStop(0.5, '#A855F7');
    grad.addColorStop(1, '#C084FC');

    roundRect(ctx, x, y, fillWidth, h, 12);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = '#C084FC';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 12);
    ctx.stroke();
}

function drawCategoryRow(ctx, category, unlocked, total, x, y, w) {
    const info = getCategoryInfo(category);
    const progress = total ? unlocked / total : 0;

    roundRect(ctx, x, y, w, 68, 18);
    ctx.fillStyle = 'rgba(139, 92, 246, 0.12)';
    ctx.fill();

    ctx.strokeStyle = 'rgba(192, 132, 252, 0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#C084FC';
    ctx.font = 'bold 17px Arial';
    ctx.fillText(info.icon, x + 20, y + 42);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px Arial';
    ctx.fillText(info.title, x + 72, y + 30);

    ctx.fillStyle = '#A78BFA';
    ctx.font = 'bold 18px Arial';
    ctx.fillText(`${unlocked} / ${total}`, x + 72, y + 55);

    drawProgressBar(ctx, x + 290, y + 25, 430, 20, progress);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(progress * 100)}%`, x + w - 28, y + 45);
    ctx.textAlign = 'left';
}

async function createAchievementsOverviewCard(user, achievements, unlockedIds) {
    const categoriesOrder = [
        'messages',
        'levels',
        'voice',
        'reactions',
        'server',
        'collection',
        'events',
        'quick_events',
        'daily',
        'streaks',
        'special',
        'xp',
        'guild',
        'expeditions',
    ];
    const visibleCategoryCount = categoriesOrder.filter(category =>
        achievements.some(achievement => (achievement.category || 'other') === category)
    ).length;
    const canvasHeight = Math.max(1180, 245 + visibleCategoryCount * 78 + 135);
    const canvas = createCanvas(1200, canvasHeight);
    const ctx = canvas.getContext('2d');
    installIconRenderer(ctx);

    const avatar = await loadImage(
        user.displayAvatarURL({
            extension: 'png',
            size: 256,
        })
    );

    const total = achievements.length;
    const unlockedTotal = achievements.filter(a => unlockedIds.includes(a.id)).length;
    const totalProgress = total ? unlockedTotal / total : 0;

    const categoryStats = {};

    for (const achievement of achievements) {
        const category = achievement.category || 'other';

        if (!categoryStats[category]) {
            categoryStats[category] = {
                total: 0,
                unlocked: 0,
            };
        }

        categoryStats[category].total++;

        if (unlockedIds.includes(achievement.id)) {
            categoryStats[category].unlocked++;
        }
    }

    const bg = ctx.createLinearGradient(0, 0, 1200, canvasHeight);
    bg.addColorStop(0, '#030008');
    bg.addColorStop(0.45, '#160827');
    bg.addColorStop(1, '#05000A');

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1200, canvasHeight);

    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#C084FC';
    ctx.font = 'bold 270px Arial';
    ctx.fillText('GS', 720, 300);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = '#8B5CF6';
    ctx.lineWidth = 5;
    roundRect(ctx, 35, 35, 1130, canvasHeight - 70, 34);
    ctx.stroke();

    ctx.shadowColor = '#A855F7';
    ctx.shadowBlur = 30;
    ctx.strokeStyle = '#C084FC';
    ctx.lineWidth = 2;
    roundRect(ctx, 52, 52, 1096, canvasHeight - 104, 26);
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
    ctx.font = 'bold 40px Arial';
    ctx.fillText('ЭНЦИКЛОПЕДИЯ ДОСТИЖЕНИЙ', 220, 105);

    ctx.fillStyle = '#C084FC';
    ctx.font = 'bold 24px Arial';
    ctx.fillText((user.gsDisplayName || user.username).toUpperCase(), 220, 145);

    ctx.fillStyle = '#A78BFA';
    ctx.font = 'bold 26px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`${unlockedTotal} / ${total} • ${Math.round(totalProgress * 100)}%`, 1085, 125);
    ctx.textAlign = 'left';

    drawProgressBar(ctx, 220, 170, 865, 28, totalProgress);

    let y = 245;

    for (const category of categoriesOrder) {
        if (!categoryStats[category]) continue;

        drawCategoryRow(
            ctx,
            category,
            categoryStats[category].unlocked,
            categoryStats[category].total,
            90,
            y,
            1020
        );

        y += 78;
    }

    ctx.fillStyle = '#A78BFA';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Выбери категорию в меню ниже, чтобы открыть список достижений', 600, canvasHeight - 70);
    ctx.textAlign = 'left';

    return canvas.toBuffer('image/png');
}

module.exports = {
    createAchievementsOverviewCard,
};
