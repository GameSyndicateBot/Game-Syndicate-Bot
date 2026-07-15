const { sendLog, formatUser } = require('../utils/sendLog');
module.exports={name:'messageDeleteBulk',async execute(messages,channel){
    const guild=channel.guild;if(!guild)return;
    const authors=new Map();for(const m of messages.values()){if(m.author&&!m.author.bot)authors.set(m.author.id,m.author);}
    await sendLog(guild,{section:'Сообщения',title:'Массовое удаление',color:0xDC2626,fields:[
        {name:'Канал',value:`${channel}  \`${channel.id}\``,inline:false},
        {name:'Удалено',value:`**${messages.size}** сообщений`,inline:true},
        {name:'Авторов',value:`**${authors.size}**`,inline:true},
        {name:'Участники',value:[...authors.values()].slice(0,10).map(formatUser).join('\n')||'—',inline:false},
    ]});
}};
