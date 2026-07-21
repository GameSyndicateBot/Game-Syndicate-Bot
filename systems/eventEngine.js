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
    triggerBoss(client).catch((error) => {
        console.error('❌ Ошибка автоматического запуска босса:', error);
    });
}

function startEventEngine(client) {
    if (schedulerTimer) {
        console.log('ℹ️ Event Engine уже запущен');
        return;
    }

    console.log('🔥 Event Engine запущен (09:00, 15:00 и 21:00 МСК)');

    // Проверяем расписание сразу и затем каждые 30 секунд.
    checkBossSchedule(client);
    schedulerTimer = setInterval(() => checkBossSchedule(client), 30_000);

    // Таймер не должен мешать штатному завершению процесса.
    schedulerTimer.unref?.();
}

async function triggerBoss(client, forced = false) {
    if (isEventRunning && !forced) return;

    isEventRunning = true;

    console.log(forced ? '⚠️ Форс запуск босса' : '👹 Босс стартовал');
    global.activeBoss = true;

    // TODO: вставь свой старт боя

    setTimeout(() => {
        endBoss(client);
    }, 60_000).unref?.();
}

function endBoss(client) {
    console.log('🏆 Босс побежден');

    global.activeBoss = false;

    startNextQuickEvent(client);
    isEventRunning = false;
}

function startNextQuickEvent(client) {
    console.log('🎲 Запуск quick event после босса');

    // TODO: вставь quick event систему
}

function forceBoss(client) {
    return triggerBoss(client, true);
}

module.exports = {
    startEventEngine,
    forceBoss,
};
