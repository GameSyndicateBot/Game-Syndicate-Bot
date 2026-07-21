
const { AttachmentBuilder } = require('discord.js');

let eventActive = false;

async function startQuickEvent(client) {
    if (eventActive) return;

    const channel = client.channels.cache.get(process.env.EVENT_CHANNEL);
    if (!channel) return;

    eventActive = true;

    await channel.send({
        content: '⚡ **QUICK EVENT**\n👹 Босс появился!\n⏳ 2 минуты на сбор'
    });

    setTimeout(() => {
        eventActive = false;
    }, 2 * 60 * 1000);
}

async function handleMessage(message) {
    if (message.content === 'boss') {
        await startQuickEvent(message.client);
    }
}

module.exports = {
    startQuickEvent,
    handleMessage
};
