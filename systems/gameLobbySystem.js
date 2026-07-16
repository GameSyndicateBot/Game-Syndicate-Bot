'use strict';
const {ActionRowBuilder,AttachmentBuilder,ButtonBuilder,ButtonStyle,MessageFlags}=require('discord.js');
const {db,getSetting}=require('../telegram/ecosystemDb');
const {createGameLobbyCard}=require('../images/game/createGameLobbyCard');
const AUTO_CLOSE_MS=4*60*60*1000;
let runtime={api:null,client:null},timer=null;
db.exec(`CREATE TABLE IF NOT EXISTS game_lobbies(id INTEGER PRIMARY KEY AUTOINCREMENT,creator_discord_id TEXT NOT NULL,creator_name TEXT NOT NULL,game TEXT NOT NULL,map_name TEXT NOT NULL,lobby_code TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',created_at INTEGER NOT NULL,closes_at INTEGER NOT NULL,closed_at INTEGER,discord_channel_id TEXT,discord_message_id TEXT,telegram_chat_id TEXT,telegram_thread_id INTEGER,telegram_message_id INTEGER);CREATE INDEX IF NOT EXISTS idx_game_lobbies_status_close ON game_lobbies(status,closes_at);`);
const getLobby=id=>db.prepare('SELECT * FROM game_lobbies WHERE id=?').get(Number(id));
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function rows(l){return l.status==='open'?[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`game_copy:${l.id}`).setLabel('Скопировать код').setEmoji('📋').setStyle(ButtonStyle.Primary))]:[];}
function tgText(l){const open=l.status==='open';return ['<b>🎮 GS GAME LOBBY</b>','',`<b>Игра:</b> ${esc(l.game)}`,`<b>Карта / режим:</b> ${esc(l.map_name)}`,'','<b>Код лобби:</b>',`<code>${esc(l.lobby_code)}</code>`,'',`<b>Создал:</b> ${esc(l.creator_name)}`,'',open?'🟢 <b>ЛОББИ ОТКРЫТО</b>':'🔴 <b>ЛОББИ ЗАКРЫТО</b>',open?'Автоматически закроется через 4 часа.':'Время действия лобби истекло.'].join('\n');}
function setGameLobbyRuntime(api,client){
 // Не затираем Telegram API значением null при событии Discord ready.
 // startTelegramBot() передаёт api, а ready.js может повторно передать
 // только client. Оба вызова должны дополнять runtime, а не заменять его.
 runtime={
  api:api||runtime.api,
  client:client||runtime.client,
 };

 if(timer)clearInterval(timer);
 closeExpiredGameLobbies().catch(console.error);
 timer=setInterval(
  ()=>closeExpiredGameLobbies().catch(console.error),
  60000
 );
 timer.unref?.();

 console.log(
  `✅ GS Game Lobby runtime: Discord=${Boolean(runtime.client)}, `+
  `Telegram=${Boolean(runtime.api)}`
 );
 console.log('✅ GS Game Lobby: автозакрытие через 4 часа включено');
}
async function publishGameLobby({creatorId,creatorName,game,mapName,lobbyCode}){
 const createdAt=Date.now(),closesAt=createdAt+AUTO_CLOSE_MS;
 const info=db.prepare('INSERT INTO game_lobbies(creator_discord_id,creator_name,game,map_name,lobby_code,created_at,closes_at) VALUES(?,?,?,?,?,?,?)').run(String(creatorId),creatorName,game,mapName,lobbyCode,createdAt,closesAt);
 let l=getLobby(info.lastInsertRowid);
 const channelId=getSetting('discord_gatherings_channel_id');if(!channelId)throw new Error('Discord game-lobby не настроен. Выполни /setgatherchannel в нужном канале.');
 const ch=await runtime.client?.channels.fetch(channelId).catch(()=>null);if(!ch?.isTextBased?.())throw new Error('Discord game-lobby не найден.');
 const card=await createGameLobbyCard({game,map:mapName,code:lobbyCode,creatorName,createdAt,closesAt,status:'open'});
 const msg=await ch.send({content:'@everyone',files:[new AttachmentBuilder(card,{name:`gs-game-lobby-${l.id}.png`})],components:rows(l),allowedMentions:{parse:['everyone']}});
 db.prepare('UPDATE game_lobbies SET discord_channel_id=?,discord_message_id=? WHERE id=?').run(channelId,msg.id,l.id);
 const tg=getSetting('telegram_gatherings_chat_id'),thread=getSetting('telegram_gatherings_thread_id');

 if(!runtime.api){
  throw new Error('Telegram API не подключён к GS Game Lobby.');
 }

 if(!tg){
  throw new Error(
   'Telegram game-lobby не настроен. Выполни /setgatherchannel в нужной теме.'
  );
 }

 const tm=await runtime.api('sendMessage',{
  chat_id:tg,
  ...(thread?{message_thread_id:Number(thread)}:{}),
  text:tgText(l),
  parse_mode:'HTML',
  disable_web_page_preview:true,
  disable_notification:false
 });

 db.prepare(
  'UPDATE game_lobbies SET telegram_chat_id=?,telegram_thread_id=?,telegram_message_id=? WHERE id=?'
 ).run(
  String(tg),
  thread?Number(thread):null,
  tm.message_id,
  l.id
 );

 await runtime.api('pinChatMessage',{
  chat_id:tg,
  message_id:tm.message_id,
  disable_notification:false
 }).catch(error=>{
  console.warn('[GameLobby] Telegram pin:',error.message);
 });

 const u=setTimeout(
  ()=>runtime.api('unpinChatMessage',{
   chat_id:tg,
   message_id:tm.message_id
  }).catch(()=>null),
  60000
 );
 u.unref?.();

 return getLobby(l.id);
}
async function closeGameLobby(id){const l=getLobby(id);if(!l||l.status!=='open')return false;const closedAt=Date.now();if(!db.prepare("UPDATE game_lobbies SET status='closed',closed_at=? WHERE id=? AND status='open'").run(closedAt,l.id).changes)return false;const c=getLobby(l.id);
 if(runtime.client&&c.discord_channel_id&&c.discord_message_id){const ch=await runtime.client.channels.fetch(c.discord_channel_id).catch(()=>null);const m=ch?await ch.messages.fetch(c.discord_message_id).catch(()=>null):null;if(m){const card=await createGameLobbyCard({game:c.game,map:c.map_name,code:c.lobby_code,creatorName:c.creator_name,createdAt:c.created_at,closesAt:closedAt,status:'closed'});await m.edit({content:'',files:[new AttachmentBuilder(card,{name:`gs-game-lobby-${c.id}-closed.png`})],attachments:[],components:[]}).catch(e=>console.error('[GameLobby] Discord close:',e.message));}}
 if(runtime.api&&c.telegram_chat_id&&c.telegram_message_id)await runtime.api('editMessageText',{chat_id:c.telegram_chat_id,message_id:c.telegram_message_id,text:tgText(c),parse_mode:'HTML',disable_web_page_preview:true}).catch(()=>null);
 return true;
}
async function closeExpiredGameLobbies(){for(const r of db.prepare("SELECT id FROM game_lobbies WHERE status='open' AND closes_at<=?").all(Date.now()))await closeGameLobby(r.id);}
async function handleGameLobbyButton(i){if(!i.isButton()||!i.customId.startsWith('game_copy:'))return false;const l=getLobby(i.customId.split(':')[1]);if(!l||l.status!=='open'){await i.reply({content:'❌ Это лобби уже закрыто.',flags:MessageFlags.Ephemeral});return true;}await i.reply({content:`🔑 **Код лобби**\n\`\`\`${l.lobby_code}\`\`\`\nНажми на код, чтобы скопировать.`,flags:MessageFlags.Ephemeral});return true;}
module.exports={setGameLobbyRuntime,publishGameLobby,closeGameLobby,closeExpiredGameLobbies,handleGameLobbyButton};
