const { db, getSetting, setSetting } = require('./ecosystemDb');
const { QUESTIONS, CATEGORY_MAP } = require('./blitzQuestions');

const MIN_PLAYERS=2, LOBBY_SECONDS=10, QUESTION_SECONDS=7, BETWEEN_MS=2200, MAX_ROUNDS=25;
let api=null;
const games=new Map();
const timers=new Map();

function threadOf(message){ return message.message_thread_id ? Number(message.message_thread_id) : null; }
function key(chatId,threadId){ return `${chatId}:${threadId||0}`; }
function displayName(user){ return user.username?`@${user.username}`:[user.first_name,user.last_name].filter(Boolean).join(' ')||`ID ${user.id}`; }
function esc(s){ return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function sample(arr){ return arr[Math.floor(Math.random()*arr.length)]; }
function shuffle(arr){ const x=[...arr]; for(let i=x.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[x[i],x[j]]=[x[j],x[i]];} return x; }
function clearTimer(k){ const t=timers.get(k); if(t) clearTimeout(t); timers.delete(k); }
function later(k,fn,ms){ clearTimer(k); timers.set(k,setTimeout(()=>{timers.delete(k);fn().catch(e=>console.error('Blitz timer:',e));},ms)); }

function initDb(){
 db.exec(`
 CREATE TABLE IF NOT EXISTS telegram_blitz_players(
 user_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, username TEXT,
 rating INTEGER NOT NULL DEFAULT 1000, wins INTEGER NOT NULL DEFAULT 0,
 games INTEGER NOT NULL DEFAULT 0, correct_answers INTEGER NOT NULL DEFAULT 0,
 total_answers INTEGER NOT NULL DEFAULT 0, win_streak INTEGER NOT NULL DEFAULT 0,
 best_streak INTEGER NOT NULL DEFAULT 0, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS telegram_blitz_matches(
 id INTEGER PRIMARY KEY AUTOINCREMENT, chat_id TEXT NOT NULL, thread_id INTEGER,
 category TEXT, player_count INTEGER NOT NULL, winner_id TEXT, rounds INTEGER NOT NULL DEFAULT 0,
 started_at TEXT DEFAULT CURRENT_TIMESTAMP, finished_at TEXT);
 `);
}
initDb();

function upsertPlayer(user){
 db.prepare(`INSERT INTO telegram_blitz_players(user_id,display_name,username)
 VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET display_name=excluded.display_name,username=excluded.username,updated_at=CURRENT_TIMESTAMP`)
 .run(String(user.id),displayName(user),user.username||null);
}
function playerRow(id){ return db.prepare('SELECT * FROM telegram_blitz_players WHERE user_id=?').get(String(id)); }
function changeRating(id,delta){ db.prepare('UPDATE telegram_blitz_players SET rating=MAX(0,rating+?),updated_at=CURRENT_TIMESTAMP WHERE user_id=?').run(delta,String(id)); }

function lobbyText(g){
 const queued=[...g.queue.values()];
 return ['⚡ <b>GS BLITZ</b>','',g.status==='countdown'?'🟡 Игра скоро начнётся':'🟢 Ожидание игроков',
 `👥 Записалось: <b>${queued.length}</b>`, `Минимум для старта: <b>${MIN_PLAYERS}</b>`,'',
 queued.length?queued.map((p,i)=>`${i+1}. ${esc(p.name)}`).join('\n'):'Нажми кнопку ниже, чтобы войти в игру.','',
 'Побеждает последний оставшийся игрок.'].join('\n');
}
function lobbyKeyboard(g){ return {inline_keyboard:[[{text:g.status==='countdown'?'✅ Я участвую':'🎮 Играть',callback_data:'blitz_join'}],[{text:'🏆 Топ',callback_data:'blitz_top'},{text:'📊 Моя статистика',callback_data:'blitz_stats'}]]}; }
async function editLobby(g){
 if(!g.lobbyMessageId) return;
 await api('editMessageText',{chat_id:g.chatId,message_id:g.lobbyMessageId,text:lobbyText(g),parse_mode:'HTML',reply_markup:lobbyKeyboard(g)}).catch(()=>null);
}
async function createLobby(chatId,threadId){
 const k=key(chatId,threadId); clearTimer(k);
 const old=games.get(k);
 const g={chatId:String(chatId),threadId,status:'lobby',queue:old?.nextQueue||new Map(),nextQueue:new Map(),players:new Map(),alive:new Set(),answers:new Map(),round:0,used:new Set(),category:null,lobbyMessageId:null,questionMessageId:null,matchId:null};
 games.set(k,g);
 const msg=await api('sendMessage',{chat_id:chatId,...(threadId?{message_thread_id:threadId}:{}),text:lobbyText(g),parse_mode:'HTML',reply_markup:lobbyKeyboard(g)});
 g.lobbyMessageId=msg.message_id;
 setSetting('telegram_blitz_chat_id',String(chatId)); setSetting('telegram_blitz_thread_id',threadId?String(threadId):''); setSetting('telegram_blitz_lobby_message_id',String(msg.message_id));
 await api('pinChatMessage',{chat_id:chatId,message_id:msg.message_id,disable_notification:true}).catch(()=>null);
 if(g.queue.size>=MIN_PLAYERS) startCountdown(g);
 return g;
}
async function setup(message,isAdmin){
 if(!isAdmin) return false;
 const chatId=message.chat.id, threadId=threadOf(message);
 const current=games.get(key(chatId,threadId)); if(current) clearTimer(key(chatId,threadId));
 await createLobby(chatId,threadId);
 await api('sendMessage',{chat_id:chatId,...(threadId?{message_thread_id:threadId}:{}),text:'✅ Этот чат назначен постоянным каналом GS Blitz.'});
 return true;
}
function startCountdown(g){
 if(g.status!=='lobby'||g.queue.size<MIN_PLAYERS) return;
 g.status='countdown'; editLobby(g);
 const k=key(g.chatId,g.threadId);
 api('sendMessage',{chat_id:g.chatId,...(g.threadId?{message_thread_id:g.threadId}:{}),text:`⚡ Набралось ${g.queue.size} игроков. Старт через ${LOBBY_SECONDS} секунд!`}).catch(()=>null);
 later(k,async()=>{ if(g.queue.size<MIN_PLAYERS){g.status='lobby';await editLobby(g);return;} await beginMatch(g);},LOBBY_SECONDS*1000);
}
async function beginMatch(g){
 g.status='playing'; g.players=new Map(g.queue); g.queue.clear(); g.alive=new Set(g.players.keys()); g.round=0; g.used.clear();
 const cats=[...new Set(QUESTIONS.map(x=>x.category))]; g.category=sample(cats);
 const res=db.prepare('INSERT INTO telegram_blitz_matches(chat_id,thread_id,category,player_count) VALUES(?,?,?,?)').run(g.chatId,g.threadId,g.category,g.players.size); g.matchId=res.lastInsertRowid;
 for(const p of g.players.values()){upsertPlayer(p.user);db.prepare('UPDATE telegram_blitz_players SET games=games+1,total_answers=total_answers WHERE user_id=?').run(p.id);}
 await api('sendMessage',{chat_id:g.chatId,...(g.threadId?{message_thread_id:g.threadId}:{}),text:`🎮 <b>GS BLITZ начинается!</b>\n\nКатегория: ${CATEGORY_MAP[g.category]}\nИгроков: <b>${g.players.size}</b>`,parse_mode:'HTML'});
 await askQuestion(g);
}
function nextQuestion(g){
 let pool=QUESTIONS.filter(q=>q.category===g.category&&!g.used.has(q.id));
 if(!pool.length){g.used.clear();pool=QUESTIONS.filter(q=>q.category===g.category);}
 const q=sample(pool);g.used.add(q.id);return q;
}
async function askQuestion(g){
 if(g.alive.size<=1||g.round>=MAX_ROUNDS){return finishMatch(g);}
 g.round++;g.answers.clear();g.current=nextQuestion(g);
 const rows=g.current.answers.map((a,i)=>[{text:`${i+1}️⃣ ${a}`,callback_data:`blitz_answer:${g.round}:${i}`}]);
 const text=[`⚡ <b>Раунд ${g.round}</b>`,`Категория: ${CATEGORY_MAP[g.category]}`,'',`❓ ${esc(g.current.text)}`,'',`⏳ На ответ: ${QUESTION_SECONDS} секунд`,`👥 В игре: ${g.alive.size}`].join('\n');
 const msg=await api('sendMessage',{chat_id:g.chatId,...(g.threadId?{message_thread_id:g.threadId}:{}),text,parse_mode:'HTML',reply_markup:{inline_keyboard:rows}});g.questionMessageId=msg.message_id;
 later(key(g.chatId,g.threadId),()=>resolveRound(g),QUESTION_SECONDS*1000);
}
async function resolveRound(g){
 if(g.status!=='playing') return;
 const correct=[]; const eliminated=[];
 for(const id of g.alive){
   const ans=g.answers.get(id); const row=playerRow(id); if(ans!==undefined) db.prepare('UPDATE telegram_blitz_players SET total_answers=total_answers+1 WHERE user_id=?').run(id);
   if(ans===g.current.correctIndex){correct.push(id);changeRating(id,2);db.prepare('UPDATE telegram_blitz_players SET correct_answers=correct_answers+1 WHERE user_id=?').run(id);} else eliminated.push(id);
 }
 let nobody=false;
 if(correct.length===0){nobody=true;} else {for(const id of eliminated) g.alive.delete(id);}
 await api('editMessageReplyMarkup',{chat_id:g.chatId,message_id:g.questionMessageId,reply_markup:{inline_keyboard:[]}}).catch(()=>null);
 const correctText=g.current.answers[g.current.correctIndex];
 const lines=[`✅ Правильный ответ: <b>${esc(correctText)}</b>`,''];
 if(nobody) lines.push('😄 Никто не ответил правильно — все остаются в игре.');
 else {lines.push(`🟢 Прошли дальше: <b>${correct.length}</b>`); if(eliminated.length) lines.push(`🔴 Выбыли: <b>${eliminated.length}</b>`);}
 if(g.current.explanation) lines.push('',esc(g.current.explanation));
 await api('sendMessage',{chat_id:g.chatId,...(g.threadId?{message_thread_id:g.threadId}:{}),text:lines.join('\n'),parse_mode:'HTML'});
 later(key(g.chatId,g.threadId),()=>askQuestion(g),BETWEEN_MS);
}
async function finishMatch(g){
 clearTimer(key(g.chatId,g.threadId));
 let winnerId=g.alive.size===1?[...g.alive][0]:null;
 if(!winnerId&&g.alive.size>1){
   const ranked=[...g.alive].map(id=>[id,[...g.answers.entries()].filter(([uid,a])=>uid===id&&a===g.current?.correctIndex).length]);winnerId=ranked[0]?.[0]||null;
 }
 if(winnerId){
   const p=g.players.get(winnerId); const bonus=20+Math.max(0,(g.players.size-1)*2);changeRating(winnerId,bonus);
   db.prepare(`UPDATE telegram_blitz_players SET wins=wins+1,win_streak=win_streak+1,best_streak=MAX(best_streak,win_streak+1) WHERE user_id=?`).run(winnerId);
   for(const id of g.players.keys()) if(id!==winnerId) db.prepare('UPDATE telegram_blitz_players SET win_streak=0 WHERE user_id=?').run(id);
   const row=playerRow(winnerId);
   await api('sendMessage',{chat_id:g.chatId,...(g.threadId?{message_thread_id:g.threadId}:{}),text:`🏆 <b>Победитель GS Blitz</b>\n\n👑 ${esc(p.name)}\n⭐ +${bonus} рейтинга за победу\n📈 Рейтинг: <b>${row.rating}</b>\n🔥 Серия побед: <b>${row.win_streak}</b>`,parse_mode:'HTML'});
 }
 db.prepare('UPDATE telegram_blitz_matches SET winner_id=?,rounds=?,finished_at=CURRENT_TIMESTAMP WHERE id=?').run(winnerId,g.round,g.matchId);
 g.status='finished';
 later(key(g.chatId,g.threadId),async()=>{await createLobby(g.chatId,g.threadId);},4000);
}
async function join(callback){
 const message=callback.message, from=callback.from; const g=games.get(key(message.chat.id,threadOf(message)));
 if(!g){return api('answerCallbackQuery',{callback_query_id:callback.id,text:'Лобби не найдено. Администратор должен выполнить /setblitz.',show_alert:true});}
 upsertPlayer(from); const p={id:String(from.id),name:displayName(from),user:from};
 if(g.status==='playing'||g.status==='finished'){
   if(g.nextQueue.has(p.id)){g.nextQueue.delete(p.id);await api('answerCallbackQuery',{callback_query_id:callback.id,text:'Ты вышел из очереди следующей игры.'});}
   else {g.nextQueue.set(p.id,p);await api('answerCallbackQuery',{callback_query_id:callback.id,text:'Ты записан в следующую игру!'});} return true;
 }
 if(g.queue.has(p.id)){g.queue.delete(p.id);await api('answerCallbackQuery',{callback_query_id:callback.id,text:'Ты вышел из очереди.'});}
 else {g.queue.set(p.id,p);await api('answerCallbackQuery',{callback_query_id:callback.id,text:'Ты в игре!'});}
 await editLobby(g);
 if(g.status==='lobby'&&g.queue.size>=MIN_PLAYERS) startCountdown(g);
 if(g.status==='countdown'&&g.queue.size<MIN_PLAYERS){clearTimer(key(g.chatId,g.threadId));g.status='lobby';await editLobby(g);}
 return true;
}
async function answer(callback){
 const m=callback.message,g=games.get(key(m.chat.id,threadOf(m))); if(!g||g.status!=='playing') return false;
 const [,roundRaw,idxRaw]=callback.data.split(':'); const id=String(callback.from.id),round=Number(roundRaw),idx=Number(idxRaw);
 if(round!==g.round){await api('answerCallbackQuery',{callback_query_id:callback.id,text:'Этот вопрос уже завершён.'});return true;}
 if(!g.alive.has(id)){await api('answerCallbackQuery',{callback_query_id:callback.id,text:'Ты уже выбыл.',show_alert:true});return true;}
 if(g.answers.has(id)){await api('answerCallbackQuery',{callback_query_id:callback.id,text:'Ответ уже принят.'});return true;}
 g.answers.set(id,idx); await api('answerCallbackQuery',{callback_query_id:callback.id,text:'Ответ принят!'}); return true;
}
async function top(chatId,threadId){
 const rows=db.prepare('SELECT * FROM telegram_blitz_players ORDER BY rating DESC,wins DESC,correct_answers DESC LIMIT 15').all();
 const text=['🏆 <b>Топ GS Blitz</b>','',...(rows.length?rows.map((r,i)=>`${i+1}. ${esc(r.display_name)} — <b>${r.rating}</b> ⭐ | побед: ${r.wins}`):['Пока никто не сыграл.'])].join('\n');
 return api('sendMessage',{chat_id:chatId,...(threadId?{message_thread_id:threadId}:{}),text,parse_mode:'HTML'});
}
async function stats(chatId,threadId,user){upsertPlayer(user);const r=playerRow(user.id);const acc=r.total_answers?Math.round(r.correct_answers/r.total_answers*100):0;return api('sendMessage',{chat_id:chatId,...(threadId?{message_thread_id:threadId}:{}),text:`📊 <b>Статистика GS Blitz</b>\n\nИгрок: ${esc(r.display_name)}\n⭐ Рейтинг: <b>${r.rating}</b>\n🏆 Победы: <b>${r.wins}</b>\n🎮 Игры: <b>${r.games}</b>\n✅ Правильные ответы: <b>${r.correct_answers}</b>\n🎯 Точность: <b>${acc}%</b>\n🔥 Лучшая серия: <b>${r.best_streak}</b>`,parse_mode:'HTML'});}
async function handleText(message,isAdmin){
 const cmd=(message.text||'').trim().split(/\s+/)[0].split('@')[0].toLowerCase();
 if(cmd==='/setblitz') {
  if(!isAdmin){
    await api('sendMessage',{chat_id:message.chat.id,...(threadOf(message)?{message_thread_id:threadOf(message)}:{}),text:'❌ Команду /setblitz может использовать только администратор группы.'});
    return true;
  }
  return setup(message,true);
 }
 if(cmd==='/blitztop'){await top(message.chat.id,threadOf(message));return true;}
 if(cmd==='/blitzstats'){await stats(message.chat.id,threadOf(message),message.from);return true;}
 if(cmd==='/blitzreset'&&isAdmin){await createLobby(message.chat.id,threadOf(message));return true;}
 return false;
}
async function handleCallback(callback){
 const d=callback.data||''; if(d==='blitz_join') return join(callback); if(d.startsWith('blitz_answer:')) return answer(callback);
 if(d==='blitz_top'){await api('answerCallbackQuery',{callback_query_id:callback.id});await top(callback.message.chat.id,threadOf(callback.message));return true;}
 if(d==='blitz_stats'){await api('answerCallbackQuery',{callback_query_id:callback.id});await stats(callback.message.chat.id,threadOf(callback.message),callback.from);return true;}
 return false;
}
async function init(telegramApi){api=telegramApi;const chatId=getSetting('telegram_blitz_chat_id');if(!chatId)return;const threadRaw=getSetting('telegram_blitz_thread_id');const threadId=threadRaw?Number(threadRaw):null;await createLobby(chatId,threadId).catch(e=>console.error('Blitz restore:',e.message));}
module.exports={init,handleText,handleCallback,QUESTION_COUNT:QUESTIONS.length,CATEGORY_COUNT:Object.keys(CATEGORY_MAP).length};
