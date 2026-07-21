
const schedule = require('node-schedule');
const { startQuickEvent } = require('../systems/quickEventSystem');

function startScheduler(client){
    [9,15,21].forEach(hour=>{
        schedule.scheduleJob({rule:`0 ${hour} * * *`, tz:'Europe/Moscow'}, ()=>{
            const ch = client.channels.cache.get(process.env.EVENT_CHANNEL);
            if(ch) ch.send('⏳ Через 5 минут начнётся Quick Event!');
            setTimeout(()=>startQuickEvent(client), 5*60*1000);
        });
    });
}

module.exports = { startScheduler };
