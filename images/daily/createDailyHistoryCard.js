const { createCanvas, loadImage } = require('canvas');

const { installIconRenderer } = require('../ui/icons');
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.closePath();
}

function formatDate(dateString) {
    const date = new Date(`${dateString}T00:00:00`);
    return date.toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
    });
}

function getStatus(row) {
    if (!row) return 'empty';

    if (
        row.total_quests > 0 &&
        row.claimed_quests >= row.total_quests &&
        row.bonus_claimed
    ) {
        return 'full';
    }

    if (row.claimed_quests > 0) return 'partial';

    return 'missed';
}

function getStatusColor(status) {
    if (status === 'full') return '#22C55E';
    if (status === 'partial') return '#FBBF24';
    if (status === 'missed') return '#EF4444';
    return '#374151';
}

function getStatusLabel(status) {
    if (status === 'full') return 'Полностью';
    if (status === 'partial') return 'Частично';
    if (status === 'missed') return 'Без наград';
    return 'Нет данных';
}

function getLastNDays(n) {
    const days = [];

    for (let i = n - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        days.push(date.toISOString().slice(0, 10));
    }

    return days;
}

function drawMiniStat(ctx, x, y, w, title, value) {
    roundRect(ctx, x, y, w, 78, 18);
    ctx.fillStyle = 'rgba(139, 92, 246, 0.12)';
    ctx.fill();

    ctx.strokeStyle = 'rgba(192, 132, 252, 0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#A78BFA';
    ctx.font = 'bold 18px Arial';
    ctx.fillText(title, x + 22, y + 29);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 28px Arial';
    ctx.fillText(String(value), x + 22, y + 62);
}


function drawHistoryStatus(ctx, x, y, status) {
    const color = status === 'full'
        ? '#22C55E'
        : status === 'partial'
            ? '#FBBF24'
            : status === 'missed'
                ? '#EF4444'
                : '#6B7280';

    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.arc(x, y, 15, 0, Math.PI * 2);
    ctx.stroke();

    if (status === 'full') {
        ctx.beginPath();
        ctx.moveTo(x - 7, y);
        ctx.lineTo(x - 2, y + 6);
        ctx.lineTo(x + 8, y - 7);
        ctx.stroke();
    } else if (status === 'partial') {
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fill();
    } else if (status === 'missed') {
        ctx.beginPath();
        ctx.moveTo(x - 6, y - 6);
        ctx.lineTo(x + 6, y + 6);
        ctx.moveTo(x + 6, y - 6);
        ctx.lineTo(x - 6, y + 6);
        ctx.stroke();
    } else {
        ctx.beginPath();
        ctx.moveTo(x - 6, y);
        ctx.lineTo(x + 6, y);
        ctx.stroke();
    }

    ctx.restore();
}

function drawLegendDot(ctx, x, y, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawDayCell(ctx, x, y, date, row) {
    const status = getStatus(row);
    const color = getStatusColor(status);

    roundRect(ctx, x, y, 58, 58, 14);
    ctx.fillStyle = `${color}33`;
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(
        status === 'full' ? '✓' : status === 'partial' ? '•' : status === 'missed' ? '×' : '-',
        x + 29,
        y + 36
    );

    ctx.fillStyle = '#A78BFA';
    ctx.font = 'bold 13px Arial';
    ctx.fillText(formatDate(date), x + 29, y + 78);
    ctx.textAlign = 'left';
}

async function createDailyHistoryCard(user, history, dailyStreak) {
    const canvas = createCanvas(1200, 900);
    const ctx = canvas.getContext('2d');
    installIconRenderer(ctx);

    const avatar = await loadImage(
        user.displayAvatarURL({ extension: 'png', size: 256 })
    );

    const bg = ctx.createLinearGradient(0, 0, 1200, 900);
    bg.addColorStop(0, '#030008');
    bg.addColorStop(0.45, '#160827');
    bg.addColorStop(1, '#05000A');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 1200, 900);

    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#C084FC';
    ctx.font = 'bold 220px Arial';
    ctx.fillText('DAILY', 600, 310);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = '#8B5CF6';
    ctx.lineWidth = 5;
    roundRect(ctx, 35, 35, 1130, 830, 36);
    ctx.stroke();

    ctx.shadowColor = '#A855F7';
    ctx.shadowBlur = 30;
    ctx.strokeStyle = '#C084FC';
    ctx.lineWidth = 2;
    roundRect(ctx, 55, 55, 1090, 790, 28);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.save();
    ctx.beginPath();
    ctx.arc(155, 145, 62, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, 93, 83, 124, 124);
    ctx.restore();

    ctx.strokeStyle = '#C084FC';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(155, 145, 66, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 46px Arial';
    ctx.fillText('ИСТОРИЯ ЕЖЕДНЕВОК', 250, 125);

    ctx.fillStyle = '#A855F7';
    ctx.font = 'bold 24px Arial';
    ctx.fillText(`GAME SYNDICATE • ${(user.gsDisplayName || user.username).toUpperCase()}`, 250, 165);

    const totalDays = history.length;
    const fullDays = history.filter(row =>
        row.total_quests > 0 &&
        row.claimed_quests >= row.total_quests &&
        row.bonus_claimed
    ).length;

    const partialDays = history.filter(row =>
        row.claimed_quests > 0 &&
        !(row.claimed_quests >= row.total_quests && row.bonus_claimed)
    ).length;

    const totalXP = history.reduce((sum, row) => sum + (row.xp_earned ?? 0), 0);
    const totalClaimed = history.reduce((sum, row) => sum + (row.claimed_quests ?? 0), 0);
    const totalQuests = history.reduce((sum, row) => sum + (row.total_quests ?? 0), 0);

    const percent = totalQuests
        ? Math.round((totalClaimed / totalQuests) * 100)
        : 0;

    drawMiniStat(ctx, 90, 240, 240, 'Полных дней', fullDays);
    drawMiniStat(ctx, 360, 240, 240, 'Частичных дней', partialDays);
    drawMiniStat(ctx, 630, 240, 240, 'XP с daily', `+${totalXP}`);
    drawMiniStat(ctx, 900, 240, 210, 'Стрик', `${dailyStreak?.current ?? 0} дн.`);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 30px Arial';
    ctx.fillText('ПОСЛЕДНИЕ 14 ДНЕЙ', 90, 390);

    const historyByDate = new Map(history.map(row => [row.date, row]));
    const days = getLastNDays(14);

    let x = 90;
    let y = 430;

    for (const date of days) {
        drawDayCell(ctx, x, y, date, historyByDate.get(date));
        x += 76;
    }

    ctx.font = 'bold 18px Arial';

    drawLegendDot(ctx, 96, 539, '#22C55E');
    ctx.fillStyle = '#A78BFA';
    ctx.fillText('полностью', 112, 545);

    drawLegendDot(ctx, 285, 539, '#FBBF24');
    ctx.fillText('частично', 301, 545);

    drawLegendDot(ctx, 455, 539, '#EF4444');
    ctx.fillText('без наград', 471, 545);

    drawLegendDot(ctx, 665, 539, '#6B7280');
    ctx.fillText('нет данных', 681, 545);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 30px Arial';
    ctx.fillText('ИТОГИ ЗА ПОСЛЕДНИЕ 30 ЗАПИСЕЙ', 90, 620);

    roundRect(ctx, 90, 655, 1020, 90, 24);
    ctx.fillStyle = 'rgba(139, 92, 246, 0.12)';
    ctx.fill();

    ctx.strokeStyle = 'rgba(192, 132, 252, 0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 24px Arial';
    ctx.fillText(`Выполнено заданий: ${totalClaimed} / ${totalQuests}`, 130, 705);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#FBBF24';
    ctx.fillText(`${percent}%`, 1065, 705);
    ctx.textAlign = 'left';

    roundRect(ctx, 130, 720, 935, 16, 8);
    ctx.fillStyle = '#12071F';
    ctx.fill();

    roundRect(ctx, 130, 720, Math.max(16, 935 * (percent / 100)), 16, 8);
    ctx.fillStyle = percent >= 80 ? '#22C55E' : percent >= 40 ? '#FBBF24' : '#EF4444';
    ctx.fill();

    const lastRows = history.slice(0, 3);

    ctx.fillStyle = '#A78BFA';
    ctx.font = 'bold 21px Arial';

    if (lastRows.length) {
        const lines = lastRows.map(row => {
            const status = getStatusLabel(getStatus(row));
            return `${formatDate(row.date)} • ${status} • ${row.claimed_quests}/${row.total_quests} • +${row.xp_earned} XP`;
        });

        ctx.fillText(lines.join('     '), 90, 805);
    } else {
        ctx.fillText('История пока пустая. Открой /daily show или забери награду через /daily claim.', 90, 805);
    }

    return canvas.toBuffer('image/png');
}

module.exports = {
    createDailyHistoryCard,
};
