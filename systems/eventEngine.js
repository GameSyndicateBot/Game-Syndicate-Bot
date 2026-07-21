let isEventRunning = false;
let schedulerTimer = null;
let lastTriggeredSlot = null;

const BOSS_HOURS_MSK = new Set([9, 15, 21]);

function getMoscowDateParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Moscow',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);

    return Object.fromEntries(
        parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value])
    );
}

function checkBossSchedule(client) {
    const now = getMoscowDateParts();
    const hour = Number(now.hour);
    const minute = Number(now.minute);

    if (minute !== 0 || !BOSS_HOURS_MSK.has(hour)) return;

    const slot = `${now.year}-${now.month}-${now.day}-${now.hour}`;
    if (lastTriggeredSlot === slot) return;

    lastTriggeredSlot = slot;
    triggerBoss(client);
}

function startEventEngine(client) {
    if (schedulerTimer) return;

    console.log('🔥 Event Engine FULL запущен');

    checkBossSchedule(client);
    schedulerTimer = setInterval(() => checkBossSchedule(client), 30000);

    setInterval(() => {
        try {
            require('./dailyPackSystem').runDailyPack(client);
        } catch (e) {}
    }, 60 * 60 * 1000);
}

async function triggerBoss(client) {
    if (isEventRunning) return;

    isEventRunning = true;
    console.log('👹 Босс стартовал');

    global.activeBoss = true;

    setTimeout(() => endBoss(client), 60000);
}

function endBoss(client) {
    console.log('🏆 Босс побежден');

    global.activeBoss = false;
    startNextQuickEvent(client);
    isEventRunning = false;
}

function startNextQuickEvent(client) {
    console.log('🎲 Quick event старт');

    const events = ['quiz', 'lottery', 'crocodile'];
    const random = events[Math.floor(Math.random() * events.length)];

    try {
        if (random === 'quiz') require('./quizSystem').startQuiz(client);
        if (random === 'lottery') require('./lotterySystem').startLottery(client);
        if (random === 'crocodile') require('./crocodileSystem').startGame(client);
    } catch (e) {
        console.error('Quick event error:', e.message);
    }
}

function forceBoss(client) {
    triggerBoss(client);
}

module.exports = { startEventEngine, forceBoss };
