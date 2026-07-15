const { AuditLogEvent } = require('discord.js');
const { sendLog, formatUser } = require('../utils/sendLog');
const { getAuditExecutor } = require('../utils/getAuditExecutor');
module.exports={name:'guildMemberRemove',async execute(member){
    await new Promise(r=>setTimeout(r,800));
    const audit=await getAuditExecutor(member.guild,AuditLogEvent.MemberKick,member.id);
    const kicked=Boolean(audit?.executor);
    await sendLog(member.guild,{section:kicked?'Модерация':'Участники',title:kicked?'Участник исключён':'Участник вышел',color:0xEF4444,thumbnail:member.user.displayAvatarURL({size:256}),fields:[
        {name:'Участник',value:formatUser(member.user),inline:false},
        {name:'На сервере с',value:member.joinedTimestamp?`<t:${Math.floor(member.joinedTimestamp/1000)}:R>`:'Неизвестно',inline:true},
        {name:'Ролей',value:String(Math.max(0,member.roles.cache.size-1)),inline:true},
        ...(kicked?[{name:'Модератор',value:formatUser(audit.executor),inline:false},{name:'Причина',value:audit.reason||'Не указана',inline:false}]:[]),
    ]});
}};
