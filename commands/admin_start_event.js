
const { startQuickEvent } = require('../systems/quickEventSystem');

module.exports = {
    name: 'forceevent',
    async execute(message, args, client){
        if(!message.member.permissions.has('ADMINISTRATOR')) return;
        await startQuickEvent(client);
        message.reply('🔥 Ивент запущен вручную');
    }
};
