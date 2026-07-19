'use strict';
const {ActionRowBuilder,AttachmentBuilder,ButtonBuilder,ButtonStyle,MessageFlags}=require('discord.js');
const {db,getSetting}=require('../telegram/ecosystemDb');
const {createGameLobbyCard}=require('../images/game/createGameLobbyCard');
const AUTO_CLOSE_MS=4*60*60*1000;

// Храним runtime в globalThis, чтобы даже при повторной загрузке модуля через
// разные пути/сборочные остатки существовал только один таймер Game Lobby.
const STATE_KEY = Symbol.for('game-syndicate.game-lobby-runtime');
const state = globalThis[STATE_KEY] || (globalThis[STATE_KEY] = {
 api: null,
 client: null,
 timer: null,
});
db.exec(`CREATE TABLE IF NOT EXISTS game_lobbies(id INTEGER PRIMARY KEY AUTOINCREMENT,creator_discord_id TEXT NOT NULL,creator_name TEXT NOT NULL,game TEXT NOT NULL,map_name TEXT NOT NULL,lobby_code TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',created_at INTEGER NOT NULL,closes_at INTEGER NOT NULL,closed_at INTEGER,discord_channel_id TEXT,discord_message_id TEXT,telegram_chat_id TEXT,telegram_thread_id INTEGER,telegram_message_id INTEGER);CREATE INDEX IF NOT EXISTS idx_game_lobbies_status_close ON game_lobbies(status,closes_at);`);

const gameLobbyColumns=db.prepare('PRAGMA table_info(game_lobbies)').all();
if(!gameLobbyColumns.some(column=>column.name==='telegram_pin_service_message_id')){
 db.exec('ALTER TABLE game_lobbies ADD COLUMN telegram_pin_service_message_id INTEGER');
}

const getLobby=id=>db.prepare('SELECT * FROM game_lobbies WHERE id=?').get(Number(id));
const esc=v=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
function rows(l){return l.status==='open'&&String(l.lobby_code||'').trim()?[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`game_copy:${l.id}`).setLabel('Скопировать код / пароль').setEmoji('📋').setStyle(ButtonStyle.Primary))]:[];}
function tgText(l){const open=l.status==='open';const lines=['<b>🎮 GS GAME LOBBY</b>','',`<b>Игра:</b> ${esc(l.game)}`,`<b>Карта / лобби:</b> ${esc(l.map_name)}`];if(String(l.lobby_code||'').trim())lines.push('<b>Код / пароль:</b>',`<code>${esc(l.lobby_code)}</code>`);lines.push('',`<b>Создал:</b> ${esc(l.creator_name)}`,'',open?'🟢 <b>ЛОББИ ОТКРЫТО</b>':'🔴 <b>ЛОББИ ЗАКРЫТО</b>',open?'Автоматически закроется через 4 часа.':'Время действия лобби истекло.');return lines.join('\n');}
function tgKeyboard(l){return {inline_keyboard:[[{text:'❌ Закрыть лобби',callback_data:`game_lobby_close:${l.id}`}]]};}
function setGameLobbyRuntime(api,client){
 const previousApi=state.api;
 const previousClient=state.client;

 if(api)state.api=api;
 if(client)state.client=client;

 if(!state.timer){
  closeExpiredGameLobbies().catch(error=>
   console.error('[GameLobby] Initial cleanup:',error.message)
  );
  state.timer=setInterval(
   ()=>closeExpiredGameLobbies().catch(error=>
    console.error('[GameLobby] Auto-close:',error.message)
   ),
   60000
  );
  state.timer.unref?.();
  console.log('✅ GS Game Lobby: автозакрытие через 4 часа включено');
 }

 // Не печатаем одинаковое состояние повторно. Это также делает по логам
 // заметным реальное подключение Discord/Telegram, а не повторный init.
 if(previousApi!==state.api||previousClient!==state.client){
  console.log(
   `✅ GS Game Lobby runtime: Discord=${Boolean(state.client)}, `+
   `Telegram=${Boolean(state.api)}`
  );
 }
}

async function publishGameLobby({creatorId,creatorName,game,mapName='',lobbyCode=''}){
 const createdAt=Date.now(),closesAt=createdAt+AUTO_CLOSE_MS;
 const info=db.prepare('INSERT INTO game_lobbies(creator_discord_id,creator_name,game,map_name,lobby_code,created_at,closes_at) VALUES(?,?,?,?,?,?,?)').run(String(creatorId),creatorName,game,mapName,lobbyCode,createdAt,closesAt);
 let l=getLobby(info.lastInsertRowid);
 const channelId=getSetting('discord_gatherings_channel_id');if(!channelId)throw new Error('Discord game-lobby не настроен. Выполни /setgatherchannel в нужном канале.');
 const ch=await state.client?.channels.fetch(channelId).catch(()=>null);if(!ch?.isTextBased?.())throw new Error('Discord game-lobby не найден.');
 const card=await createGameLobbyCard({game,mapName,code:lobbyCode,creatorName,createdAt,closesAt,status:'open'});
 const msg=await ch.send({content:'@everyone',files:[new AttachmentBuilder(card,{name:`gs-game-lobby-${l.id}.png`})],components:rows(l),allowedMentions:{parse:['everyone']}});
 db.prepare('UPDATE game_lobbies SET discord_channel_id=?,discord_message_id=? WHERE id=?').run(channelId,msg.id,l.id);
 const tg=getSetting('telegram_gatherings_chat_id'),thread=getSetting('telegram_gatherings_thread_id');

 if(!state.api){
  throw new Error('Telegram API не подключён к GS Game Lobby.');
 }

 if(!tg){
  throw new Error(
   'Telegram game-lobby не настроен. Выполни /setgatherchannel в нужной теме.'
  );
 }

 const tm=await state.api('sendMessage',{
  chat_id:tg,
  ...(thread?{message_thread_id:Number(thread)}:{}),
  text:tgText(l),
  parse_mode:'HTML',
  disable_web_page_preview:true,
  disable_notification:false,
  reply_markup:tgKeyboard(l)
 });

 db.prepare(
  'UPDATE game_lobbies SET telegram_chat_id=?,telegram_thread_id=?,telegram_message_id=? WHERE id=?'
 ).run(
  String(tg),
  thread?Number(thread):null,
  tm.message_id,
  l.id
 );

 return getLobby(l.id);
}
async function handleTelegramPinnedServiceMessage(message){
 if(!message?.pinned_message?.message_id)return false;

 const chatId=String(message.chat?.id||'');
 const pinnedMessageId=Number(message.pinned_message.message_id);
 const serviceMessageId=Number(message.message_id);
 const threadId=message.message_thread_id?Number(message.message_thread_id):null;

 const lobby=db.prepare(`
  SELECT id
  FROM game_lobbies
  WHERE status='open'
    AND telegram_chat_id=?
    AND telegram_message_id=?
    AND (
      telegram_thread_id IS NULL
      OR telegram_thread_id=?
    )
  ORDER BY id DESC
  LIMIT 1
 `).get(chatId,pinnedMessageId,threadId);

 if(!lobby)return false;

 db.prepare(`
  UPDATE game_lobbies
  SET telegram_pin_service_message_id=?
  WHERE id=?
 `).run(serviceMessageId,lobby.id);

 console.log(
  `[GameLobby] Telegram pin service saved: lobby=${lobby.id}, `+
  `message=${serviceMessageId}`
 );
 return true;
}

async function closeGameLobby(id){
 const l=getLobby(id);
 if(!l||l.status!=='open')return false;
 const closedAt=Date.now();
 const changed=db.prepare("UPDATE game_lobbies SET status='closed',closed_at=? WHERE id=? AND status='open'").run(closedAt,l.id);
 if(!changed.changes)return false;
 const c=getLobby(l.id);

 if(state.client&&c.discord_channel_id&&c.discord_message_id){
  const ch=await state.client.channels.fetch(c.discord_channel_id).catch(()=>null);
  const m=ch?await ch.messages.fetch(c.discord_message_id).catch(()=>null):null;
  if(m){
   await m.delete().catch(e=>console.error('[GameLobby] Discord delete:',e.message));
  }
 }

 if(state.api&&c.telegram_chat_id&&c.telegram_message_id){
  await state.api('deleteMessage',{
   chat_id:c.telegram_chat_id,
   message_id:c.telegram_message_id
  }).catch(e=>console.error('[GameLobby] Telegram delete:',e.message));
 }

 return true;
}
async function closeExpiredGameLobbies(){for(const r of db.prepare("SELECT id FROM game_lobbies WHERE status='open' AND closes_at<=?").all(Date.now()))await closeGameLobby(r.id);}
async function handleGameLobbyButton(i){if(!i.isButton()||!i.customId.startsWith('game_copy:'))return false;const l=getLobby(i.customId.split(':')[1]);if(!l||l.status!=='open'){await i.reply({content:'❌ Это лобби уже закрыто.',flags:MessageFlags.Ephemeral});return true;}if(!String(l.lobby_code||'').trim()){await i.reply({content:'ℹ️ Для этого лобби код не указан.',flags:MessageFlags.Ephemeral});return true;}await i.reply({content:`🔑 **Код / пароль**\n\`\`\`${l.lobby_code}\`\`\`\nНажми на значение, чтобы скопировать.`,flags:MessageFlags.Ephemeral});return true;}

async function handleGameLobbyTelegramCallback(api,callback,answerCallback){
 const data=callback?.data||'';
 if(!data.startsWith('game_lobby_close:'))return false;

 const id=Number(data.split(':')[1]);
 const lobby=getLobby(id);

 if(!lobby||lobby.status!=='open'){
  await answerCallback(api,callback.id,'Лобби уже закрыто.',true);
  return true;
 }

 const expectedCreator=`tg:${callback.from.id}`;
 if(String(lobby.creator_discord_id)!==expectedCreator){
  await answerCallback(
   api,
   callback.id,
   'Закрыть лобби может только тот, кто его создал.',
   true
  );
  return true;
 }

 // Сначала подтверждаем callback, затем удаляем сообщения на обеих площадках.
 await answerCallback(api,callback.id,'Лобби закрыто.');
 await closeGameLobby(id);
 return true;
}

module.exports={
 setGameLobbyRuntime,
 publishGameLobby,
 closeGameLobby,
 closeExpiredGameLobbies,
 handleGameLobbyButton,
 handleGameLobbyTelegramCallback,
 handleTelegramPinnedServiceMessage,
};
