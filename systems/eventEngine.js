const cron = require('node-cron');

let isEventRunning = false;

function startEventEngine(client) {
    console.log('🔥 Event Engine запущен');

    cron.schedule('0 9 * * *', () => triggerBoss(client), { timezone: "Europe/Moscow" });
    cron.schedule('0 15 * * *', () => triggerBoss(client), { timezone: "Europe/Moscow" });
    cron.schedule('0 21 * * *', () => triggerBoss(client), { timezone: "Europe/Moscow" });
}

async function triggerBoss(client, forced = false) {
    if (isEventRunning) return;

    isEventRunning = true;

    console.log('👹 Босс стартовал');
    global.activeBoss = true;

    // TODO: вставь свой старт боя

    setTimeout(() => {
        endBoss(client);
    }, 60000);
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
    console.log('⚠️ Форс запуск босса');
    triggerBoss(client, true);
}

module.exports = {
    startEventEngine,
    forceBoss
};
