const { sendLog, safeCode, formatUser } = require('../utils/sendLog');
module.exports={name:'messageDelete',async execute(message){
    if(!message.guild)return;
    if(message.partial)await message.fetch().catch(()=>null);
    const author=message.author; if(author?.bot)return;
    const attachments=[...message.attachments.values()].map(a=>`[${a.name||'файл'}](${a.url})`).join('\n')||'—';
    await sendLog(message.guild,{section:'Сообщения',title:'Сообщение удалено',color:0xEF4444,thumbnail:message.author?.displayAvatarURL({size:256}),fields:[
        {name:'Автор',value:author?formatUser(author):'Неизвестно',inline:false},
        {name:'Канал',value:`${message.channel}  \`${message.channelId}\``,inline:false},
        {name:'Текст',value:`\`\`\`\n${safeCode(message.content,850)}\n\`\`\``,inline:false},
        {name:'Вложения',value:attachments,inline:false},
        {name:'Сообщение ID',value:`\`${message.id}\``,inline:false},
    ]});
}};
