const { createCanvas, loadImage } = require('canvas');

const { installIconRenderer } = require('../ui/icons');
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.closePath();
}

async function createLevelCard(user, player, level) {
    const canvas = createCanvas(1200, 630);
    const ctx = canvas.getContext('2d');
    installIconRenderer(ctx);

    const avatar = await loadImage(
        user.displayAvatarURL({ extension: 'png', size: 256 })
    );

    const bg = ctx.createLinearGradient(0, 0, 1200, 630);
    bg.addColorStop(0, '#030008');
    bg.addColorStop(0.45, '#160827');
    bg.addColorStop(1, '#05000A');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1200, 630);

    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#C084FC';
    ctx.font = 'bold 170px Arial';
    ctx.fillText('LEVEL UP', 285, 350);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = '#8B5CF6';
    ctx.lineWidth = 5;
    roundRect(ctx, 35, 35, 1130, 560, 34);
    ctx.stroke();

    ctx.shadowColor = '#A855F7';
    ctx.shadowBlur = 32;
    ctx.strokeStyle = '#C084FC';
    ctx.lineWidth = 2;
    roundRect(ctx, 55, 55, 1090, 520, 28);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.save();
    ctx.beginPath();
    ctx.arc(170, 300, 95, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, 75, 205, 190, 190);
    ctx.restore();

    ctx.shadowColor = '#A855F7';
    ctx.shadowBlur = 28;
    ctx.strokeStyle = '#C084FC';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(170, 300, 101, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 46px Arial';
    ctx.fillText('★ НОВЫЙ УРОВЕНЬ!', 330, 150);

    ctx.fillStyle = '#C084FC';
    ctx.font = 'bold 34px Arial';
    ctx.fillText((user.gsDisplayName || user.username).toUpperCase(), 330, 205);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 120px Arial';
    ctx.fillText(String(level), 330, 355);

    ctx.fillStyle = '#A78BFA';
    ctx.font = 'bold 28px Arial';
    ctx.fillText(`Текущий XP: ${player.xp ?? 0}`, 330, 420);

    ctx.fillStyle = '#FBBF24';
    ctx.font = 'bold 26px Arial';
    ctx.fillText(`Следующая цель: ${level + 1} уровень`, 330, 465);

    ctx.fillStyle = '#A78BFA';
    ctx.font = 'bold 22px Arial';
    ctx.fillText('GAME SYNDICATE • LEVEL SYSTEM', 330, 525);

    return canvas.toBuffer('image/png');
}

module.exports = {
    createLevelCard,
};
