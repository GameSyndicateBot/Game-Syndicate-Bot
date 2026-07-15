const { sendLog, formatUser, formatDuration } = require('../utils/sendLog');
const { db } = require('../database/db');
const voiceTracker = require('../systems/voiceTrackingSystem');

function isExcludedVoiceChannel(channelId) { return voiceTracker.isExcludedVoiceChannel(channelId); }
function getActiveGameEvent() { return db.prepare(`SELECT * FROM game_events WHERE status='started' ORDER BY id DESC LIMIT 1`).get(); }
function startVoiceSession(member, channelId) { return voiceTracker.startVoiceSession(member, channelId); }
function getVoiceSession(userId) { return voiceTracker.getVoiceSession(userId); }
function deleteVoiceSession(userId) { return voiceTracker.deleteVoiceSession(userId); }
async function finishVoiceSession(member, guild) { return voiceTracker.settleVoiceSession(member, guild, { close: true }); }

function sessionSeconds(userId) {
    const session = getVoiceSession(userId);
    const started = Number(session?.started_at ?? session?.startedAt ?? session?.joined_at ?? 0);
    return started > 0 ? Math.max(0, Math.floor((Date.now() - started) / 1000)) : 0;
}
function channelName(channel) { return channel ? `${channel}  \`${channel.id}\`` : '—'; }

function startEventParticipantSession(event, member) {
    db.prepare(`INSERT OR IGNORE INTO game_event_participants (event_id,user_id,username,joined_at) VALUES (?,?,?,?)`).run(event.id,member.user.id,member.user.username,Date.now());
    db.prepare(`UPDATE game_event_participants SET username=?, joined_at=? WHERE event_id=? AND user_id=? AND joined_at IS NULL`).run(member.user.username,Date.now(),event.id,member.user.id);
}
function finishEventParticipantSession(event, member) {
    const p=db.prepare(`SELECT * FROM game_event_participants WHERE event_id=? AND user_id=?`).get(event.id,member.user.id);
    if(!p?.joined_at)return;
    const seconds=Math.floor((Date.now()-p.joined_at)/1000); if(seconds<=0)return;
    db.prepare(`UPDATE game_event_participants SET total_seconds=total_seconds+?, joined_at=NULL, username=? WHERE event_id=? AND user_id=?`).run(seconds,member.user.username,event.id,member.user.id);
}

async function voiceLog(guild, title, color, member, fields) {
    return sendLog(guild,{section:'Голосовые каналы',title,color,thumbnail:member.user.displayAvatarURL({size:256}),fields:[{name:'Участник',value:formatUser(member.user),inline:false},...fields]});
}

module.exports={name:'voiceStateUpdate',async execute(oldState,newState){
    const member=newState.member||oldState.member; if(!member||member.user.bot)return;
    const was=Boolean(oldState.channelId), now=Boolean(newState.channelId);
    const wasCounted=was&&!isExcludedVoiceChannel(oldState.channelId), nowCounted=now&&!isExcludedVoiceChannel(newState.channelId);
    const activeEvent=getActiveGameEvent();

    if(!was&&now){
        if(nowCounted)startVoiceSession(member,newState.channelId); else deleteVoiceSession(member.id);
        if(activeEvent&&newState.channelId===activeEvent.voice_channel_id)startEventParticipantSession(activeEvent,member);
        await voiceLog(newState.guild,'Подключение',0x22C55E,member,[{name:'Канал',value:channelName(newState.channel),inline:false}]);
        return;
    }
    if(was&&!now){
        const duration=wasCounted?sessionSeconds(member.id):0;
        if(activeEvent&&oldState.channelId===activeEvent.voice_channel_id)finishEventParticipantSession(activeEvent,member);
        if(wasCounted)await finishVoiceSession(member,oldState.guild); else deleteVoiceSession(member.id);
        await voiceLog(oldState.guild,'Отключение',0xEF4444,member,[{name:'Канал',value:channelName(oldState.channel),inline:true},{name:'Время в канале',value:formatDuration(duration),inline:true}]);
        return;
    }
    if(was&&now&&oldState.channelId!==newState.channelId){
        const duration=wasCounted?sessionSeconds(member.id):0;
        if(wasCounted)await finishVoiceSession(member,oldState.guild); else deleteVoiceSession(member.id);
        if(nowCounted)startVoiceSession(member,newState.channelId);
        if(activeEvent&&oldState.channelId===activeEvent.voice_channel_id)finishEventParticipantSession(activeEvent,member);
        if(activeEvent&&newState.channelId===activeEvent.voice_channel_id)startEventParticipantSession(activeEvent,member);
        await voiceLog(newState.guild,'Переход между каналами',0x3B82F6,member,[{name:'Было',value:channelName(oldState.channel),inline:true},{name:'Стало',value:channelName(newState.channel),inline:true},{name:'В предыдущем',value:formatDuration(duration),inline:false}]);
        return;
    }

    const changes=[];
    if(oldState.selfMute!==newState.selfMute)changes.push(`Микрофон: **${newState.selfMute?'выключен':'включён'}**`);
    if(oldState.selfDeaf!==newState.selfDeaf)changes.push(`Наушники: **${newState.selfDeaf?'выключены':'включены'}**`);
    if(oldState.serverMute!==newState.serverMute)changes.push(`Server mute: **${newState.serverMute?'включён':'снят'}**`);
    if(oldState.serverDeaf!==newState.serverDeaf)changes.push(`Server deaf: **${newState.serverDeaf?'включён':'снят'}**`);
    if(oldState.streaming!==newState.streaming)changes.push(`Стрим: **${newState.streaming?'начат':'завершён'}**`);
    if(oldState.selfVideo!==newState.selfVideo)changes.push(`Камера: **${newState.selfVideo?'включена':'выключена'}**`);
    if(changes.length)await voiceLog(newState.guild,'Изменение состояния',0x8B5CF6,member,[{name:'Канал',value:channelName(newState.channel),inline:false},{name:'Изменения',value:changes.join('\n'),inline:false}]);
}};
