const fs = require('fs');
const path = require('path');
const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreatePlayer, addCardDust } = require('../database/db');
const { addPack } = require('../utils/packInventory');
const { createQuickEventCard, createQuickEventWinnerCard } = require('../images/quickEvent/createQuickEventCard');
const { getServerDisplayName } = require('../utils/displayName');
const { checkAchievements } = require('../utils/checkAchievements');

const CHANNEL_ID = '1526504061870932049';
const MIN_INTERVAL_MS = 45 * 60 * 1000;
const MAX_INTERVAL_MS = 75 * 60 * 1000;
const BONUS_INTERVAL_MIN_MS = 20 * 60 * 1000;
const BONUS_INTERVAL_MAX_MS = 30 * 60 * 1000;
const BONUS_INTERVAL_CHANCE = 0.10;
const LOW_ONLINE_RETRY_MIN_MS = 10 * 60 * 1000;
const LOW_ONLINE_RETRY_MAX_MS = 15 * 60 * 1000;
const MIN_ONLINE_MEMBERS = 4;
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
    CREATE TABLE IF NOT EXISTS quick_event_memory_views (
      round_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      viewed_at INTEGER NOT NULL,
      PRIMARY KEY(round_id,user_id)
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
    CREATE TABLE IF NOT EXISTS quick_event_participation (
      round_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(round_id,user_id)
    );
    CREATE TABLE IF NOT EXISTS quick_event_pack_drops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      round_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      pack_type TEXT NOT NULL,
      amount INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quick_event_milestone_rewards (
      user_id TEXT NOT NULL,
      reward_key TEXT NOT NULL,
      awarded_at INTEGER NOT NULL,
      PRIMARY KEY(user_id,reward_key)
    );
    CREATE TABLE IF NOT EXISTS quick_event_weekly_rewards (
      week_key TEXT NOT NULL,
      user_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      reward_type TEXT NOT NULL,
      reward_amount INTEGER NOT NULL,
      awarded_at INTEGER NOT NULL,
      PRIMARY KEY(week_key,user_id)
    );
    CREATE TABLE IF NOT EXISTS quick_event_daily_state (
      date_key TEXT PRIMARY KEY,
      golden_created INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS quick_event_scheduler_state (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      next_event_at INTEGER,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO quick_event_scheduler_state(id,next_event_at,updated_at)
    VALUES(1,NULL,0);
  `);

  const ensureColumn = (table, column, definition) => {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some(item => item.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };
  ensureColumn('quick_event_player_stats','played','INTEGER NOT NULL DEFAULT 0');
  ensureColumn('quick_event_player_stats','weekly_wins','INTEGER NOT NULL DEFAULT 0');
  ensureColumn('quick_event_player_stats','golden_wins','INTEGER NOT NULL DEFAULT 0');
  ensureColumn('quick_event_player_stats','base_packs','INTEGER NOT NULL DEFAULT 0');
  ensureColumn('quick_event_player_stats','premium_packs','INTEGER NOT NULL DEFAULT 0');
  ensureColumn('quick_event_player_stats','elite_packs','INTEGER NOT NULL DEFAULT 0');

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

function moscowDateKey(timestamp = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(timestamp));
}
function moscowHour(timestamp = Date.now()) {
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Moscow', hour: '2-digit', hour12: false,
  }).format(new Date(timestamp)));
}
function pickEventTier(){
  const dateKey = moscowDateKey();
  const state = db.prepare('SELECT golden_created FROM quick_event_daily_state WHERE date_key=?').get(dateKey);
  if (Number(state?.golden_created || 0)) return 'normal';

  const forceGolden = moscowHour() >= 18;
  if (forceGolden || Math.random() < 0.15) {
    db.prepare(`
      INSERT INTO quick_event_daily_state(date_key,golden_created,updated_at)
      VALUES(?,1,?)
      ON CONFLICT(date_key) DO UPDATE SET golden_created=1,updated_at=excluded.updated_at
    `).run(dateKey,Date.now());
    return 'golden';
  }
  return 'normal';
}
function pickPackReward(tier='normal') {
  const roll = Math.random() * 100;
  if (tier === 'golden') {
    if (roll < 2) return { type:'elite_pack', amount:1, label:'Elite Pack' };
    if (roll < 14) return { type:'premium_pack', amount:1, label:'Premium Pack' };
    return null;
  }
  if (roll < 0.3) return { type:'elite_pack', amount:1, label:'Elite Pack' };
  if (roll < 2.3) return { type:'premium_pack', amount:1, label:'Premium Pack' };
  if (roll < 17.3) return { type:'base_pack', amount:1, label:'Base Pack' };
  return null;
}
function pickReward(diff,tier='normal'){
  const dust = tier === 'golden' ? randomInt(500,800) : randomInt(150,400);
  return {
    type:'dust',
    amount:dust,
    label:`${dust} GS Dust`,
    tier,
    packReward:pickPackReward(tier),
  };
}
function recordPackDrop(roundId,userId,packType,amount=1){
  const type = packType === 'base_pack' ? 'base' : packType === 'premium_pack' ? 'premium' : 'elite';
  addPack(userId,type,amount);
  db.prepare(`INSERT INTO quick_event_pack_drops(round_id,user_id,pack_type,amount,created_at) VALUES(?,?,?,?,?)`)
    .run(roundId,String(userId),type,amount,Date.now());
  const column = type === 'base' ? 'base_packs' : type === 'premium' ? 'premium_packs' : 'elite_packs';
  db.prepare(`UPDATE quick_event_player_stats SET ${column}=COALESCE(${column},0)+? WHERE user_id=?`)
    .run(amount,String(userId));
  return type;
}
function grantReward(user,reward,roundId){
  getOrCreatePlayer(user);
  const balance=addCardDust(user.id,reward.amount);
  let packDetails=null;
  if(reward.packReward){
    const packType=recordPackDrop(roundId,user.id,reward.packReward.type,reward.packReward.amount);
    packDetails={...reward.packReward,packType};
  }
  return{...reward,packReward:packDetails,details:`Баланс: ${balance} Dust`};
}
function randomDelay(){
  if(Math.random()<BONUS_INTERVAL_CHANCE){
    return BONUS_INTERVAL_MIN_MS+Math.floor(Math.random()*(BONUS_INTERVAL_MAX_MS-BONUS_INTERVAL_MIN_MS+1));
  }
  return MIN_INTERVAL_MS+Math.floor(Math.random()*(MAX_INTERVAL_MS-MIN_INTERVAL_MS+1));
}
function lowOnlineRetryDelay(){
  return LOW_ONLINE_RETRY_MIN_MS+Math.floor(Math.random()*(LOW_ONLINE_RETRY_MAX_MS-LOW_ONLINE_RETRY_MIN_MS+1));
}
function getVisibleOnlineCount(guild){
  const members=[...guild.members.cache.values()].filter(member=>!member.user.bot);
  const withPresence=members.filter(member=>member.presence);
  if(!withPresence.length) return null;
  return withPresence.filter(member=>member.presence.status && member.presence.status!=='offline').length;
}
function milestoneReward(userId,totalWins,currentStreak){
  const rewards=[];
  const tryAward=(key,callback)=>{
    const inserted=db.prepare(`INSERT OR IGNORE INTO quick_event_milestone_rewards(user_id,reward_key,awarded_at) VALUES(?,?,?)`)
      .run(String(userId),key,Date.now());
    if(inserted.changes){callback();rewards.push(key);}
  };
  if(currentStreak===3)tryAward('streak_3',()=>addCardDust(userId,300));
  if(currentStreak===5)tryAward('streak_5',()=>addCardDust(userId,800));
  if(currentStreak===10)tryAward('streak_10',()=>addPack(userId,'premium',1));
  if(currentStreak===25)tryAward('streak_25',()=>addPack(userId,'elite',1));
  if(totalWins>0&&totalWins%100===0){
    tryAward(`total_${totalWins}`,()=>addPack(userId,'elite',1));
  }
  return rewards;
}
function markParticipation(roundId,userId){
  const inserted=db.prepare(`INSERT OR IGNORE INTO quick_event_participation(round_id,user_id,created_at) VALUES(?,?,?)`)
    .run(roundId,String(userId),Date.now());
  if(inserted.changes){
    db.prepare(`
      INSERT INTO quick_event_player_stats(user_id,played,updated_at)
      VALUES(?,1,?)
      ON CONFLICT(user_id) DO UPDATE SET played=COALESCE(played,0)+1,updated_at=excluded.updated_at
    `).run(String(userId),Date.now());
  }
}
function weekKey(timestamp=Date.now()){
  const date=new Date(timestamp);const day=(date.getUTCDay()+6)%7;
  date.setUTCDate(date.getUTCDate()-day);date.setUTCHours(0,0,0,0);
  return date.toISOString().slice(0,10);
}
async function awardPreviousWeek(client){
  const now=new Date();
  const currentWeek=weekKey(now.getTime());
  const previousStart=new Date(`${currentWeek}T00:00:00Z`).getTime()-7*24*60*60*1000;
  const previousKey=weekKey(previousStart);
  const already=db.prepare('SELECT 1 FROM quick_event_weekly_rewards WHERE week_key=? LIMIT 1').get(previousKey);
  if(already)return;
  const rows=db.prepare(`
    SELECT winner_id user_id,COUNT(*) wins
    FROM quick_event_rounds
    WHERE status='solved' AND winner_id IS NOT NULL AND solved_at>=? AND solved_at<?
    GROUP BY winner_id ORDER BY wins DESC,MIN(solved_at) ASC LIMIT 10
  `).all(previousStart,new Date(`${currentWeek}T00:00:00Z`).getTime());
  if(!rows.length)return;
  const rewards=[];
  rows.forEach((row,index)=>{
    const position=index+1;
    let type='base',amount=1;
    if(position===1){type='elite';amount=1;}
    else if(position===2){type='premium';amount=2;}
    else if(position===3){type='premium';amount=1;}
    addPack(row.user_id,type,amount);
    db.prepare(`INSERT INTO quick_event_weekly_rewards(week_key,user_id,position,reward_type,reward_amount,awarded_at) VALUES(?,?,?,?,?,?)`)
      .run(previousKey,row.user_id,position,type,amount,Date.now());
    rewards.push({position,userId:row.user_id,wins:row.wins,type,amount});
  });
  const channel=await client.channels.fetch(CHANNEL_ID).catch(()=>null);
  if(channel?.isTextBased()){
    const names={base:'Base Pack',premium:'Premium Pack',elite:'Elite Pack'};
    await channel.send({content:['# 🏆 Недельный рейтинг Quick Event','',...rewards.map(r=>`${r.position}. <@${r.userId}> — **${r.wins}** побед • ${names[r.type]} ×${r.amount}`)].join('\n'),allowedMentions:{users:rewards.map(r=>r.userId)}});
  }
}
function roundKey(){return `quick-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;}
async function activateRound(channel,message,id,event,phase='active'){
  const card=await createQuickEventCard(event,phase);await message.edit({content:'## ⚡ GS Quick Event\nПервый правильный ответ получает награду.',files:[new AttachmentBuilder(card,{name:'gs-quick-event.png'})],attachments:[]});
  db.prepare("UPDATE quick_event_rounds SET status='active',activated_at=? WHERE id=? AND status='pending'").run(Date.now(),id);
}

function memoryButton(roundId){
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`quickevent_memory_${roundId}`).setLabel('Показать последовательность').setEmoji('🧠').setStyle(ButtonStyle.Primary)
  );
}
async function handleQuickEventComponent(interaction){
  if(!interaction.isButton()||!interaction.customId.startsWith('quickevent_memory_'))return false;
  initTables();
  const roundId=Number(interaction.customId.slice('quickevent_memory_'.length));
  const round=db.prepare("SELECT * FROM quick_event_rounds WHERE id=? AND type='memory' AND status='active'").get(roundId);
  if(!round){await interaction.reply({content:'❌ Этот Quick Event уже завершён.',ephemeral:true});return true;}
  const seen=db.prepare('SELECT 1 FROM quick_event_memory_views WHERE round_id=? AND user_id=?').get(round.id,interaction.user.id);
  if(seen){await interaction.reply({content:'❌ Ты уже смотрел последовательность. Отправь ответ в чат.',ephemeral:true});return true;}
  db.prepare('INSERT INTO quick_event_memory_views(round_id,user_id,viewed_at) VALUES(?,?,?)').run(round.id,interaction.user.id,Date.now());
  markParticipation(round.id,interaction.user.id);
  const event=JSON.parse(round.payload_json||'{}');
  const card=await createQuickEventCard(event,'show');
  const seconds=round.difficulty==='hard'?16:round.difficulty==='medium'?13:10;
  await interaction.reply({content:`🧠 Запоминай. Последовательность исчезнет через **${seconds} сек.**`,files:[new AttachmentBuilder(card,{name:'gs-memory-sequence.png'})],ephemeral:true});
  setTimeout(()=>interaction.editReply({content:'⌛ Время закончилось. Теперь отправь последовательность в чат.',attachments:[]}).catch(()=>{}),seconds*1000);
  return true;
}

async function postQuickEvent(client){
  initTables();db.prepare("UPDATE quick_event_rounds SET status='expired' WHERE status IN ('active','pending')").run();
  const channel=await client.channels.fetch(CHANNEL_ID).catch(()=>null);if(!channel?.isTextBased())return console.error('[QuickEvent] Канал не найден:',CHANNEL_ID);
  const type=weightedType(),diff=difficulty(),tier=pickEventTier(),event=await buildEvent(client,type,diff);event.type=type;event.difficulty=diff;event.tier=tier;
  const now=Date.now();const info=db.prepare(`INSERT INTO quick_event_rounds(round_key,channel_id,type,difficulty,prompt,answers_json,payload_json,created_at) VALUES(?,?,?,?,?,?,?,?)`).run(roundKey(),CHANNEL_ID,type,diff,event.prompt||event.display||'',JSON.stringify(event.answers||[]),JSON.stringify({...event,media:undefined}),now);
  let phase='active';if(type==='reaction')phase='ready';
  const card=await createQuickEventCard(event,phase);
  const components=type==='memory'?[memoryButton(info.lastInsertRowid)]:[];
  const content=type==='memory'?'## ⚡ GS Quick Event\nНажми кнопку, запомни последовательность и отправь её в чат.':'## ⚡ GS Quick Event\nСобытие начинается!';
  const message=await channel.send({content,files:[new AttachmentBuilder(card,{name:'gs-quick-event.png'})],components});
  db.prepare('UPDATE quick_event_rounds SET message_id=? WHERE id=?').run(message.id,info.lastInsertRowid);
  if(type==='reaction')setTimeout(()=>activateRound(channel,message,info.lastInsertRowid,event,'go').catch(console.error),randomInt(3000,8000));
  else db.prepare("UPDATE quick_event_rounds SET status='active',activated_at=? WHERE id=?").run(Date.now(),info.lastInsertRowid);
}
async function handleQuickEventAnswer(message){
  if(!message.guild||message.author.bot||message.channel.id!==CHANNEL_ID)return false;initTables();
  const round=db.prepare("SELECT * FROM quick_event_rounds WHERE channel_id=? AND status='active' ORDER BY id DESC LIMIT 1").get(CHANNEL_ID);if(!round)return false;
  if(Date.now()-(round.activated_at||round.created_at)>ACTIVE_TTL_MS)return false;
  
  const answer=normalize(message.content);if(!answer)return false;markParticipation(round.id,message.author.id);const attempts=db.prepare('SELECT COUNT(*) count FROM quick_event_attempts WHERE round_id=? AND user_id=?').get(round.id,message.author.id)?.count??0;if(attempts>=MAX_ATTEMPTS)return true;
  const inserted=db.prepare('INSERT OR IGNORE INTO quick_event_attempts(round_id,user_id,normalized_answer,created_at) VALUES(?,?,?,?)').run(round.id,message.author.id,answer,Date.now());if(!inserted.changes)return true;
  const accepted=JSON.parse(round.answers_json).map(normalize);if(!accepted.includes(answer))return true;
  const won=db.prepare("UPDATE quick_event_rounds SET status='solved',winner_id=?,solved_at=? WHERE id=? AND status='active'").run(message.author.id,Date.now(),round.id);if(!won.changes)return true;
  const payload=JSON.parse(round.payload_json||'{}');const tier=payload.tier||'normal';const reward=grantReward(message.author,pickReward(round.difficulty,tier),round.id);db.prepare('UPDATE quick_event_rounds SET reward_type=?,reward_amount=?,reward_details=? WHERE id=?').run(reward.type,reward.amount,reward.details,round.id);
  const quickStats=recordQuickEventWin(message.author.id,round.type,round.id);
  db.prepare(`UPDATE quick_event_player_stats SET weekly_wins=COALESCE(weekly_wins,0)+1,golden_wins=COALESCE(golden_wins,0)+? WHERE user_id=?`).run(tier==='golden'?1:0,message.author.id);
  const milestoneRewards=milestoneReward(message.author.id,quickStats.totalWins,quickStats.currentStreak);
  let achievementResult=null;
  try{
    const player=getOrCreatePlayer(message.author);
    achievementResult=await checkAchievements({message,player,member:message.member});
  }catch(error){
    console.error('[QuickEvent Achievements]',error);
  }
  const winnerName=getServerDisplayName(message.member, message.author);const card=await createQuickEventWinnerCard({type:round.type,winnerName,reward,tier});
  const tierTitle=tier==='golden'?'🌟 GOLDEN QUICK EVENT':'⚡ QUICK EVENT';
  const packLine=reward.packReward?`
🎁 Дополнительно: **${reward.packReward.label}** добавлен в инвентарь.`:'';
  const milestoneLine=milestoneRewards.length?`
🔥 Получена награда за серию/рубеж: **${milestoneRewards.join(', ')}**`:'';
  await message.reply({content:`## ${tierTitle} — победа!
${message.author} первым дал правильный ответ и получает **${reward.label}**.${packLine}${milestoneLine}
Побед всего: **${quickStats.totalWins}** • Текущая серия: **${quickStats.currentStreak}** • Лучшая серия: **${quickStats.bestStreak}**
📦 Паки: /packs inventory`,files:[new AttachmentBuilder(card,{name:'gs-quick-event-winner.png'})],allowedMentions:{repliedUser:false}});return true;
}


async function forceQuickEventWin(interaction,targetUser,targetMember){
  initTables();
  const round=db.prepare("SELECT * FROM quick_event_rounds WHERE channel_id=? AND status='active' ORDER BY id DESC LIMIT 1").get(interaction.channelId);
  if(!round)return {ok:false,message:'❌ Сейчас нет активного Quick Event в этом канале.'};
  const won=db.prepare("UPDATE quick_event_rounds SET status='solved',winner_id=?,solved_at=? WHERE id=? AND status='active'").run(targetUser.id,Date.now(),round.id);
  if(!won.changes)return {ok:false,message:'❌ Quick Event уже завершён.'};
  markParticipation(round.id,targetUser.id);
  const payload=JSON.parse(round.payload_json||'{}'),tier=payload.tier||'normal';
  const reward=grantReward(targetUser,pickReward(round.difficulty,tier),round.id);
  db.prepare('UPDATE quick_event_rounds SET reward_type=?,reward_amount=?,reward_details=? WHERE id=?').run(reward.type,reward.amount,reward.details,round.id);
  const stats=recordQuickEventWin(targetUser.id,round.type,round.id);
  db.prepare('UPDATE quick_event_player_stats SET weekly_wins=COALESCE(weekly_wins,0)+1,golden_wins=COALESCE(golden_wins,0)+? WHERE user_id=?').run(tier==='golden'?1:0,targetUser.id);
  const milestones=milestoneReward(targetUser.id,stats.totalWins,stats.currentStreak);
  const name=getServerDisplayName(targetMember, targetUser);
  const card=await createQuickEventWinnerCard({type:round.type,winnerName:name,reward,tier});
  const pack=reward.packReward?`\n🎁 Дополнительно: **${reward.packReward.label}** добавлен в инвентарь.`:'';
  const mile=milestones.length?`\n🔥 Награда за серию/рубеж: **${milestones.join(', ')}**`:'';
  await interaction.channel.send({content:`## ${tier==='golden'?'🌟 GOLDEN QUICK EVENT':'⚡ QUICK EVENT'} — победа!\n${targetUser} получает **${reward.label}**.${pack}${mile}\nПобед всего: **${stats.totalWins}** • Серия: **${stats.currentStreak}**`,files:[new AttachmentBuilder(card,{name:'gs-quick-event-winner.png'})],allowedMentions:{users:[targetUser.id]}});
  if(round.message_id){const m=await interaction.channel.messages.fetch(round.message_id).catch(()=>null);if(m)await m.edit({components:[]}).catch(()=>{});}
  return {ok:true,reward};
}


let quickEventTimer = null;
let quickEventNextAt = null;
let quickEventClient = null;
let quickEventPosting = false;

function saveNextEventAt(timestamp) {
  initTables();
  const value = timestamp ? Number(timestamp) : null;
  db.prepare(`
    INSERT INTO quick_event_scheduler_state(id,next_event_at,updated_at)
    VALUES(1,?,?)
    ON CONFLICT(id) DO UPDATE SET
      next_event_at=excluded.next_event_at,
      updated_at=excluded.updated_at
  `).run(value, Date.now());
}

function getQuickEventScheduleStatus() {
  initTables();

  const stored = db.prepare(`
    SELECT next_event_at
    FROM quick_event_scheduler_state
    WHERE id = 1
  `).get();

  const storedNextAt = Number(stored?.next_event_at || 0) || null;
  const nextEventAt = quickEventNextAt || storedNextAt;

  const activeRound = db.prepare(`
    SELECT id,type,difficulty,created_at,activated_at
    FROM quick_event_rounds
    WHERE status IN ('active','pending')
    ORDER BY id DESC
    LIMIT 1
  `).get();

  return {
    schedulerStarted: Boolean(quickEventClient),
    nextEventAt,
    remainingMs: nextEventAt
      ? Math.max(0, nextEventAt - Date.now())
      : null,
    active: Boolean(activeRound),
    activeRound: activeRound || null,
  };
}

function scheduleNextQuickEvent(delay = randomDelay()) {
  if (!quickEventClient) return null;

  if (quickEventTimer) {
    clearTimeout(quickEventTimer);
  }

  const safeDelay = Math.max(1000, Number(delay) || randomDelay());
  quickEventNextAt = Date.now() + safeDelay;
  saveNextEventAt(quickEventNextAt);

  quickEventTimer = setTimeout(async () => {
    if (quickEventPosting) {
      return scheduleNextQuickEvent();
    }

    quickEventPosting = true;
    quickEventNextAt = null;
    saveNextEventAt(null);

    try {
      await awardPreviousWeek(quickEventClient);

      const channel = await quickEventClient.channels
        .fetch(CHANNEL_ID)
        .catch(() => null);

      const online = channel?.guild
        ? getVisibleOnlineCount(channel.guild)
        : null;

      if (online !== null && online < MIN_ONLINE_MEMBERS) {
        return scheduleNextQuickEvent(lowOnlineRetryDelay());
      }

      await postQuickEvent(quickEventClient);
    } catch (error) {
      console.error('[QuickEvent]', error);
    } finally {
      quickEventPosting = false;
    }

    scheduleNextQuickEvent();
  }, safeDelay);

  quickEventTimer.unref?.();
  return quickEventNextAt;
}

async function forceCloseQuickEvent(client) {
  initTables();

  quickEventClient = client || quickEventClient;

  const round = db.prepare(`
    SELECT *
    FROM quick_event_rounds
    WHERE status IN ('active', 'pending')
    ORDER BY id DESC
    LIMIT 1
  `).get();

  let closed = false;

  if (round) {
    const result = db.prepare(`
      UPDATE quick_event_rounds
      SET status = 'expired'
      WHERE id = ? AND status IN ('active', 'pending')
    `).run(round.id);

    closed = result.changes > 0;

    if (closed && round.channel_id && round.message_id && quickEventClient) {
      const channel = await quickEventClient.channels
        .fetch(round.channel_id)
        .catch(() => null);

      if (channel?.isTextBased?.()) {
        const message = await channel.messages
          .fetch(round.message_id)
          .catch(() => null);

        if (message) {
          await message.edit({ components: [] }).catch(() => {});
        }
      }
    }
  }

  const delayMs = randomDelay();
  const scheduledAt = scheduleNextQuickEvent(delayMs);

  return {
    closed,
    roundId: round?.id ?? null,
    delayMs,
    scheduledAt,
  };
}

function startQuickEventScheduler(client) {
  initTables();

  quickEventClient = client;

  const last = db.prepare(`
    SELECT created_at
    FROM quick_event_rounds
    ORDER BY id DESC
    LIMIT 1
  `).get();

  const age = last
    ? Date.now() - Number(last.created_at)
    : null;

  if (!last || age >= MAX_INTERVAL_MS) {
    quickEventNextAt = Date.now() + 2500;
    saveNextEventAt(quickEventNextAt);

    quickEventTimer = setTimeout(async () => {
      if (quickEventPosting) return;

      quickEventPosting = true;
      quickEventNextAt = null;
      saveNextEventAt(null);

      try {
        await awardPreviousWeek(client);
        await postQuickEvent(client);
      } catch (error) {
        console.error('[QuickEvent]', error);
      } finally {
        quickEventPosting = false;
        scheduleNextQuickEvent();
      }
    }, 2500);

    quickEventTimer.unref?.();
  } else {
    const min = Math.max(0, MIN_INTERVAL_MS - age);
    const max = Math.max(min, MAX_INTERVAL_MS - age);
    const delay = min + Math.floor(Math.random() * (max - min + 1));

    scheduleNextQuickEvent(delay);
  }

  const weeklyTimer = setInterval(
    () => awardPreviousWeek(client)
      .catch(error => console.error('[QuickEvent Weekly]', error)),
    60 * 60 * 1000
  );

  weeklyTimer.unref?.();

  console.log(
    '[QuickEvent] Запущено: 45–75 минут, ' +
    '10% шанс 20–30 минут, Golden раз в сутки'
  );
}

module.exports = {
  startQuickEventScheduler,
  handleQuickEventAnswer,
  handleQuickEventComponent,
  forceQuickEventWin,
  forceCloseQuickEvent,
  getQuickEventScheduleStatus,
  postQuickEvent,
};
