const { createCanvas, loadImage } = require('canvas');

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.closePath();
}

function getRarityStyle(rarity) {
    const styles = {
        common: {
            label: 'COMMON',
            ru: 'Обычное',
            main: '#22C55E',
            glow: '#16A34A',
        },
        rare: {
            label: 'RARE',
            ru: 'Редкое',
            main: '#3B82F6',
            glow: '#2563EB',
        },
        epic: {
            label: 'EPIC',
            ru: 'Эпическое',
            main: '#8B5CF6',
            glow: '#A855F7',
        },
        legendary: {
            label: 'LEGENDARY',
            ru: 'Легендарное',
            main: '#F59E0B',
            glow: '#FBBF24',
        },
        mythic: {
            label: 'MYTHIC',
            ru: 'Мифическое',
            main: '#DC2626',
            glow: '#EF4444',
        },
    };

    return styles[rarity] || styles.common;
}

async function createAchievementCard(user, achievement) {
    const canvas = createCanvas(900, 280);
    const ctx = canvas.getContext('2d');

    const style = getRarityStyle(achievement.rarity);

    const avatar = await loadImage(
        user.displayAvatarURL({
            extension: 'png',
            size: 256,
        })
    );

    const gradient = ctx.createLinearGradient(0, 0, 900, 280);
    gradient.addColorStop(0, '#08020E');
    gradient.addColorStop(0.45, '#160827');
    gradient.addColorStop(1, '#05000A');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 900, 280);

    ctx.globalAlpha = 0.08;
    ctx.fillStyle = style.main;
    ctx.font = 'bold 120px Arial';
    ctx.fillText(style.label, 390, 180);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = style.main;
    ctx.lineWidth = 4;
    roundRect(ctx, 20, 20, 860, 240, 28);
    ctx.stroke();

    ctx.shadowColor = style.glow;
    ctx.shadowBlur = 28;
    ctx.strokeStyle = style.glow;
    ctx.lineWidth = 2;
    roundRect(ctx, 28, 28, 844, 224, 22);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.save();
    ctx.beginPath();
    ctx.arc(140, 140, 72, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 68, 68, 144, 144);
    ctx.restore();

    ctx.shadowColor = style.glow;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = style.main;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(140, 140, 76, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 32px Arial';
    ctx.fillText('★ Новое достижение!', 250, 70);

    ctx.fillStyle = style.main;
    ctx.font = 'bold 18px Arial';
    ctx.fillText(`${style.label} • ${style.ru}`, 250, 100);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 40px Arial';
    ctx.fillText(achievement.title, 250, 145);

    ctx.fillStyle = '#E5E7EB';
    ctx.font = '23px Arial';
    ctx.fillText(achievement.description, 250, 183);

    ctx.fillStyle = '#FBBF24';
    ctx.font = 'bold 25px Arial';
    ctx.fillText(`+${achievement.xp} XP`, 250, 225);

    ctx.fillStyle = style.main;
    ctx.font = 'bold 22px Arial';
    ctx.fillText(`+${achievement.points || 0} AP`, 390, 225);

    ctx.fillStyle = '#C084FC';
    ctx.font = 'bold 22px Arial';
    ctx.fillText(`+${achievement.dustReward || 0} Dust`, 510, 225);

    ctx.fillStyle = '#A78BFA';
    ctx.font = '18px Arial';
    ctx.fillText('Game Syndicate • Система достижений', 665, 225);

    return canvas.toBuffer('image/png');
}

module.exports = {
    createAchievementCard,
};