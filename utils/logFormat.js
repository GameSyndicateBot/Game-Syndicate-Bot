const { AuditLogEvent, ChannelType } = require('discord.js');
const { sendLog, formatUser, cutText } = require('../utils/sendLog');
const { getAuditExecutor } = require('../utils/getAuditExecutor');
const typeName=t=>({[ChannelType.GuildText]:'Текстовый',[ChannelType.GuildVoice]:'Голосовой',[ChannelType.GuildCategory]:'Категория',[ChannelType.GuildAnnouncement]:'Новости',[ChannelType.GuildForum]:'Форум'}[t]||String(t));
const execName=a=>a?.executor?formatUser(a.executor):'Неизвестно';
module.exports={typeName,execName};
