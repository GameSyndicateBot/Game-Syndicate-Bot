const { createCanvas } = require('canvas');

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.closePath();
}


function drawQuestIcon(ctx, field, x, y, color = '#FFFFFF') {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (field === 'messages') {
        ctx.strokeRect(x, y, 26, 18);
        ctx.beginPath();
        ctx.moveTo(x + 7, y + 18);
        ctx.lineTo(x + 4, y + 25);
        ctx.lineTo(x + 14, y + 18);
        ctx.stroke();
    } else if (field === 'voice_seconds') {
        ctx.beginPath();
        ctx.arc(x + 13, y + 9, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + 3, y + 9);
        ctx.quadraticCurveTo(x + 13, y + 27, x + 23, y + 9);
        ctx.stroke();
    } else if (field === 'given_reactions') {
        ctx.strokeRect(x + 8, y + 7, 17, 16);
        ctx.beginPath();
        ctx.moveTo(x + 8, y + 20);
        ctx.lineTo(x + 3, y + 20);
        ctx.lineTo(x + 3, y + 10);
        ctx.lineTo(x + 9, y + 10);
        ctx.stroke();
    } else {
        ctx.beginPath();
        ctx.moveTo(x + 13, y + 24);
        ctx.bezierCurveTo(x - 2, y + 13, x + 4, y, x + 13, y + 8);
        ctx.bezierCurveTo(x + 22, y, x + 28, y + 13, x + 13, y + 24);
        ctx.stroke();
    }
    ctx.restore();
}


function drawQuestStatus(ctx, x, y, state) {
    const color = state === 'claimed'
        ? '#22C55E'
        : state === 'done'
            ? '#FBBF24'
            : '#C084FC';

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.roundRect(x - 13, y - 13, 26, 26, 4);
    ctx.stroke();

    if (state === 'claimed') {
        ctx.beginPath();
        ctx.moveTo(x - 7, y);
        ctx.lineTo(x - 2, y + 6);
        ctx.lineTo(x + 8, y - 7);
        ctx.stroke();
    } else if (state === 'done') {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function drawBonusStatus(ctx, x, y, state) {
    const color = state === 'claimed'
        ? '#22C55E'
        : state === 'ready'
            ? '#FBBF24'
            : '#A855F7';

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.arc(x, y, 12, 0, Math.PI * 2);
    ctx.stroke();

    if (state === 'claimed') {
        ctx.beginPath();
        ctx.moveTo(x - 6, y);
        ctx.lineTo(x - 1, y + 5);
        ctx.lineTo(x + 7, y - 6);
        ctx.stroke();
    } else if (state === 'ready') {
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function formatValue(value, unit) {
    if (unit === 'seconds') return Math.floor(value / 60);
    return value;
}

function formatUnit(unit) {
    if (unit === 'seconds') return 'мин.';
    return '';
}

function drawQuest(ctx, y, quest, progressData) {
    const rawCurrent = progressData[quest.field] ?? 0;
    const rawTarget = quest.target;

    const current = formatValue(rawCurrent, quest.unit);
    const target = formatValue(rawTarget, quest.unit);
    const unit = formatUnit(quest.unit);

    const done = rawCurrent >= rawTarget;
    const claimed = Boolean(quest.claimed);
    const progress = Math.min(rawCurrent / rawTarget, 1);

    roundRect(ctx, 90, y, 1020, 82, 18);
    ctx.fillStyle = claimed
        ? 'rgba(34, 197, 94, 0.16)'
        : done
            ? 'rgba(251, 191, 36, 0.16)'
            : 'rgba(139, 92, 246, 0.12)';
    ctx.fill();

    ctx.strokeStyle = claimed
        ? '#22C55E'
        : done
            ? '#FBBF24'
            : '#8B5CF6';
    ctx.lineWidth = 2;
    ctx.stroke();

    drawQuestStatus(
        ctx,
        133,
        y + 41,
        claimed ? 'claimed' : done ? 'done' : 'idle'
    );

    drawQuestIcon(ctx, quest.field, 175, y + 12);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px Arial';
    ctx.fillText(quest.title, 215, y + 32);

    ctx.fillStyle = '#A78BFA';
    ctx.font = 'bold 20px Arial';
    ctx.fillText(
        `${current} / ${target}${unit ? ` ${unit}` : ''}`,
        215,
        y + 60
    );

    ctx.fillStyle = claimed ? '#22C55E' : '#FBBF24';
    ctx.font = 'bold 21px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(
        claimed ? 'Получено' : `+${quest.reward_xp} XP  •  +${Number(quest.reward_dust) > 0 ? quest.reward_dust : ({ messages: 15, voice_seconds: 20, given_reactions: 10, received_reactions: 10 }[quest.field] ?? 0)} Dust`,
        1070,
        y + 31
    );
    ctx.textAlign = 'left';

    roundRect(ctx, 740, y + 48, 330, 16, 8);
    ctx.fillStyle = '#12071F';
    ctx.fill();

    roundRect(ctx, 740, y + 48, Math.max(16, 330 * progress), 16, 8);
    ctx.fillStyle = claimed ? '#22C55E' : done ? '#FBBF24' : '#A855F7';
    ctx.fill();
}

async function createDailyCard(user, progress, quests, bonusXP, bonusDust = 45) {
    const canvas = createCanvas(1200, 790);
    const ctx = canvas.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, 1200, 790);
    bg.addColorStop(0, '#030008');
    bg.addColorStop(0.45, '#160827');
    bg.addColorStop(1, '#05000A');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1200, 790);

    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#C084FC';
    ctx.font = 'bold 230px Arial';
    ctx.fillText('DAILY', 555, 315);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = '#8B5CF6';
    ctx.lineWidth = 5;
    roundRect(ctx, 35, 35, 1130, 720, 36);
    ctx.stroke();

    ctx.shadowColor = '#A855F7';
    ctx.shadowBlur = 30;
    ctx.strokeStyle = '#C084FC';
    ctx.lineWidth = 2;
    roundRect(ctx, 55, 55, 1090, 680, 28);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 44px Arial';
    ctx.fillText('ЕЖЕДНЕВНЫЕ ЗАДАНИЯ', 90, 115);

    ctx.fillStyle = '#A855F7';
    ctx.font = 'bold 23px Arial';
    ctx.fillText(`GAME SYNDICATE • ${(user.gsDisplayName || user.username).toUpperCase()}`, 90, 150);

    ctx.fillStyle = '#A78BFA';
    ctx.font = 'bold 20px Arial';
    ctx.fillText('Личные задания дня', 90, 180);

    quests.forEach((quest, index) => {
        drawQuest(ctx, 220 + index * 95, quest, progress);
    });

    const allCompleted = quests.every(quest => {
        return (progress[quest.field] ?? 0) >= quest.target;
    });

    const allClaimed = quests.every(quest => quest.claimed);

    ctx.fillStyle = progress.claimed
        ? '#22C55E'
        : allCompleted && allClaimed
            ? '#22C55E'
            : '#FBBF24';

    drawBonusStatus(
        ctx,
        104,
        656,
        progress.claimed
            ? 'claimed'
            : allCompleted && allClaimed
                ? 'ready'
                : 'idle'
    );

    ctx.font = 'bold 28px Arial';
    ctx.fillText(
        progress.claimed
            ? 'Бонус дня уже получен'
            : allCompleted && allClaimed
                ? `Бонус дня готов: +${bonusXP} XP • +${bonusDust} Dust`
                : `Бонус за все задания: +${bonusXP} XP • +${bonusDust} Dust`,
        130,
        655
    );

    ctx.fillStyle = '#A78BFA';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'right';
    ctx.fillText('Новые личные задания каждый день', 1110, 705);
    ctx.textAlign = 'left';

    return canvas.toBuffer('image/png');
}

module.exports = {
    createDailyCard,
};