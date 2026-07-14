const { AttachmentBuilder } = require('discord.js');
const { db, getOrCreatePlayer, updatePlayer, addCardDust } = require('../database/db');
const { addXP } = require('../utils/levelSystem');
const { openRandomCard, PACK_TYPES } = require('../utils/cardSystem');
const { createRiddleCard, createRiddleWinnerCard } = require('../images/riddle/createRiddleCard');

const RIDDLE_CHANNEL_ID = '1493225844519207064';
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;
const MIN_INTERVAL_MS = 2 * 60 * 60 * 1000;
const MAX_INTERVAL_MS = 3 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;

const RIDDLES = [
  { difficulty:'easy', question:'Без рук, без ног, а ворота открывает. Что это?', answers:['ветер'] },
  { difficulty:'easy', question:'Зимой и летом одним цветом. Что это?', answers:['елка','ёлка','ель'] },
  { difficulty:'easy', question:'Что можно увидеть с закрытыми глазами?', answers:['сон','сны'] },
  { difficulty:'easy', question:'Чем больше из неё берёшь, тем больше она становится.', answers:['яма','ямка'] },
  { difficulty:'easy', question:'Что принадлежит тебе, но другие используют чаще тебя?', answers:['имя','твое имя','моё имя'] },
  { difficulty:'easy', question:'Какой месяц короче всех?', answers:['май'] },
  { difficulty:'easy', question:'Что становится мокрым, пока сушит?', answers:['полотенце'] },
  { difficulty:'easy', question:'У кого есть шапка без головы и нога без сапога?', answers:['гриб','гриба'] },
  { difficulty:'medium', question:'Я не живой, но расту. У меня нет лёгких, но мне нужен воздух. Вода меня убивает.', answers:['огонь','пламя'] },
  { difficulty:'medium', question:'Что путешествует по миру, оставаясь в одном углу?', answers:['марка','почтовая марка'] },
  { difficulty:'medium', question:'У меня есть города, но нет домов; леса, но нет деревьев; реки, но нет воды.', answers:['карта','географическая карта'] },
  { difficulty:'medium', question:'Что можно сломать, даже не касаясь?', answers:['обещание','слово','тишина'] },
  { difficulty:'medium', question:'У меня много ключей, но я не открываю ни одной двери.', answers:['пианино','фортепиано','клавиатура'] },
  { difficulty:'medium', question:'Что всегда перед тобой, но ты этого не видишь?', answers:['будущее'] },
  { difficulty:'medium', question:'Что имеет шею, но не имеет головы?', answers:['бутылка'] },
  { difficulty:'medium', question:'Я становлюсь больше, когда меня переворачивают вверх ногами. Что я?', answers:['6','цифра 6','шесть'] },
  { difficulty:'hard', question:'Два отца и два сына нашли три яблока. Каждому досталось по одному. Как?', answers:['дед отец сын','дед, отец и сын','три поколения'] },
  { difficulty:'hard', question:'Человек смотрит на портрет и говорит: «У меня нет братьев и сестёр, но отец этого человека — сын моего отца». Кто на портрете?', answers:['его сын','сын'] },
  { difficulty:'hard', question:'Что имеет начало и конец, но не имеет середины?', answers:['кольцо','круг'] },
  { difficulty:'hard', question:'Какое слово всегда звучит неверно?', answers:['неверно','слово неверно'] },
  { difficulty:'hard', question:'Вы входите в тёмную комнату. Там свеча, лампа и камин. У вас одна спичка. Что зажжёте первым?', answers:['спичку','спичка'] },
  { difficulty:'hard', question:'Что можно держать только после того, как отдал?', answers:['слово','обещание'] },
  { difficulty:'hard', question:'У женщины было две дочери, родившиеся в один час одного дня одного года, но они не близнецы. Почему?', answers:['они тройняшки','тройняшки','они из тройни'] },
  { difficulty:'hard', question:'Что идёт вверх и вниз, но остаётся на месте?', answers:['лестница','ступеньки'] },
];

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS riddle_rounds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scheduled_key TEXT NOT NULL UNIQUE,
      channel_id TEXT NOT NULL,
      message_id TEXT,
      difficulty TEXT NOT NULL,
      question TEXT NOT NULL,
      answers_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      winner_id TEXT,
      reward_type TEXT,
      reward_amount INTEGER DEFAULT 0,
      reward_details TEXT,
      created_at INTEGER NOT NULL,
      solved_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS riddle_attempts (
      riddle_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      normalized_answer TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (riddle_id, user_id, normalized_answer)
    );
    CREATE INDEX IF NOT EXISTS idx_riddle_rounds_status ON riddle_rounds(status);
  `);
}

function normalizeAnswer(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^a-zа-я0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function randomNextDelay() {
  return MIN_INTERVAL_MS + Math.floor(Math.random() * (MAX_INTERVAL_MS - MIN_INTERVAL_MS + 1));
}

function createRoundKey() {
  return `random-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function pickRiddle() {
  const roll = Math.random();
  const difficulty = roll < .45 ? 'easy' : roll < .80 ? 'medium' : 'hard';
  const recent = new Set(db.prepare('SELECT question FROM riddle_rounds ORDER BY id DESC LIMIT 10').all().map(r=>r.question));
  let pool = RIDDLES.filter(r=>r.difficulty===difficulty && !recent.has(r.question));
  if (!pool.length) pool = RIDDLES.filter(r=>r.difficulty===difficulty);
  return pool[Math.floor(Math.random()*pool.length)];
}

function pickReward(difficulty) {
  const roll = Math.random() * 100;

  // Загадки появляются 8 раз в сутки, поэтому награды умеренные:
  // основной приз — Dust, паки остаются редким бонусом.
  if (difficulty === 'easy') {
    if (roll < 80) return { type:'dust', amount:30, label:'30 GS Dust' };
    if (roll < 98) return { type:'xp', amount:75, label:'75 XP' };
    return { type:'base_pack', amount:1, label:'Base Pack' };
  }

  if (difficulty === 'medium') {
    if (roll < 75) return { type:'dust', amount:60, label:'60 GS Dust' };
    if (roll < 96) return { type:'xp', amount:150, label:'150 XP' };
    return { type:'base_pack', amount:1, label:'Base Pack' };
  }

  if (roll < 68) return { type:'dust', amount:100, label:'100 GS Dust' };
  if (roll < 92) return { type:'xp', amount:250, label:'250 XP' };
  if (roll < 99) return { type:'base_pack', amount:1, label:'Base Pack' };
  return { type:'premium_pack', amount:1, label:'Premium Pack' };
}

function grantReward(user, reward) {
  getOrCreatePlayer(user);
  if (reward.type === 'dust') {
    const balance = addCardDust(user.id, reward.amount);
    return { ...reward, details:`Баланс: ${balance} Dust` };
  }
  if (reward.type === 'xp') {
    const player = getOrCreatePlayer(user);
    const updated = addXP(player, reward.amount);
    updatePlayer(updated);
    return { ...reward, details:`Уровень: ${updated.level}` };
  }
  const packId = reward.type === 'premium_pack' ? 'premium' : 'base';
  const pack = PACK_TYPES[packId] ?? PACK_TYPES.base;
  const drop = openRandomCard(user.id, { source:`riddle_${packId}_pack`, allowTreasure:true, rarityChances:pack.chances });
  return { ...reward, details:`${drop.rarityName}: ${drop.card.name} #${String(drop.copyNumber).padStart(4,'0')}` };
}

async function postRiddle(client) {
  initTables();
  const key = createRoundKey();
  db.prepare("UPDATE riddle_rounds SET status='expired' WHERE status='active'").run();
  const channel = await client.channels.fetch(RIDDLE_CHANNEL_ID).catch(()=>null);
  if (!channel?.isTextBased()) return console.error('[Riddle] Канал не найден:', RIDDLE_CHANNEL_ID);
  const riddle = pickRiddle();
  const now = Date.now();
  const result = db.prepare(`INSERT INTO riddle_rounds(scheduled_key,channel_id,difficulty,question,answers_json,created_at) VALUES(?,?,?,?,?,?)`)
    .run(key,RIDDLE_CHANNEL_ID,riddle.difficulty,riddle.question,JSON.stringify(riddle.answers),now);
  const card = await createRiddleCard({id:result.lastInsertRowid,...riddle});
  const message = await channel.send({
    content:'## 🧩 Загадка Game Syndicate\nПервый правильный ответ получает награду. У каждого участника — до **3 уникальных попыток**.',
    files:[new AttachmentBuilder(card,{name:'gs-riddle.png'})]
  });
  db.prepare('UPDATE riddle_rounds SET message_id=? WHERE id=?').run(message.id,result.lastInsertRowid);
}

async function handleRiddleAnswer(message) {
  if (!message.guild || message.author.bot || message.channel.id !== RIDDLE_CHANNEL_ID) return false;
  initTables();
  const round = db.prepare("SELECT * FROM riddle_rounds WHERE channel_id=? AND status='active' ORDER BY id DESC LIMIT 1").get(RIDDLE_CHANNEL_ID);
  if (!round) return false;
  if (Date.now()-round.created_at > MAX_INTERVAL_MS) return false;
  const answer = normalizeAnswer(message.content);
  if (!answer) return false;
  const attempts = db.prepare('SELECT COUNT(*) count FROM riddle_attempts WHERE riddle_id=? AND user_id=?').get(round.id,message.author.id)?.count ?? 0;
  if (attempts >= MAX_ATTEMPTS) return false;
  const inserted = db.prepare('INSERT OR IGNORE INTO riddle_attempts(riddle_id,user_id,normalized_answer,created_at) VALUES(?,?,?,?)').run(round.id,message.author.id,answer,Date.now());
  if (!inserted.changes) return true;
  const accepted = JSON.parse(round.answers_json).map(normalizeAnswer);
  if (!accepted.includes(answer)) return true;
  const won = db.prepare("UPDATE riddle_rounds SET status='solved',winner_id=?,solved_at=? WHERE id=? AND status='active'").run(message.author.id,Date.now(),round.id);
  if (!won.changes) return true;
  const reward = grantReward(message.author,pickReward(round.difficulty));
  db.prepare('UPDATE riddle_rounds SET reward_type=?,reward_amount=?,reward_details=? WHERE id=?').run(reward.type,reward.amount,reward.details,round.id);
  const winnerCard = await createRiddleWinnerCard({question:round.question,difficulty:round.difficulty,winnerName:message.member?.displayName ?? message.author.globalName ?? message.author.username,reward});
  await message.reply({
    content:`## 🎉 Правильный ответ!\n${message.author} первым разгадал загадку и получает **${reward.label}**.`,
    files:[new AttachmentBuilder(winnerCard,{name:'gs-riddle-winner.png'})],
    allowedMentions:{repliedUser:false}
  });
  return true;
}

function startRiddleScheduler(client) {
  initTables();
  let timer = null;
  let posting = false;

  const scheduleNext = (delay = randomNextDelay()) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      if (posting) return scheduleNext();
      posting = true;
      try {
        await postRiddle(client);
      } catch (err) {
        console.error('[Riddle]', err);
      } finally {
        posting = false;
        scheduleNext();
      }
    }, Math.max(1000, delay));
  };

  const lastRound = db.prepare('SELECT created_at FROM riddle_rounds ORDER BY id DESC LIMIT 1').get();
  const age = lastRound ? Date.now() - Number(lastRound.created_at) : null;

  if (!lastRound || age >= MAX_INTERVAL_MS) {
    setTimeout(async () => {
      if (posting) return;
      posting = true;
      try {
        await postRiddle(client);
      } catch (err) {
        console.error('[Riddle]', err);
      } finally {
        posting = false;
        scheduleNext();
      }
    }, 2500);
  } else {
    const minimumRemaining = Math.max(0, MIN_INTERVAL_MS - age);
    const maximumRemaining = Math.max(minimumRemaining, MAX_INTERVAL_MS - age);
    const delay = minimumRemaining + Math.floor(Math.random() * (maximumRemaining - minimumRemaining + 1));
    scheduleNext(delay);
  }

  console.log('[Riddle] Планировщик запущен: первая загадка сразу, затем случайно через 2-3 часа');
}

module.exports={startRiddleScheduler,handleRiddleAnswer,postRiddle};
