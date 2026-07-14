const { createCanvas, loadImage } = require('canvas');

const { installIconRenderer } = require('../ui/icons');
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.closePath();
}

const rarityColors = {
    common: '#D1D5DB',
    rare: '#3B82F6',
    epic: '#A855F7',
    legendary: '#F59E0B',
    mythic: '#EF4444',
};

const rarityNames = {
    common: '⚪ Обычное',
    rare: '● Редкое',
    epic: '● Эпическое',
    legendary: '● Легендарное',
    mythic: '● Мифическое',
};

function drawStat(ctx, x, y, icon, label, value) {
    roundRect(ctx, x, y, 190, 76, 18);
    ctx.fillStyle = 'rgba(139, 92, 246, 0.13)';
    ctx.fill();

    ctx.strokeStyle = 'rgba(192, 132, 252, 0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#C084FC';
    ctx.font = 'bold 22px Arial';
    ctx.fillText(`${icon} ${label}`, x + 18, y + 28);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 28px Arial';
    ctx.fillText(`${value} / 100`, x + 18, y + 60);
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';

    for (const word of words) {
        const testLine = line + word + ' ';
        const width = ctx.measureText(testLine).width;

        if (width > maxWidth) {
            ctx.fillText(line, x, y);
            line = word + ' ';
            y += lineHeight;
        } else {
            line = testLine;
        }
    }

    ctx.fillText(line, x, y);
    return y;
}

async function createForecastCard(user, forecast) {
    const canvas = createCanvas(1300, 980);
    const ctx = canvas.getContext('2d');
    installIconRenderer(ctx);

    const avatar = await loadImage(
        user.displayAvatarURL({ extension: 'png', size: 256 })
    );

    const rarityColor = rarityColors[forecast.rarity] || '#C084FC';

    const bg = ctx.createLinearGradient(0, 0, 1300, 980);
    bg.addColorStop(0, '#030008');
    bg.addColorStop(0.45, '#160827');
    bg.addColorStop(1, '#05000A');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1300, 980);

    ctx.globalAlpha = 0.07;
    ctx.fillStyle = rarityColor;
    ctx.font = 'bold 250px Arial';
    ctx.fillText('FATE', 660, 325);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = '#8B5CF6';
    ctx.lineWidth = 5;
    roundRect(ctx, 35, 35, 1230, 910, 36);
    ctx.stroke();

    ctx.shadowColor = rarityColor;
    ctx.shadowBlur = 35;
    ctx.strokeStyle = rarityColor;
    ctx.lineWidth = 2;
    roundRect(ctx, 55, 55, 1190, 870, 28);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.save();
    ctx.beginPath();
    ctx.arc(155, 145, 62, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, 93, 83, 124, 124);
    ctx.restore();

    ctx.shadowColor = rarityColor;
    ctx.shadowBlur = 24;
    ctx.strokeStyle = rarityColor;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(155, 145, 66, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 46px Arial';
    ctx.fillText('◇ ПРОРОЧЕСТВО ДНЯ', 250, 120);

    ctx.fillStyle = '#A855F7';
    ctx.font = 'bold 24px Arial';
    ctx.fillText(`GAME SYNDICATE • ${(user.gsDisplayName || user.username).toUpperCase()}`, 250, 160);

    ctx.fillStyle = rarityColor;
    ctx.font = 'bold 25px Arial';
    ctx.fillText(`${rarityNames[forecast.rarity] || forecast.rarity} • ${forecast.day_type}`, 250, 205);

    drawStat(ctx, 90, 260, '♣', 'Удача', forecast.luck);
    drawStat(ctx, 315, 260, '⚡', 'Энергия', forecast.energy);
    drawStat(ctx, 540, 260, '●', 'Общение', forecast.social);
    drawStat(ctx, 765, 260, '◆', 'Игры', forecast.gaming);
    drawStat(ctx, 990, 260, '◆', 'Фокус', forecast.focus);

    roundRect(ctx, 90, 380, 1120, 170, 26);
    ctx.fillStyle = 'rgba(139, 92, 246, 0.14)';
    ctx.fill();
    ctx.strokeStyle = rarityColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = rarityColor;
    ctx.font = 'bold 32px Arial';
    ctx.fillText(`${forecast.prediction_icon} ${forecast.prediction_title}`, 130, 435);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 25px Arial';
    drawWrappedText(ctx, forecast.prediction_text, 130, 485, 1030, 36);

    roundRect(ctx, 90, 590, 1120, 130, 26);
    ctx.fillStyle = 'rgba(251, 191, 36, 0.11)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#FBBF24';
    ctx.font = 'bold 30px Arial';
    ctx.fillText(`✦ ${forecast.blessing_title}`, 130, 640);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 23px Arial';
    drawWrappedText(ctx, forecast.blessing_text, 130, 682, 1030, 32);

    roundRect(ctx, 90, 760, 1120, 85, 24);
    ctx.fillStyle = 'rgba(139, 92, 246, 0.11)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(192, 132, 252, 0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px Arial';
    ctx.fillText(`◇ Счастливое число: ${forecast.lucky_number}`, 130, 812);
    ctx.fillText(`✦ Цвет дня: ${forecast.color}`, 470, 812);
    ctx.fillText(`◷ Лучшее время: ${forecast.best_time}`, 790, 812);

    ctx.fillStyle = '#A78BFA';
    ctx.font = 'bold 22px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(`★ Шанс получить достижение: ${forecast.achievement_chance}`, 650, 895);
    ctx.textAlign = 'left';

    return canvas.toBuffer('image/png');
}

module.exports = {
    createForecastCard,
};
