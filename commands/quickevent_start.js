
const { startQuickEvent } = require('../systems/quickEventSystem');
module.exports = {
 name:'quickevent_start',
 async execute(msg,args,client){
  if(!msg.member.permissions.has('ADMINISTRATOR')) return;
  await startQuickEvent(client);
  msg.reply('🔥 Quick Event запущен');
 }
};
