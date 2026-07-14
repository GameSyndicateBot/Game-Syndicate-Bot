'use strict';

const { createCanvas, loadImage } = require('canvas');
const colors = require('../ui/colors');
const {
    drawBackground,
    drawFrame,
    drawHeader,
    drawPanel,
    drawAutoText,
    drawStatBox,
    roundRect,
} = require('../ui/draw');
const { drawIcon, installIconRenderer } = require('../ui/icons');

function drawGlowIcon(ctx, name, x, y, size, color) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 26;
    drawIcon(ctx, name, x, y, size, color);
    ctx.restore();
}

async function drawAvatar(ctx, url, x, y, size) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    try {
        const image = await loadImage(url);
        ctx.drawImage(image, x, y, size, size);
    } catch (_) {
        const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
        gradient.addColorStop(0, colors.purple);
        gradient.addColorStop(1, colors.green);
        ctx.fillStyle = gradient;
        ctx.fillRect(x, y, size, size);
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = colors.gold;
    ctx.lineWidth = 6;
    ctx.shadowColor = colors.gold;
    ctx.shadowBlur = 25;
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2 + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
}

function formatDate(dateKey) {
    if (!dateKey) return '—';
    const [year, month, day] = dateKey.split('-');
    return `${day}.${month}.${year}`;
}

async function createWinnerCard(data) {
    const width = 1600;
    const height = 900;
    const canvas = createCanvas(width, height);
    const ctx = installIconRenderer(canvas.getContext('2d'));

    drawBackground(ctx, width, height, 'LUCKY');
    drawFrame(ctx, width, height);
    drawHeader(ctx, 'LUCKY DAY', `ЕЖЕДНЕВНЫЙ РОЗЫГРЫШ • 12:00 МСК • ЗАДАНИЯ ЗА ${formatDate(data.sourceDate)}`, width);

    drawPanel(ctx, 90, 190, 420, 610, {
        fill: 'rgba(7, 32, 22, 0.72)',
        stroke: 'rgba(34, 197, 94, 0.72)',
        lineWidth: 3,
        radius: 30,
    });
    drawGlowIcon(ctx, 'luck', 190, 275, 220, colors.green);
    ctx.fillStyle = colors.white;
    ctx.textAlign = 'center';
    ctx.font = 'bold 42px Arial';
    ctx.fillText('УДАЧА ВЫБРАЛА', 300, 555);
    ctx.fillStyle = colors.green;
    ctx.font = 'bold 58px Arial';
    ctx.fillText('ПОБЕДИТЕЛЯ', 300, 625);
    ctx.fillStyle = colors.muted;
    ctx.font = 'bold 23px Arial';
    ctx.fillText(`Участников: ${data.participants.length}`, 300, 700);
    if (data.excludedPreviousWinnerId) {
        ctx.font = '20px Arial';
        ctx.fillText('Победитель прошлого дня пропустил розыгрыш', 300, 748);
    }
    ctx.textAlign = 'left';

    drawPanel(ctx, 550, 190, 960, 610, {
        fill: 'rgba(30, 12, 45, 0.82)',
        stroke: 'rgba(251, 191, 36, 0.78)',
        lineWidth: 3,
        radius: 30,
    });

    await drawAvatar(ctx, data.winner.avatarUrl, 620, 270, 260);
    ctx.fillStyle = colors.gold;
    ctx.font = 'bold 26px Arial';
    ctx.fillText('ПОБЕДИТЕЛЬ', 930, 295);
    ctx.fillStyle = colors.white;
    drawAutoText(ctx, data.winner.name, 930, 370, 500, 66, { minSize: 34 });

    ctx.fillStyle = colors.muted;
    ctx.font = 'bold 24px Arial';
    ctx.fillText('НАГРАДА', 930, 445);
    const rewardIcon = data.reward.type === 'dust' ? 'dust' : 'pack';
    const rewardColor = data.reward.type === 'dust' ? colors.purpleLight : colors.gold;
    drawGlowIcon(ctx, rewardIcon, 920, 475, 90, rewardColor);
    ctx.fillStyle = rewardColor;
    drawAutoText(ctx, data.reward.label, 1030, 545, 400, 48, { minSize: 28 });
    if (data.reward.details) {
        ctx.fillStyle = colors.white;
        drawAutoText(ctx, data.reward.details, 930, 605, 490, 25, { minSize: 17 });
    }

    drawPanel(ctx, 620, 675, 820, 82, {
        fill: 'rgba(34, 197, 94, 0.10)',
        stroke: 'rgba(34, 197, 94, 0.45)',
        radius: 20,
    });
    drawGlowIcon(ctx, 'clock', 650, 693, 42, colors.green);
    ctx.fillStyle = colors.white;
    ctx.font = 'bold 26px Arial';
    ctx.fillText('Следующий розыгрыш — завтра в 12:00 МСК', 715, 727);

    return canvas.toBuffer('image/png');
}

function createNoWinnerCard(data) {
    const width = 1600;
    const height = 900;
    const canvas = createCanvas(width, height);
    const ctx = installIconRenderer(canvas.getContext('2d'));
    drawBackground(ctx, width, height, 'LUCKY');
    drawFrame(ctx, width, height);
    drawHeader(ctx, 'LUCKY DAY', `ЕЖЕДНЕВНЫЙ РОЗЫГРЫШ • 12:00 МСК • ЗАДАНИЯ ЗА ${formatDate(data.sourceDate)}`, width);

    drawPanel(ctx, 170, 210, 1260, 540, {
        fill: 'rgba(20, 8, 32, 0.82)',
        stroke: 'rgba(167, 139, 250, 0.55)',
        lineWidth: 3,
        radius: 34,
    });
    drawGlowIcon(ctx, 'luck', 675, 260, 250, colors.purpleLight);
    ctx.textAlign = 'center';
    ctx.fillStyle = colors.white;
    ctx.font = 'bold 54px Arial';
    ctx.fillText('СЕГОДНЯ ПОБЕДИТЕЛЯ НЕТ', 800, 585);
    ctx.fillStyle = colors.muted;
    ctx.font = '28px Arial';
    const message = data.allCompletedParticipants?.length
        ? 'Все подходящие участники были исключены правилом двух побед подряд.'
        : 'Вчера никто не выполнил и не забрал награды за все ежедневные задания.';
    ctx.fillText(message, 800, 640);
    ctx.fillStyle = colors.green;
    ctx.font = 'bold 28px Arial';
    ctx.fillText('Новый шанс — завтра в 12:00 МСК', 800, 700);
    ctx.textAlign = 'left';
    return canvas.toBuffer('image/png');
}

async function createStatsCard(user, stats, displayName) {
    const width = 1600;
    const height = 900;
    const canvas = createCanvas(width, height);
    const ctx = installIconRenderer(canvas.getContext('2d'));
    drawBackground(ctx, width, height, 'LUCKY');
    drawFrame(ctx, width, height);
    drawHeader(ctx, 'LUCKY DAY', 'СТАТИСТИКА УДАЧИ • РОЗЫГРЫШ ЕЖЕДНЕВНО В 12:00 МСК', width);

    drawPanel(ctx, 90, 190, 1420, 170, { fill: 'rgba(7, 32, 22, 0.55)', stroke: 'rgba(34,197,94,.55)', radius: 28 });
    drawGlowIcon(ctx, 'luck', 135, 225, 100, colors.green);
    ctx.fillStyle = colors.white;
    drawAutoText(ctx, displayName, 280, 270, 700, 50, { minSize: 30 });
    ctx.fillStyle = colors.muted;
    ctx.font = '24px Arial';
    ctx.fillText('Чтобы участвовать, закрой и забери награды за все ежедневные задания.', 280, 315);
    ctx.fillStyle = stats.channelId ? colors.green : colors.gold;
    ctx.font = 'bold 21px Arial';
    ctx.fillText(stats.channelId ? `Канал публикации: <#${stats.channelId}>` : 'Канал публикации ещё не настроен.', 1080, 285);

    drawStatBox(ctx, 90, 400, 270, 145, 'РОЗЫГРЫШЕЙ', stats.draws, colors.purpleLight);
    drawStatBox(ctx, 385, 400, 270, 145, 'УЧАСТИЙ', stats.participation, colors.blue);
    drawStatBox(ctx, 680, 400, 270, 145, 'ПОБЕД', stats.wins, colors.gold);
    drawStatBox(ctx, 975, 400, 270, 145, 'ВЫИГРАНО DUST', stats.dustWon, colors.purpleLight);
    drawStatBox(ctx, 1270, 400, 240, 145, 'ПАКОВ', stats.packsWon, colors.green);

    drawPanel(ctx, 90, 585, 1420, 210, { fill: 'rgba(20,8,32,.78)', stroke: 'rgba(192,132,252,.35)', radius: 26 });
    ctx.fillStyle = colors.white;
    ctx.font = 'bold 28px Arial';
    ctx.fillText('ПОСЛЕДНИЙ РОЗЫГРЫШ', 130, 635);
    if (!stats.latest) {
        ctx.fillStyle = colors.muted;
        ctx.font = '26px Arial';
        ctx.fillText('История пока пуста. Первый автоматический розыгрыш пройдёт в 12:00 МСК.', 130, 700);
    } else {
        const latestText = stats.latest.winner_name
            ? `${stats.latest.winner_name} • ${stats.latest.reward_label}${stats.latest.reward_details ? ` • ${stats.latest.reward_details}` : ''}`
            : 'Победителя не было';
        ctx.fillStyle = stats.latest.winner_name ? colors.gold : colors.muted;
        drawAutoText(ctx, latestText, 130, 700, 1320, 38, { minSize: 22 });
        ctx.fillStyle = colors.muted;
        ctx.font = '22px Arial';
        ctx.fillText(`${formatDate(stats.latest.draw_date)} • участников: ${stats.latest.participants_count}`, 130, 750);
    }

    return canvas.toBuffer('image/png');
}

async function createLuckyDayCard(data) {
    if (data.mode === 'stats') return createStatsCard(data.user, data.stats, data.displayName);
    if (data.winner) return createWinnerCard(data);
    return createNoWinnerCard(data);
}

module.exports = { createLuckyDayCard };
