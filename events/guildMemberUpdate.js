const { AuditLogEvent } = require('discord.js');
const { sendLog, formatUser, cutText } = require('../utils/sendLog');
const { getAuditExecutor } = require('../utils/getAuditExecutor');
function mod(a){return a?.executor?formatUser(a.executor):'Неизвестно / автоматическая система';}
module.exports={name:'guildMemberUpdate',async execute(oldMember,newMember){
    const added=newMember.roles.cache.filter(r=>!oldMember.roles.cache.has(r.id));
    const removed=oldMember.roles.cache.filter(r=>!newMember.roles.cache.has(r.id));
    if(added.size||removed.size){
        const audit=await getAuditExecutor(newMember.guild,AuditLogEvent.MemberRoleUpdate,newMember.id);
        await sendLog(newMember.guild,{section:'Участники и роли',title:'Роли участника изменены',color:added.size&&removed.size?0x3B82F6:added.size?0x22C55E:0xEF4444,thumbnail:newMember.user.displayAvatarURL({size:256}),fields:[
            {name:'Участник',value:formatUser(newMember.user),inline:false}
            {name:'Добавлены',value:added.map(r=>`${r}  \`${r.id}\``).join('\n')||'—',inline:false}
            {name:'Сняты',value:removed.map(r=>`${r}  \`${r.id}\``).join('\n')||'—',inline:false}
            {name:'Исполнитель',value:mod(audit),inline:false}
            {name:'Причина',value:cutText(audit?.reason||'Не указана'),inline:false}
        ]});
    }
    if(oldMember.displayName!==newMember.displayName){
        await sendLog(newMember.guild,{section:'Участники',title:'Никнейм изменён',color:0x3B82F6,thumbnail:newMember.user.displayAvatarURL({size:256}),fields:[{name:'Участник',value:formatUser(newMember.user),inline:false},{name:'Было',value:cutText(oldMember.displayName),inline:true},{name:'Стало',value:cutText(newMember.displayName),inline:true}]});
    }
    const oldT=oldMember.communicationDisabledUntilTimestamp,newT=newMember.communicationDisabledUntilTimestamp;
    if(oldT!==newT){
        const audit=await getAuditExecutor(newMember.guild,AuditLogEvent.MemberUpdate,newMember.id);
        const title=!oldT&&newT?'Таймаут выдан':oldT&&!newT?'Таймаут снят':'Таймаут изменён';
        await sendLog(newMember.guild,{section:'Модерация',title,color:newT?0xF59E0B:0x22C55E,thumbnail:newMember.user.displayAvatarURL({size:256}),fields:[{name:'Участник',value:formatUser(newMember.user),inline:false},{name:'До',value:oldT?`<t:${Math.floor(oldT/1000)}:F>`:'—',inline:true},{name:'После',value:newT?`<t:${Math.floor(newT/1000)}:F>`:'—',inline:true},{name:'Исполнитель',value:mod(audit),inline:false},{name:'Причина',value:cutText(audit?.reason||'Не указана'),inline:false}]});
    }
}};
