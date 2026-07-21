
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

async function handleQuickEventAnswer(message) {
    // Совместимость с обработчиком messageCreate.
    // Сейчас quick-event запускается командой `boss`; другие сообщения игнорируются.
    if (!message || message.author?.bot) return false;

    if (message.content?.trim().toLowerCase() === 'boss') {
        await startQuickEvent(message.client);
        return true;
    }

    return false;
}

// Старое имя оставлено для совместимости с другими модулями.
const handleMessage = handleQuickEventAnswer;

module.exports = {
    startQuickEvent,
    handleQuickEventAnswer,
    handleMessage,
};
