const { sendLog, safeCode, formatUser } = require('../utils/sendLog');
module.exports={name:'messageUpdate',async execute(oldMessage,newMessage){
    if(!oldMessage.guild)return;
    if(oldMessage.partial)await oldMessage.fetch().catch(()=>null);
    if(newMessage.partial)await newMessage.fetch().catch(()=>null);
    const author=newMessage.author||oldMessage.author; if(!author||author.bot)return;
    const before=oldMessage.content||'', after=newMessage.content||''; if(before===after)return;
    await sendLog(oldMessage.guild,{section:'Сообщения',title:'Сообщение изменено',color:0xF59E0B,url:newMessage.url,thumbnail:newMessage.author?.displayAvatarURL({size:256}),fields:[
        {name:'Автор',value:formatUser(author),inline:false}
        {name:'Канал',value:`${newMessage.channel}  \`${newMessage.channelId}\``,inline:false}
        {name:'До',value:`\`\`\`\n${safeCode(before,700)}\n\`\`\``,inline:false}
        {name:'После',value:`\`\`\`\n${safeCode(after,700)}\n\`\`\``,inline:false}
        {name:'Ссылка',value:newMessage.url?`[Открыть сообщение](${newMessage.url})`:'—',inline:false}
    ]});
}};
