const { createCanvas } = require('canvas');

const { installIconRenderer } = require('../ui/icons');
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.closePath();
}

const rarityColors = {
    common: '#6B7280',
    rare: '#3B82F6',
    epic: '#A855F7',
    legendary: '#F59E0B',
    mythic: '#EF4444',
};

const rarityNames = {
    common: 'Обычное',
    rare: 'Редкое',
    epic: 'Эпическое',
    legendary: 'Легендарное',
    mythic: 'Мифическое',
};

const categoryTitles = {
    messages: 'Сообщения',
    levels: 'Уровни',
    voice: 'Голосовой онлайн',
    reactions: 'Реакции',
    server: 'Сервер',
    collection: 'Коллекция',
    events: 'Игровые вечера',
    daily: 'Ежедневки',
    streaks: 'Серии активности',
    special: 'Особые',
    xp: 'XP',
    quick_events: 'Quick Events',
};

async function createAchievementCategoryCard(category, achievements, unlockedIds, page = 1) {
    const pageSize = 8;
    const start = (page - 1) * pageSize;
    const list = achievements.slice(start, start + pageSize);
    const totalPages = Math.max(1, Math.ceil(achievements.length / pageSize));

    const canvasHeight = 1030;
    const canvas = createCanvas(1200, canvasHeight);
    const ctx = canvas.getContext('2d');
    installIconRenderer(ctx);

    const bg = ctx.createLinearGradient(0, 0, 1200, canvasHeight);
    bg.addColorStop(0, '#030008');
    bg.addColorStop(0.45, '#160827');
    bg.addColorStop(1, '#05000A');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1200, canvasHeight);

    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#C084FC';
    ctx.font = 'bold 260px Arial';
    ctx.fillText('GS', 720, 290);
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

    ctx.textAlign = 'left';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 44px Arial';
    ctx.fillText(categoryTitles[category] || category, 90, 105);

    ctx.fillStyle = '#A855F7';
    ctx.font = 'bold 24px Arial';
    ctx.fillText('GAME SYNDICATE • ДОСТИЖЕНИЯ', 90, 145);

    ctx.fillStyle = '#A78BFA';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`Страница ${page} / ${totalPages}`, 1100, 145);

    let y = 190;

    for (const achievement of list) {
        ctx.textAlign = 'left';

        const unlocked = unlockedIds.includes(achievement.id);
        const color = rarityColors[achievement.rarity] || '#8B5CF6';

        const isSecretLocked = category === 'special' && !unlocked;

        const description = isSecretLocked
            ? '??? Секретное достижение'
            : achievement.description;

        roundRect(ctx, 80, y, 1040, 82, 18);
        ctx.fillStyle = unlocked
            ? 'rgba(139, 92, 246, 0.18)'
            : 'rgba(255, 255, 255, 0.04)';
        ctx.fill();

        ctx.strokeStyle = unlocked ? color : 'rgba(192, 132, 252, 0.25)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = unlocked ? '#C084FC' : '#6B7280';
        ctx.font = 'bold 30px Arial';
        ctx.fillText(unlocked ? 'OK' : '--', 105, y + 52);

        ctx.fillStyle = unlocked ? '#FFFFFF' : '#9CA3AF';
        ctx.font = 'bold 25px Arial';
        ctx.fillText(achievement.title, 160, y + 32);

        ctx.fillStyle = unlocked ? '#C4B5FD' : '#6B7280';
        ctx.font = '20px Arial';
        ctx.fillText(description, 160, y + 60);

        ctx.textAlign = 'right';

        ctx.fillStyle = unlocked ? color : '#6B7280';
        ctx.font = 'bold 18px Arial';
        ctx.fillText(rarityNames[achievement.rarity] || 'Обычное', 1090, y + 30);

        ctx.fillStyle = unlocked ? '#FBBF24' : '#6B7280';
        ctx.font = 'bold 20px Arial';
        ctx.fillText(`+${achievement.xp} XP`, 1090, y + 58);

        y += 96;
    }

    return canvas.toBuffer('image/png');
}

module.exports = {
    createAchievementCategoryCard,
};
