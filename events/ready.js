const { startEventEngine } = require('../systems/eventEngine');

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        console.log(`✅ Бот ${client.user.tag} запущен!`);
        startEventEngine(client);
    },
};
