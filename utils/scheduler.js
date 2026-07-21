
const { startQuickEvent } = require('../systems/quickEventSystem');

function startScheduler(client) {
    const hours = [9, 15, 21];

    setInterval(() => {
        const now = new Date();
        const hour = (now.getUTCHours() + 3) % 24;
        const minute = now.getUTCMinutes();

        if (minute !== 0) return;
        if (!hours.includes(hour)) return;

        const channel = client.channels.cache.get(process.env.EVENT_CHANNEL);

        if (channel) {
            channel.send('⏳ Через 5 минут начнётся Quick Event!');
        }

        setTimeout(() => {
            startQuickEvent(client);
        }, 5 * 60 * 1000);

    }, 60000);
}

module.exports = { startScheduler };
