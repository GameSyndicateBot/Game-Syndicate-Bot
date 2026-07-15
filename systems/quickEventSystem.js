const fs = require('fs');
const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const { db, getOrCreatePlayer, updatePlayer, addCardDust } = require('../database/db');
const { addXP } = require('../utils/levelSystem');
const { openRandomCard, PACK_TYPES } = require('../utils/cardSystem');
const { createQuickEventCard, createQuickEventWinnerCard } = require('../images/quickEvent/createQuickEventCard');
const { checkAchievements } = require('../utils/checkAchievements');

const CHANNEL_ID = '1526504061870932049';
const MIN_INTERVAL_MS = 2 * 60 * 60 * 1000;
const MAX_INTERVAL_MS = 3 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const ACTIVE_TTL_MS = 45 * 60 * 1000;

const WORDS = ['коллекция','синдикат','карточка','легендарный','достижение','аукцион','профиль','награда','сокровище','голографик','мифический','активность','сообщество','испытание','победитель'];
const PHRASES = [
  'Game Syndicate объединяет игроков',
  'Сегодня удача на моей стороне',
  'Коллекция растёт с каждым днём',
  'Первый правильный ответ побеждает',
  'Редкая карта уже совсем близко',
  'Вместе играть всегда интереснее',
  'Скорость и внимание решают всё',
];
const ODD_SETS = [
  {items:['Common','Rare','Epic','Discord','Legendary'],answer:'Discord'},
  {items:['Dust','Pack','Auction','Banana','Trade'],answer:'Banana'},
  {items:['Mythic','Exclusive','Holographic','Treasure','Telegram'],answer:'Telegram'},
  {items:['Профиль','Коллекция','Магазин','Аукцион','Холодильник'],answer:'Холодильник'},
  {items:['XP','Dust','Карточка','Уровень','Карандаш'],answer:'Карандаш'},
];
const FINISH = [
  {display:'Коллекц____',answers:['ия','коллекция']},
  {display:'Легенд____',answers:['арный','легендарный']},
  {display:'Аукц____',answers:['ион','аукцион']},
  {display:'Достиж____',answers:['ение','достижение']},
  {display:'Синдик____',answers:['ат','синдикат']},
  {display:'Голограф____',answers:['ик','голографик']},
];
const COLORS = [
  {name:'красный',hex:'#ff4f62'},{name:'синий',hex:'#4fa8ff'},{name:'зелёный',hex:'#59d97d'},
  {name:'жёлтый',hex:'#ffd75e'},{name:'фиолетовый',hex:'#b879ff'},{name:'оранжевый',hex:'#ff9b52'},
];
const TYPE_WEIGHTS = [
  ['unscramble',18],['math',16],['typing',14],['finish',12],['odd',10],['color',9],['memory',8],['reaction',6],['rarity',4],['avatar',3],
];

function initTables(){
  db.exec(`
    CREATE TABLE IF NOT EXISTS quick_event_rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_key TEXT NOT NULL UNIQUE,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      type TEXT NOT NULL,
      difficulty TEXT NOT NULL,
      prompt TEXT,
      answers_json TEXT NOT NULL,
      payload_json TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      winner_id TEXT,
      reward_type TEXT,
      reward_amount INTEGER DEFAULT 0,
      reward_details TEXT,
      created_at INTEGER NOT NULL,
      activated_at INTEGER,
      solved_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS quick_event_attempts (
      round_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      normalized_answer TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(round_id,user_id,normalized_answer)
    );
    CREATE INDEX IF NOT EXISTS idx_quick_event_status ON quick_event_rounds(status);
    CREATE INDEX IF NOT EXISTS idx_quick_event_winner ON quick_event_rounds(winner_id,solved_at);

    CREATE TABLE IF NOT EXISTS quick_event_player_stats (
      user_id TEXT PRIMARY KEY,
      total_wins INTEGER NOT NULL DEFAULT 0,
      current_streak INTEGER NOT NULL DEFAULT 0,
      best_streak INTEGER NOT NULL DEFAULT 0,
      types_json TEXT NOT NULL DEFAULT '[]',
      last_win_round_id INTEGER,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
  `);

  backfillQuickEventStats();

  db.prepare(`
    INSERT INTO quick_event_player_stats(
      user_id,total_wins,current_streak,best_streak,types_json,last_win_round_id,updated_at
    ) VALUES(?,2,2,2,'[]',NULL,?)
    ON CONFLICT(user_id) DO UPDATE SET
      total_wins = MAX(total_wins, 2),
      current_streak = MAX(current_streak, 2),
      best_streak = MAX(best_streak, 2),
      updated_at = excluded.updated_at
  `).run('830515570377097259', Date.now());
}

function parseTypes(value) {
  try {
    return Array.isArray(JSON.parse(value || '[]')) ? JSON.parse(value || '[]') : [];
  } catch {
    return [];
  }
}

function backfillQuickEventStats() {
  const existing = db.prepare(`
    SELECT COUNT(*) AS count FROM quick_event_player_stats
  `).get()?.count ?? 0;

  if (existing > 0) return;

  const rounds = db.prepare(`
    SELECT id, winner_id, type, solved_at
    FROM quick_event_rounds
    WHERE status = 'solved' AND winner_id IS NOT NULL
    ORDER BY COALESCE(solved_at, created_at) ASC, id ASC
  `).all();

  const stats = new Map();
  let previousWinner = null;

  for (const round of rounds) {
    const userId = String(round.winner_id);
    const current = stats.get(userId) || {
      totalWins: 0,
      currentStreak: 0,
      bestStreak: 0,
      types: new Set(),
      lastWinRoundId: null,
    };

    current.totalWins += 1;
    current.currentStreak = previousWinner === userId
      ? current.currentStreak + 1
      : 1;
    current.bestStreak = Math.max(current.bestStreak, current.currentStreak);
    current.types.add(round.type);
    current.lastWinRoundId = round.id;
    stats.set(userId, current);
    previousWinner = userId;
  }

  const insert = db.prepare(`
    INSERT OR REPLACE INTO quick_event_player_stats(
      user_id,total_wins,current_streak,best_streak,types_json,last_win_round_id,updated_at
    ) VALUES(?,?,?,?,?,?,?)
  `);

  const transaction = db.transaction(() => {
    for (const [userId, value] of stats) {
      insert.run(
        userId,
        value.totalWins,
        value.currentStreak,
        value.bestStreak,
        JSON.stringify([...value.types]),
        value.lastWinRoundId,
        Date.now(),
      );
    }
  });

  transaction();
}

function recordQuickEventWin(userId, eventType, roundId) {
  const previousWinner = db.prepare(`
    SELECT winner_id
    FROM quick_event_rounds
    WHERE status = 'solved'
      AND winner_id IS NOT NULL
      AND id < ?
    ORDER BY id DESC
    LIMIT 1
  `).get(roundId)?.winner_id;

  const existing = db.prepare(`
    SELECT *
    FROM quick_event_player_stats
    WHERE user_id = ?
  `).get(userId);

  const types = new Set(parseTypes(existing?.types_json));
  types.add(eventType);

  const currentStreak = String(previousWinner || '') === String(userId)
    ? Number(existing?.current_streak || 0) + 1
    : 1;

  const totalWins = Number(existing?.total_wins || 0) + 1;
  const bestStreak = Math.max(Number(existing?.best_streak || 0), currentStreak);

  db.prepare(`
    INSERT INTO quick_event_player_stats(
      user_id,total_wins,current_streak,best_streak,types_json,last_win_round_id,updated_at
    ) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET
      total_wins = excluded.total_wins,
      current_streak = excluded.current_streak,
      best_streak = excluded.best_streak,
      types_json = excluded.types_json,
      last_win_round_id = excluded.last_win_round_id,
      updated_at = excluded.updated_at
  `).run(
    String(userId),
    totalWins,
    currentStreak,
    bestStreak,
    JSON.stringify([...types]),
    roundId,
    Date.now(),
  );

  return { totalWins, currentStreak, bestStreak, uniqueTypes: types.size };
}

function normalize(text){return String(text??'').toLowerCase().replace(/ё/g,'е').replace(/[^a-zа-я0-9\s]/gi,' ').replace(/\s+/g,' ').trim();}
function shuffleWord(word){let out=word;for(let i=0;i<12&&out===word;i++)out=[...word].sort(()=>Math.random()-.5).join(' ');return out.toUpperCase();}
function randomInt(a,b){return a+Math.floor(Math.random()*(b-a+1));}
function pick(arr){return arr[Math.floor(Math.random()*arr.length)];}
function weightedType(){
  const last=db.prepare('SELECT type FROM quick_event_rounds ORDER BY id DESC LIMIT 1').get()?.type;
  const filtered=TYPE_WEIGHTS.filter(([t])=>t!==last);const total=filtered.reduce((s,[,w])=>s+w,0);let roll=Math.random()*total;
  for(const [t,w] of filtered){roll-=w;if(roll<=0)return t;}return filtered[0][0];
}
function difficulty(){const r=Math.random();return r<.48?'easy':r<.82?'medium':'hard';}
function mathEvent(diff){
  let a,b,c,op,prompt,answer;
  if(diff==='easy'){a=randomInt(8,45);b=randomInt(3,30);op=Math.random()<.5?'+':'−';answer=op==='+'?a+b:a-b;if(answer<0){[a,b]=[b,a];answer=a-b;}prompt=`${a} ${op} ${b} = ?`;}
  else if(diff==='medium'){a=randomInt(6,18);b=randomInt(3,12);c=randomInt(5,40);answer=a*b-c;prompt=`${a} × ${b} − ${c} = ?`;}
  else {a=randomInt(12,35);b=randomInt(4,15);c=randomInt(2,9);answer=(a+b)*c;prompt=`(${a} + ${b}) × ${c} = ?`;}
  return {prompt,answers:[String(answer)]};
}
function memoryEvent(diff){const len=diff==='easy'?5:diff==='medium'?7:9;const chars='246789ABCDEFGHJKLMNPQ';let seq='';for(let i=0;i<len;i++)seq+=chars[randomInt(0,chars.length-1)];return {display:seq,prompt:'Повтори последовательность по памяти',answers:[seq]};}
function rarityMedia(){
  const root=path.join(__dirname,'..','output-reference');
  const rarities=['common','rare','epic','legendary','mythic'];
  const rarity=pick(rarities);let files=[];
  try{for(const dir of fs.readdirSync(root)){const f=path.join(root,dir,`${dir}_${rarity}.png`);if(fs.existsSync(f))files.push(f);}}catch{}
  return {rarity,media:files.length?pick(files):null,answers:[rarity,({common:'обычная',rare:'редкая',epic:'эпическая',legendary:'легендарная',mythic:'мифическая'})[rarity]]};
}
async function avatarEvent(client){
  const channel=await client.channels.fetch(CHANNEL_ID).catch(()=>null);const guild=channel?.guild;if(!guild)return null;
  const members=await guild.members.fetch().catch(()=>guild.members.cache);const pool=[...members.values()].filter(m=>!m.user.bot&&m.displayName&&m.user.displayAvatarURL());if(!pool.length)return null;
  const member=pick(pool);const answers=[member.displayName,member.user.username,member.user.globalName].filter(Boolean);
  return {media:member.user.displayAvatarURL({extension:'png',size:256}),prompt:'Кто изображён на пиксельном аватаре?',answers};
}
async function buildEvent(client,type,diff){
  if(type==='unscramble'){const word=pick(WORDS);return {display:shuffleWord(word),prompt:shuffleWord(word),answers:[word]};}
  if(type==='math')return mathEvent(diff);
  if(type==='typing'){const phrase=pick(PHRASES);return {prompt:phrase,answers:[phrase]};}
  if(type==='odd'){const set=pick(ODD_SETS);return {prompt:set.items.join('   •   '),options:set.items,answers:[set.answer]};}
  if(type==='finish'){const item=pick(FINISH);return {prompt:item.display,answers:item.answers};}
  if(type==='color'){const word=pick(COLORS),ink=pick(COLORS.filter(c=>c.name!==word.name));return {display:word.name.toUpperCase(),colorHex:ink.hex,prompt:'Какого цвета текст?',answers:[ink.name]};}
  if(type==='memory')return memoryEvent(diff);
  if(type==='reaction')return {prompt:'Напиши «жми» после сигнала',answers:['жми']};
  if(type==='rarity')return rarityMedia();
  if(type==='avatar')return await avatarEvent(client) || {prompt:'Напиши Game Syndicate без ошибок',answers:['game syndicate']};
  return mathEvent(diff);
}
function pickEventTier(){
  const roll=Math.random()*100;
  if(roll<0.2)return 'jackpot';
  if(roll<1.2)return 'golden';
  return 'normal';
}
function baseReward(diff){
  const r=Math.random()*100;
  if(diff==='easy'){
    if(r<80)return{type:'dust',amount:30,label:'30 GS Dust'};
    if(r<98)return{type:'xp',amount:75,label:'75 XP'};
    return{type:'base_pack',amount:1,label:'Base Pack'};
  }
  if(diff==='medium'){
    if(r<75)return{type:'dust',amount:60,label:'60 GS Dust'};
    if(r<96)return{type:'xp',amount:150,label:'150 XP'};
    return{type:'base_pack',amount:1,label:'Base Pack'};
  }
  if(r<68)return{type:'dust',amount:100,label:'100 GS Dust'};
  if(r<92)return{type:'xp',amount:250,label:'250 XP'};
  if(r<99)return{type:'base_pack',amount:1,label:'Base Pack'};
  return{type:'premium_pack',amount:1,label:'Premium Pack'};
}
function pickReward(diff,tier='normal'){
  if(tier==='jackpot'){
    const roll=Math.random()*100;
    if(roll<60)return{type:'dust',amount:300,label:'300 GS Dust',tier};
    if(roll<90)return{type:'base_pack',amount:1,label:'Base Pack',tier};
    return{type:'premium_pack',amount:1,label:'Premium Pack',tier};
  }
  const reward=baseReward(diff);
  if(tier==='golden'){
    if(reward.type==='dust'||reward.type==='xp'){
      reward.amount*=2;
      reward.label=`${reward.amount} ${reward.type==='dust'?'GS Dust':'XP'}`;
    }else if(reward.type==='base_pack'){
      reward.type='premium_pack';
      reward.label='Premium Pack';
    }
  }
  return{...reward,tier};
}
function grantReward(user,reward){
  getOrCreatePlayer(user);
  if(reward.type==='dust'){const balance=addCardDust(user.id,reward.amount);return{...reward,details:`Баланс: ${balance} Dust`};}
  if(reward.type==='xp'){const player=getOrCreatePlayer(user);const updated=addXP(player,reward.amount);updatePlayer(updated);return{...reward,details:`Уровень: ${updated.level}`};}
  const packId=reward.type==='premium_pack'?'premium':'base',pack=PACK_TYPES[packId]??PACK_TYPES.base;const drop=openRandomCard(user.id,{source:`quick_event_${packId}`,allowTreasure:true,rarityChances:pack.chances});
  return{...reward,details:`${drop.rarityName}: ${drop.card.name} #${String(drop.copyNumber).padStart(4,'0')}`};
}
function randomDelay(){return MIN_INTERVAL_MS+Math.floor(Math.random()*(MAX_INTERVAL_MS-MIN_INTERVAL_MS+1));}
function roundKey(){return `quick-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;}
async function activateRound(channel,message,id,event,phase='active'){
  const card=await createQuickEventCard(event,phase);await message.edit({content:'## ⚡ GS Quick Event\nПервый правильный ответ получает награду.',files:[new AttachmentBuilder(card,{name:'gs-quick-event.png'})],attachments:[]});
  db.prepare("UPDATE quick_event_rounds SET status='active',activated_at=? WHERE id=? AND status='pending'").run(Date.now(),id);
}
async function postQuickEvent(client){
  initTables();db.prepare("UPDATE quick_event_rounds SET status='expired' WHERE status IN ('active','pending')").run();
  const channel=await client.channels.fetch(CHANNEL_ID).catch(()=>null);if(!channel?.isTextBased())return console.error('[QuickEvent] Канал не найден:',CHANNEL_ID);
  const type=weightedType(),diff=difficulty(),tier=pickEventTier(),event=await buildEvent(client,type,diff);event.type=type;event.difficulty=diff;event.tier=tier;
  const now=Date.now();const info=db.prepare(`INSERT INTO quick_event_rounds(round_key,channel_id,type,difficulty,prompt,answers_json,payload_json,created_at) VALUES(?,?,?,?,?,?,?,?)`).run(roundKey(),CHANNEL_ID,type,diff,event.prompt||event.display||'',JSON.stringify(event.answers||[]),JSON.stringify({...event,media:undefined}),now);
  let phase='active';if(type==='memory')phase='show';if(type==='reaction')phase='ready';
  const card=await createQuickEventCard(event,phase);const message=await channel.send({content:'## ⚡ GS Quick Event\nСобытие начинается!',files:[new AttachmentBuilder(card,{name:'gs-quick-event.png'})]});
  db.prepare('UPDATE quick_event_rounds SET message_id=? WHERE id=?').run(message.id,info.lastInsertRowid);
  if(type==='memory')setTimeout(()=>activateRound(channel,message,info.lastInsertRowid,event,'active').catch(console.error),7000);
  else if(type==='reaction')setTimeout(()=>activateRound(channel,message,info.lastInsertRowid,event,'go').catch(console.error),randomInt(3000,8000));
  else db.prepare("UPDATE quick_event_rounds SET status='active',activated_at=? WHERE id=?").run(Date.now(),info.lastInsertRowid);
}
async function handleQuickEventAnswer(message){
  if(!message.guild||message.author.bot||message.channel.id!==CHANNEL_ID)return false;initTables();
  const round=db.prepare("SELECT * FROM quick_event_rounds WHERE channel_id=? AND status='active' ORDER BY id DESC LIMIT 1").get(CHANNEL_ID);if(!round)return false;
  if(Date.now()-(round.activated_at||round.created_at)>ACTIVE_TTL_MS)return false;
  const answer=normalize(message.content);if(!answer)return false;const attempts=db.prepare('SELECT COUNT(*) count FROM quick_event_attempts WHERE round_id=? AND user_id=?').get(round.id,message.author.id)?.count??0;if(attempts>=MAX_ATTEMPTS)return true;
  const inserted=db.prepare('INSERT OR IGNORE INTO quick_event_attempts(round_id,user_id,normalized_answer,created_at) VALUES(?,?,?,?)').run(round.id,message.author.id,answer,Date.now());if(!inserted.changes)return true;
  const accepted=JSON.parse(round.answers_json).map(normalize);if(!accepted.includes(answer))return true;
  const won=db.prepare("UPDATE quick_event_rounds SET status='solved',winner_id=?,solved_at=? WHERE id=? AND status='active'").run(message.author.id,Date.now(),round.id);if(!won.changes)return true;
  const payload=JSON.parse(round.payload_json||'{}');const tier=payload.tier||'normal';const reward=grantReward(message.author,pickReward(round.difficulty,tier));db.prepare('UPDATE quick_event_rounds SET reward_type=?,reward_amount=?,reward_details=? WHERE id=?').run(reward.type,reward.amount,reward.details,round.id);
  const quickStats=recordQuickEventWin(message.author.id,round.type,round.id);
  let achievementResult=null;
  try{
    const player=getOrCreatePlayer(message.author);
    achievementResult=await checkAchievements({message,player,member:message.member});
  }catch(error){
    console.error('[QuickEvent Achievements]',error);
  }
  const winnerName=message.member?.displayName??message.author.globalName??message.author.username;const card=await createQuickEventWinnerCard({type:round.type,winnerName,reward,tier});
  const tierTitle=tier==='jackpot'?'💎 JACKPOT EVENT':tier==='golden'?'👑 GOLDEN EVENT':'⚡ QUICK EVENT';await message.reply({content:`## ${tierTitle} — победа!\n${message.author} первым дал правильный ответ и получает **${reward.label}**.\nПобед всего: **${quickStats.totalWins}** • Текущая серия: **${quickStats.currentStreak}** • Лучшая серия: **${quickStats.bestStreak}**`,files:[new AttachmentBuilder(card,{name:'gs-quick-event-winner.png'})],allowedMentions:{repliedUser:false}});return true;
}
function startQuickEventScheduler(client){
  initTables();let timer=null,posting=false;
  const schedule=(delay=randomDelay())=>{if(timer)clearTimeout(timer);timer=setTimeout(async()=>{if(posting)return schedule();posting=true;try{await postQuickEvent(client);}catch(e){console.error('[QuickEvent]',e);}finally{posting=false;schedule();}},Math.max(1000,delay));};
  const last=db.prepare('SELECT created_at FROM quick_event_rounds ORDER BY id DESC LIMIT 1').get();const age=last?Date.now()-Number(last.created_at):null;
  if(!last||age>=MAX_INTERVAL_MS){setTimeout(async()=>{if(posting)return;posting=true;try{await postQuickEvent(client);}catch(e){console.error('[QuickEvent]',e);}finally{posting=false;schedule();}},2500);}else{const min=Math.max(0,MIN_INTERVAL_MS-age),max=Math.max(min,MAX_INTERVAL_MS-age);schedule(min+Math.floor(Math.random()*(max-min+1)));}
  console.log('[QuickEvent] Запущено: первое событие сразу, затем случайно через 2–3 часа');
}
module.exports={startQuickEventScheduler,handleQuickEventAnswer,postQuickEvent};
