
const { startQuickEvent } = require('../systems/quickEventSystem');

function startScheduler(client) {

    const eventHours = [9, 15, 21];

    setInterval(() => {
        const now = new Date();

        const moscowHour = (now.getUTCHours() + 3) % 24;
        const minute = now.getUTCMinutes();

        if (minute !== 0) return;
        if (!eventHours.includes(moscowHour)) return;

        const channel = client.channels.cache.get(process.env.EVENT_CHANNEL);

        if (channel) {
            channel.send('⏳ Через 5 минут начнётся Quick Event!');
        }

        setTimeout(() => {
            startQuickEvent(client);
        }, 5 * 60 * 1000);

    }, 60 * 1000);
}

module.exports = { startScheduler };
