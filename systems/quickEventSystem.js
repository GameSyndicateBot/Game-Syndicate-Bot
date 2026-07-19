const fs = require('fs');
const path = require('path');
const { AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { db, getOrCreatePlayer, addCardDust } = require('../database/db');
const { addPack } = require('../utils/packInventory');
const { createQuickEventCard, createQuickEventWinnerCard } = require('../images/quickEvent/createQuickEventCard');
const { getServerDisplayName } = require('../utils/displayName');
const { checkAchievements } = require('../utils/checkAchievements');

const CHANNEL_ID = '1526504061870932049';
const MIN_INTERVAL_MS = 40 * 60 * 1000;
const MAX_INTERVAL_MS = 70 * 60 * 1000;
const BONUS_INTERVAL_MS = 20 * 60 * 1000;
const BONUS_INTERVAL_CHANCE = 0.20;
const MAX_ATTEMPTS = 3;
const ACTIVE_TTL_MS = 45 * 60 * 1000;

const WORDS = [
  'коллекция','синдикат','карточка','легендарный','достижение','аукцион','профиль','награда',
  'сокровище','голографик','мифический','активность','сообщество','испытание','победитель',
  'инвентарь','редкость','премиальный','эксклюзивный','ежедневка','приключение','турнир',
  'команда','событие','магазин','лотерея','обмен','участник','прогресс','рейтинг',
  'испытатель','коллекционер','охотник','соперник','чемпион','тактика','стратегия','реакция',
  'скорость','внимание','головоломка','загадка','шифрование','последовательность','комбинация',
  'путешествие','вселенная','портал','кристалл','артефакт','талисман','амулет','реликвия',
  'драгоценность','наследие','хранитель','защитник','исследователь','искатель','первопроходец',
  'союзник','противник','командир','капитан','мастерство','выносливость','решительность',
  'вдохновение','воображение','координация','наблюдательность','сообразительность','интуиция',
  'любопытство','настойчивость','концентрация','точность','молниеносный','непредсказуемый',
  'таинственный','загадочный','эпический','необычный','уникальный','бесценный','секретный',
  'волшебный','космический','цифровой','виртуальный','игровой','командный','случайный',
  'победоносный','невероятный','удивительный','фантастический','триумфальный','неуловимый'
];

const PHRASES = [
  'Game Syndicate объединяет игроков',
  'Сегодня удача на моей стороне',
  'Коллекция растёт с каждым днём',
  'Первый правильный ответ побеждает',
  'Редкая карта уже совсем близко',
  'Вместе играть всегда интереснее',
  'Скорость и внимание решают всё',
  'Каждая карточка хранит свою историю',
  'Настоящая команда не бросает своих',
  'Новый пак может изменить коллекцию',
  'Победа начинается с хорошей стратегии',
  'Самые редкие награды достаются смелым',
  'Быстрая реакция приносит заслуженную награду',
  'Сегодня отличный день для нового рекорда',
  'Сильная команда справится с любым боссом',
  'В коллекции всегда найдётся место легенде',
  'Удача любит внимательных и решительных',
  'Каждый участник делает сообщество сильнее',
  'Главное не скорость а точность',
  'Иногда один ответ решает всё',
  'За каждым событием скрывается новая возможность',
  'Настойчивость обязательно приводит к победе',
  'Лучший момент открыть пак наступает сейчас',
  'Секрет успеха заключается в командной игре',
  'Даже маленькая награда приближает к цели',
  'Коллекционер никогда не проходит мимо редкости',
  'Аукцион начинается когда ставки становятся серьёзными',
  'Настоящий чемпион умеет ждать подходящий момент',
  'Игровой вечер становится ярче вместе с друзьями',
  'Сокровище найдёт самый внимательный участник',
  'Легендарная карточка может выпасть неожиданно',
  'Новая победа пополнит личную статистику',
  'Каждое испытание проверяет разные навыки',
  'Хорошая память помогает побеждать быстрее',
  'Сложная загадка делает награду приятнее',
  'Случайность иногда выбирает самого терпеливого',
  'Важная деталь может быть спрятана на виду',
  'Коллекция отражает путь своего владельца',
  'Редкий пак стоит долгого ожидания',
  'Лучшие события ещё только впереди'
];

const ODD_SETS = [
  {items:['Common','Rare','Epic','Discord','Legendary'],answer:'Discord'},
  {items:['Dust','Pack','Auction','Banana','Trade'],answer:'Banana'},
  {items:['Mythic','Exclusive','Holographic','Treasure','Telegram'],answer:'Telegram'},
  {items:['Профиль','Коллекция','Магазин','Аукцион','Холодильник'],answer:'Холодильник'},
  {items:['XP','Dust','Карточка','Уровень','Карандаш'],answer:'Карандаш'},
  {items:['Меч','Щит','Лук','Броня','Кастрюля'],answer:'Кастрюля'},
  {items:['Красный','Синий','Зелёный','Жёлтый','Квадрат'],answer:'Квадрат'},
  {items:['Январь','Март','Июнь','Октябрь','Пятница'],answer:'Пятница'},
  {items:['Лев','Тигр','Пантера','Рысь','Дельфин'],answer:'Дельфин'},
  {items:['Steam','Discord','Telegram','Epic Games','Микроволновка'],answer:'Микроволновка'},
  {items:['Понедельник','Среда','Суббота','Воскресенье','Август'],answer:'Август'},
  {items:['Круг','Квадрат','Треугольник','Ромб','Фиолетовый'],answer:'Фиолетовый'},
  {items:['Золото','Серебро','Бронза','Платина','Дерево'],answer:'Дерево'},
  {items:['Огонь','Вода','Воздух','Земля','Клавиатура'],answer:'Клавиатура'},
  {items:['Мифический','Легендарный','Эпический','Редкий','Обыденный'],answer:'Обыденный'},
  {items:['Пак','Карта','Коллекция','Альбом','Зонтик'],answer:'Зонтик'},
  {items:['Победа','Награда','Рекорд','Достижение','Огурец'],answer:'Огурец'},
  {items:['Самурай','Рыцарь','Викинг','Ниндзя','Пылесос'],answer:'Пылесос'},
  {items:['Утро','День','Вечер','Ночь','Весна'],answer:'Весна'},
  {items:['Киев','Лондон','Париж','Берлин','Юпитер'],answer:'Юпитер'},
  {items:['Кошка','Собака','Хомяк','Попугай','Дуб'],answer:'Дуб'},
  {items:['Монитор','Мышь','Клавиатура','Наушники','Подушка'],answer:'Подушка'},
  {items:['Реакция','Память','Внимание','Логика','Картофель'],answer:'Картофель'},
  {items:['База','Премиум','Элита','Сокровище','Табуретка'],answer:'Табуретка'},
  {items:['Аукцион','Обмен','Магазин','Инвентарь','Балкон'],answer:'Балкон'}
];

const FINISH = [
  {display:'Коллекц____',answers:['ия','коллекция']},
  {display:'Легенд____',answers:['арный','легендарный']},
  {display:'Аукц____',answers:['ион','аукцион']},
  {display:'Достиж____',answers:['ение','достижение']},
  {display:'Синдик____',answers:['ат','синдикат']},
  {display:'Голограф____',answers:['ик','голографик']},
  {display:'Инвент____',answers:['арь','инвентарь']},
  {display:'Эксклюз____',answers:['ивный','эксклюзивный']},
  {display:'Преми____',answers:['альный','премиальный']},
  {display:'Мифич____',answers:['еский','мифический']},
  {display:'Сокров____',answers:['ище','сокровище']},
  {display:'Испыт____',answers:['ание','испытание']},
  {display:'Сообщ____',answers:['ество','сообщество']},
  {display:'Побед____',answers:['итель','победитель']},
  {display:'Нагр____',answers:['ада','награда']},
  {display:'Карточ____',answers:['ка','карточка']},
  {display:'Редк____',answers:['ость','редкость']},
  {display:'Событ____',answers:['ие','событие']},
  {display:'Участ____',answers:['ник','участник']},
  {display:'Команд____',answers:['а','команда']},
  {display:'Турн____',answers:['ир','турнир']},
  {display:'Лотер____',answers:['ея','лотерея']},
  {display:'Проф____',answers:['иль','профиль']},
  {display:'Магаз____',answers:['ин','магазин']},
  {display:'Страт____',answers:['егия','стратегия']},
  {display:'Реакц____',answers:['ия','реакция']},
  {display:'Вним____',answers:['ание','внимание']},
  {display:'Загад____',answers:['ка','загадка']},
  {display:'Артеф____',answers:['акт','артефакт']},
  {display:'Хранит____',answers:['ель','хранитель']}
];

const COLORS = [
  {name:'красный',hex:'#ff4f62'},{name:'синий',hex:'#4fa8ff'},{name:'зелёный',hex:'#59d97d'},
  {name:'жёлтый',hex:'#ffd75e'},{name:'фиолетовый',hex:'#b879ff'},{name:'оранжевый',hex:'#ff9b52'},
  {name:'розовый',hex:'#ff77b7'},{name:'бирюзовый',hex:'#42d9cf'},{name:'голубой',hex:'#66c7ff'},
  {name:'лаймовый',hex:'#a8ef5a'},{name:'малиновый',hex:'#dc3f79'},{name:'бордовый',hex:'#8f2741'},
  {name:'коралловый',hex:'#ff7f6e'},{name:'оливковый',hex:'#8fa84f'},{name:'золотой',hex:'#e7b94e'},
  {name:'серебряный',hex:'#b8c0cc'},{name:'пурпурный',hex:'#a849d9'},{name:'индиго',hex:'#5865c7'},
  {name:'мятный',hex:'#72e6b1'},{name:'персиковый',hex:'#ffb58f'}
];

const EMOJI_RIDDLES = [
  {prompt:'🌙 + 🚶 — назови слово',answers:['лунатик']},
  {prompt:'🔥 + 🦊 — назови словосочетание',answers:['огненная лиса','огненный лис']},
  {prompt:'⭐ + 🛡️ — назови словосочетание',answers:['звездный щит','звёздный щит']},
  {prompt:'🧊 + 👑 — назови словосочетание',answers:['ледяная корона']},
  {prompt:'🌌 + 🚀 — назови словосочетание',answers:['космическая ракета']},
  {prompt:'🐉 + 🥚 — назови словосочетание',answers:['яйцо дракона','драконье яйцо']},
  {prompt:'💎 + 🗡️ — назови словосочетание',answers:['алмазный меч']},
  {prompt:'👻 + 🏠 — назови словосочетание',answers:['дом с привидениями','дом призраков']},
  {prompt:'🌊 + 🐎 — назови слово',answers:['морской конек','морской конёк']},
  {prompt:'☀️ + 🌻 — назови слово',answers:['подсолнух']}
];

const SEQUENCE_EVENTS = [
  {prompt:'2, 4, 6, 8, ?',answers:['10']},
  {prompt:'3, 6, 9, 12, ?',answers:['15']},
  {prompt:'1, 2, 4, 8, ?',answers:['16']},
  {prompt:'5, 10, 20, 40, ?',answers:['80']},
  {prompt:'1, 4, 9, 16, ?',answers:['25']},
  {prompt:'2, 3, 5, 8, 13, ?',answers:['21']},
  {prompt:'100, 90, 80, 70, ?',answers:['60']},
  {prompt:'7, 14, 21, 28, ?',answers:['35']},
  {prompt:'81, 27, 9, 3, ?',answers:['1']},
  {prompt:'1, 1, 2, 3, 5, 8, ?',answers:['13']},
  {prompt:'4, 8, 12, 16, ?',answers:['20']},
  {prompt:'50, 45, 40, 35, ?',answers:['30']}
];

const REVERSE_WORDS = [
  'коллекция','карточка','синдикат','легендарный','мифический','сокровище','аукцион',
  'инвентарь','награда','испытание','победитель','сообщество','активность','редкость',
  'голографик','стратегия','реакция','достижение','премиальный','эксклюзивный'
];

const TRUE_FALSE = [
  {prompt:'Верно или неверно: у квадрата четыре стороны?',answers:['верно','да']},
  {prompt:'Верно или неверно: неделя состоит из восьми дней?',answers:['неверно','нет']},
  {prompt:'Верно или неверно: лёд легче жидкой воды?',answers:['верно','да']},
  {prompt:'Верно или неверно: число 17 является чётным?',answers:['неверно','нет']},
  {prompt:'Верно или неверно: Земля вращается вокруг Солнца?',answers:['верно','да']},
  {prompt:'Верно или неверно: у треугольника четыре угла?',answers:['неверно','нет']},
  {prompt:'Верно или неверно: 5 × 5 равно 25?',answers:['верно','да']},
  {prompt:'Верно или неверно: октябрь идёт раньше сентября?',answers:['неверно','нет']},
  {prompt:'Верно или неверно: Discord является мессенджером?',answers:['верно','да']},
  {prompt:'Верно или неверно: мифическая редкость ниже обычной?',answers:['неверно','нет']}
];

const TYPE_WEIGHTS = [
  ['unscramble',14],['math',13],['typing',9],['finish',10],
  ['odd',9],['color',8],['memory',8],['reaction',5],
  ['rarity',4],['avatar',3],['sequence',8],['reverse',7],
  ['emoji_riddle',6],['true_false',6],
  ['loot_share',5],['risk',5],['dont_press',3],['royal_button',3],['dice_tournament',4],
  ['treasure_chest',6],['lucky_roll',4],['world_boss',2],
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
    CREATE TABLE IF NOT EXISTS quick_event_boss_attacks (
      round_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      damage INTEGER NOT NULL DEFAULT 0,
      attacks INTEGER NOT NULL DEFAULT 0,
      last_attack_at INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(round_id,user_id)
    );
    CREATE TABLE IF NOT EXISTS quick_event_actions (
      round_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      value INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      PRIMARY KEY(round_id,user_id,action)
    );
    CREATE INDEX IF NOT EXISTS idx_quick_event_actions_round
      ON quick_event_actions(round_id,action);
    CREATE INDEX IF NOT EXISTS idx_quick_event_boss_round
      ON quick_event_boss_attacks(round_id);
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
  const recent = new Set(
    db.prepare('SELECT type FROM quick_event_rounds ORDER BY id DESC LIMIT 7')
      .all()
      .map(row => row.type)
  );
  let filtered = TYPE_WEIGHTS.filter(([type]) => !recent.has(type));
  if (!filtered.length) filtered = TYPE_WEIGHTS;
  const total = filtered.reduce((sum,[,weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [type,weight] of filtered) {
    roll -= weight;
    if (roll <= 0) return type;
  }
  return filtered[0][0];
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
  if(type==='sequence'){const item=pick(SEQUENCE_EVENTS);return {prompt:item.prompt,answers:item.answers};}
  if(type==='reverse'){const word=pick(REVERSE_WORDS);return {prompt:[...word].reverse().join(''),answers:[word]};}
  if(type==='emoji_riddle'){const item=pick(EMOJI_RIDDLES);return {prompt:item.prompt,answers:item.answers};}
  if(type==='true_false'){const item=pick(TRUE_FALSE);return {prompt:item.prompt,answers:item.answers};}
  if(type==='loot_share')return {prompt:'Общий запас GS Dust делится между участниками.',answers:[],bank:randomInt(300,600)};
  if(type==='risk')return {prompt:'Выбери гарантированную награду или испытай удачу.',answers:[]};
  if(type==='dont_press')return {prompt:'Сначала зарегистрируйся, а затем не нажимай опасную кнопку.',answers:[],phase:'registration'};
  if(type==='royal_button')return {prompt:'За 2 минуты удерживай трон дольше остальных.',answers:[],holderId:null,holderSince:null,holdTotals:{},lastCaptureAt:{}};
  if(type==='dice_tournament')return {prompt:'Один бросок D12 на игрока. Через 5 минут победит лучший результат.',answers:[],endsAt:Date.now()+5*60*1000};
  if(type==='reaction')return {prompt:'Напиши «жми» после сигнала',answers:['жми']};
  if(type==='rarity')return rarityMedia();
  if(type==='avatar')return await avatarEvent(client) || {prompt:'Напиши Game Syndicate без ошибок',answers:['game syndicate']};
  if(type==='treasure_chest')return {
    prompt:'Таинственный сундук появился! Первый, кто нажмёт кнопку, заберёт награду.',
    answers:[],
  };
  if(type==='lucky_roll')return {
    prompt:'Система выбирает случайного активного участника.',
    answers:[],
  };
  if(type==='world_boss'){
    const maxHp = diff === 'hard' ? 1800 : diff === 'medium' ? 1400 : 1000;
    return {
      prompt:'Мировой босс вторгся на сервер. Атакуйте вместе!',
      answers:[],
      bossName:pick(['Тёмный Страж','Пожиратель Пустоты','Архонт Хаоса','Кибер-Титан']),
      maxHp,
      hp:maxHp,
    };
  }
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

function pickSpecialReward(kind = 'chest') {
  const roll = Math.random() * 100;

  if (kind === 'boss_mvp') {
    if (roll < 10) return { type:'pack', packType:'elite', amount:1, label:'Elite Pack' };
    if (roll < 55) return { type:'pack', packType:'premium', amount:1, label:'Premium Pack' };
    return { type:'pack', packType:'base', amount:1, label:'Base Pack' };
  }

  if (kind === 'lucky') {
    if (roll < 55) return { type:'dust', amount:randomInt(120,300), label:null };
    if (roll < 92) return { type:'pack', packType:'base', amount:1, label:'Base Pack' };
    return { type:'pack', packType:'premium', amount:1, label:'Premium Pack' };
  }

  if (roll < 50) return { type:'dust', amount:randomInt(80,250), label:null };
  if (roll < 87) return { type:'pack', packType:'base', amount:1, label:'Base Pack' };
  if (roll < 98) return { type:'pack', packType:'premium', amount:1, label:'Premium Pack' };
  return { type:'pack', packType:'elite', amount:1, label:'Elite Pack' };
}

function grantSpecialReward(user, reward, roundId) {
  getOrCreatePlayer(user);

  if (reward.type === 'dust') {
    const balance = addCardDust(user.id, reward.amount);
    return {
      ...reward,
      label: `${reward.amount} GS Dust`,
      details: `Баланс: ${balance} Dust`,
    };
  }

  addPack(user.id, reward.packType, reward.amount || 1);
  db.prepare(`
    INSERT INTO quick_event_pack_drops(
      round_id,user_id,pack_type,amount,created_at
    ) VALUES(?,?,?,?,?)
  `).run(
    roundId,
    String(user.id),
    reward.packType,
    reward.amount || 1,
    Date.now()
  );

  return {
    ...reward,
    label: reward.label || `${reward.packType} Pack`,
    details: 'Пак добавлен в инвентарь',
  };
}

function specialEventButton(roundId, type) {
  const config = {
    treasure_chest: {
      customId:`quickevent_chest_${roundId}`,
      label:'Открыть сундук',
      emoji:'🎁',
      style:ButtonStyle.Success,
    },
    world_boss: {
      customId:`quickevent_boss_${roundId}`,
      label:'Атаковать босса',
      emoji:'⚔️',
      style:ButtonStyle.Danger,
    },
  }[type];

  if (!config) return null;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(config.customId)
      .setLabel(config.label)
      .setEmoji(config.emoji)
      .setStyle(config.style)
  );
}


const quickEventRuntimeTimers = new Map();

function clearRuntimeTimers(roundId) {
  const timers = quickEventRuntimeTimers.get(Number(roundId)) || [];
  for (const timer of timers) clearTimeout(timer);
  quickEventRuntimeTimers.delete(Number(roundId));
}

function addRuntimeTimer(roundId, timer) {
  const key = Number(roundId);
  const timers = quickEventRuntimeTimers.get(key) || [];
  timers.push(timer);
  quickEventRuntimeTimers.set(key, timers);
  timer.unref?.();
  return timer;
}

function quickButton(customId,label,emoji,style=ButtonStyle.Primary,disabled=false){
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setEmoji(emoji).setStyle(style).setDisabled(disabled);
}

function multiEventComponents(roundId,type,phase='active'){
  if(type==='loot_share') return [new ActionRowBuilder().addComponents(quickButton(`quickevent_loot_${roundId}`,'Забрать долю','💰',ButtonStyle.Success))];
  if(type==='risk') return [new ActionRowBuilder().addComponents(
    quickButton(`quickevent_risk_safe_${roundId}`,'Забрать 35 Dust','🟢',ButtonStyle.Success),
    quickButton(`quickevent_risk_gamble_${roundId}`,'Рискнуть','🎰',ButtonStyle.Danger)
  )];
  if(type==='dont_press'&&phase==='registration') return [new ActionRowBuilder().addComponents(quickButton(`quickevent_dont_register_${roundId}`,'Я участвую','✋',ButtonStyle.Success))];
  if(type==='dont_press'&&phase==='temptation') return [new ActionRowBuilder().addComponents(quickButton(`quickevent_dont_bomb_${roundId}`,'НЕ НАЖИМАТЬ','💣',ButtonStyle.Danger))];
  if(type==='royal_button') return [new ActionRowBuilder().addComponents(quickButton(`quickevent_royal_${roundId}`,'Захватить трон','👑',ButtonStyle.Primary))];
  if(type==='dice_tournament') return [new ActionRowBuilder().addComponents(quickButton(`quickevent_dice_${roundId}`,'Бросить D12','🎲',ButtonStyle.Primary))];
  return [];
}

async function closeMultiEventMessage(channel, round, content){
  if(!round?.message_id)return;
  const message=await channel.messages.fetch(round.message_id).catch(()=>null);
  if(message)await message.edit({content,components:[]}).catch(()=>{});
}

async function expireMultiEvent(channel,roundId,text){
  const round=db.prepare("SELECT * FROM quick_event_rounds WHERE id=? AND status='active'").get(roundId);
  if(!round)return;
  db.prepare("UPDATE quick_event_rounds SET status='expired',solved_at=? WHERE id=? AND status='active'").run(Date.now(),roundId);
  clearRuntimeTimers(roundId);
  await closeMultiEventMessage(channel,round,text);
}

async function handleLootShare(interaction,roundId){
  const round=db.prepare("SELECT * FROM quick_event_rounds WHERE id=? AND type='loot_share' AND status='active'").get(roundId);
  if(!round){await interaction.reply({content:'❌ Добыча уже закончилась.',ephemeral:true});return true;}
  const used=db.prepare("SELECT 1 FROM quick_event_actions WHERE round_id=? AND user_id=? AND action='loot'").get(roundId,interaction.user.id);
  if(used){await interaction.reply({content:'❌ Ты уже получил свою долю.',ephemeral:true});return true;}
  const payload=JSON.parse(round.payload_json||'{}');
  const bank=Math.max(0,Number(payload.bank||0));
  if(bank<=0){await interaction.reply({content:'❌ Добыча уже закончилась.',ephemeral:true});return true;}
  const amount=Math.min(bank,randomInt(15,60));
  payload.bank=bank-amount;
  db.transaction(()=>{
    db.prepare("INSERT INTO quick_event_actions(round_id,user_id,action,value,created_at) VALUES(?,?,?,?,?)").run(roundId,interaction.user.id,'loot',amount,Date.now());
    db.prepare("UPDATE quick_event_rounds SET payload_json=? WHERE id=? AND status='active'").run(JSON.stringify(payload),roundId);
    addCardDust(interaction.user.id,amount);
    markParticipation(roundId,interaction.user.id);
  })();
  await interaction.reply({content:`💰 Ты забрал **${amount} GS Dust**. В запасе осталось **${payload.bank}**.`,ephemeral:true});
  if(payload.bank<=0){
    db.prepare("UPDATE quick_event_rounds SET status='solved',solved_at=?,reward_type='shared_dust',reward_amount=? WHERE id=? AND status='active'").run(Date.now(),Number(JSON.parse(round.payload_json||'{}').bank||0),roundId);
    clearRuntimeTimers(roundId);
    await interaction.message.edit({content:'## 💰 ДЕЛЁЖ ДОБЫЧИ — запас разобран!\nВесь GS Dust успешно поделён между участниками.',components:[]}).catch(()=>{});
  }else{
    await interaction.message.edit({content:`## 💰 ДЕЛЁЖ ДОБЫЧИ\nВ общем запасе осталось **${payload.bank} GS Dust**.\nОдин участник может забрать долю только один раз.`,components:multiEventComponents(roundId,'loot_share')}).catch(()=>{});
  }
  return true;
}

async function handleRisk(interaction,roundId,mode){
  const round=db.prepare("SELECT * FROM quick_event_rounds WHERE id=? AND type='risk' AND status='active'").get(roundId);
  if(!round){await interaction.reply({content:'❌ Событие уже завершено.',ephemeral:true});return true;}
  const used=db.prepare("SELECT 1 FROM quick_event_actions WHERE round_id=? AND user_id=? AND action='risk'").get(roundId,interaction.user.id);
  if(used){await interaction.reply({content:'❌ Ты уже сделал выбор.',ephemeral:true});return true;}
  let reward;
  if(mode==='safe') reward={type:'dust',amount:35,label:'35 GS Dust'};
  else {
    const roll=Math.random()*100;
    if(roll<50) reward={type:'dust',amount:80,label:'80 GS Dust'};
    else if(roll<80) reward={type:'dust',amount:120,label:'120 GS Dust'};
    else if(roll<95) reward={type:'pack',packType:'base',amount:1,label:'Base Pack'};
    else reward={type:'none',amount:0,label:'ничего'};
  }
  db.prepare("INSERT INTO quick_event_actions(round_id,user_id,action,value,created_at) VALUES(?,?,?,?,?)").run(roundId,interaction.user.id,'risk',reward.amount||0,Date.now());
  markParticipation(roundId,interaction.user.id);
  if(reward.type!=='none') grantSpecialReward(interaction.user,reward,roundId);
  await interaction.reply({content:reward.type==='none'?'🎰 Риск не оправдался — на этот раз без награды.':`🎉 Ты получаешь **${reward.label}**!`,ephemeral:true});
  return true;
}

async function startDontPressTemptation(channel,roundId){
  const round=db.prepare("SELECT * FROM quick_event_rounds WHERE id=? AND type='dont_press' AND status='active'").get(roundId);
  if(!round)return;
  const registered=db.prepare("SELECT COUNT(*) count FROM quick_event_actions WHERE round_id=? AND action='dont_register'").get(roundId)?.count||0;
  if(!registered){return expireMultiEvent(channel,roundId,'## 💣 НЕ НАЖИМАЙ!\nНикто не зарегистрировался — событие завершено.');}
  const payload=JSON.parse(round.payload_json||'{}');payload.phase='temptation';
  db.prepare("UPDATE quick_event_rounds SET payload_json=? WHERE id=?").run(JSON.stringify(payload),roundId);
  const message=await channel.messages.fetch(round.message_id).catch(()=>null);
  if(message)await message.edit({content:`## 💣 НЕ НАЖИМАЙ!\nЗарегистрировано: **${registered}**.\nТеперь **20 секунд не нажимайте кнопку**. Нажавший выбывает.`,components:multiEventComponents(roundId,'dont_press','temptation')}).catch(()=>{});
  addRuntimeTimer(roundId,setTimeout(()=>resolveDontPress(channel,roundId).catch(console.error),20*1000));
}

async function resolveDontPress(channel,roundId){
  const round=db.prepare("SELECT * FROM quick_event_rounds WHERE id=? AND type='dont_press' AND status='active'").get(roundId);
  if(!round)return;
  const eligible=db.prepare(`SELECT r.user_id FROM quick_event_actions r LEFT JOIN quick_event_actions p ON p.round_id=r.round_id AND p.user_id=r.user_id AND p.action='dont_pressed' WHERE r.round_id=? AND r.action='dont_register' AND p.user_id IS NULL`).all(roundId);
  if(!eligible.length)return expireMultiEvent(channel,roundId,'## 💣 НЕ НАЖИМАЙ!\nВсе участники сорвались и нажали кнопку. Победителя нет.');
  const winner=pick(eligible); const member=await channel.guild.members.fetch(winner.user_id).catch(()=>null);
  if(!member)return expireMultiEvent(channel,roundId,'## 💣 НЕ НАЖИМАЙ!\nНе удалось определить победителя.');
  const reward=grantSpecialReward(member.user,pickSpecialReward('lucky'),roundId);
  db.prepare("UPDATE quick_event_rounds SET status='solved',winner_id=?,solved_at=?,reward_type=?,reward_amount=?,reward_details=? WHERE id=? AND status='active'").run(member.id,Date.now(),reward.type,reward.amount||1,reward.details,roundId);
  recordQuickEventWin(member.id,'dont_press',roundId); clearRuntimeTimers(roundId);
  await closeMultiEventMessage(channel,round,`## 💣 НЕ НАЖИМАЙ! — завершено\n${member} выдержал испытание и получает **${reward.label}**.`);
}

async function handleDontPress(interaction,roundId,action){
  const round=db.prepare("SELECT * FROM quick_event_rounds WHERE id=? AND type='dont_press' AND status='active'").get(roundId);
  if(!round){await interaction.reply({content:'❌ Событие уже завершено.',ephemeral:true});return true;}
  const payload=JSON.parse(round.payload_json||'{}');
  if(action==='register'){
    if(payload.phase!=='registration'){await interaction.reply({content:'❌ Регистрация уже закрыта.',ephemeral:true});return true;}
    const result=db.prepare("INSERT OR IGNORE INTO quick_event_actions(round_id,user_id,action,value,created_at) VALUES(?,?,?,?,?)").run(roundId,interaction.user.id,'dont_register',1,Date.now());
    if(!result.changes){await interaction.reply({content:'✅ Ты уже зарегистрирован.',ephemeral:true});return true;}
    markParticipation(roundId,interaction.user.id);await interaction.reply({content:'✋ Ты участвуешь. Когда появится бомба — не нажимай её.',ephemeral:true});return true;
  }
  const registered=db.prepare("SELECT 1 FROM quick_event_actions WHERE round_id=? AND user_id=? AND action='dont_register'").get(roundId,interaction.user.id);
  if(!registered){await interaction.reply({content:'Ты не был зарегистрирован и не участвуешь.',ephemeral:true});return true;}
  const result=db.prepare("INSERT OR IGNORE INTO quick_event_actions(round_id,user_id,action,value,created_at) VALUES(?,?,?,?,?)").run(roundId,interaction.user.id,'dont_pressed',1,Date.now());
  await interaction.reply({content:result.changes?'💥 Ты нажал кнопку и выбыл!':'❌ Ты уже выбыл.',ephemeral:true});return true;
}

async function resolveRoyalButton(channel,roundId){
  const round=db.prepare("SELECT * FROM quick_event_rounds WHERE id=? AND type='royal_button' AND status='active'").get(roundId);if(!round)return;
  const now=Date.now();
  const payload=JSON.parse(round.payload_json||'{}');
  payload.holdTotals=payload.holdTotals||{};
  if(payload.holderId&&payload.holderSince){
    payload.holdTotals[payload.holderId]=(payload.holdTotals[payload.holderId]||0)+Math.max(0,now-payload.holderSince);
  }
  const standings=Object.entries(payload.holdTotals).sort((a,b)=>b[1]-a[1]);
  if(!standings.length)return expireMultiEvent(channel,roundId,'## 👑 КОРОЛЕВСКАЯ КНОПКА\nНикто не захватил трон.');
  const [winnerId,winnerMs]=standings[0];
  const member=await channel.guild.members.fetch(winnerId).catch(()=>null);if(!member)return expireMultiEvent(channel,roundId,'## 👑 КОРОЛЕВСКАЯ КНОПКА\nПобедитель больше не доступен на сервере.');
  const reward=grantSpecialReward(member.user,pickSpecialReward('lucky'),roundId);
  db.prepare("UPDATE quick_event_rounds SET status='solved',winner_id=?,solved_at=?,reward_type=?,reward_amount=?,reward_details=?,payload_json=? WHERE id=? AND status='active'").run(member.id,now,reward.type,reward.amount||1,reward.details,JSON.stringify(payload),roundId);
  recordQuickEventWin(member.id,'royal_button',roundId);clearRuntimeTimers(roundId);
  const top=standings.slice(0,5).map(([id,ms],i)=>`${i+1}. <@${id}> — **${(ms/1000).toFixed(1)} сек.**`).join('\n');
  await closeMultiEventMessage(channel,round,`## 👑 КОРОЛЕВСКАЯ КНОПКА — завершена\nПобедитель: ${member}\nВремя владения: **${(winnerMs/1000).toFixed(1)} сек.**\nНаграда: **${reward.label}**\n\n### Топ владения\n${top}`);
}

async function handleRoyalButton(interaction,roundId){
  const round=db.prepare("SELECT * FROM quick_event_rounds WHERE id=? AND type='royal_button' AND status='active'").get(roundId);if(!round){await interaction.reply({content:'❌ Ивент уже завершён.',ephemeral:true});return true;}
  const now=Date.now();
  const payload=JSON.parse(round.payload_json||'{}');
  payload.holdTotals=payload.holdTotals||{};
  payload.lastCaptureAt=payload.lastCaptureAt||{};

  if(String(payload.holderId||'')===String(interaction.user.id)){
    await interaction.reply({content:'👑 Трон уже у тебя. Повторный клик ничего не даёт.',ephemeral:true});return true;
  }
  const lastClick=Number(payload.lastCaptureAt[interaction.user.id]||0);
  if(now-lastClick<1000){
    await interaction.reply({content:'⏱️ Перехватывать трон можно не чаще одного раза в секунду.',ephemeral:true});return true;
  }

  if(payload.holderId&&payload.holderSince){
    payload.holdTotals[payload.holderId]=(payload.holdTotals[payload.holderId]||0)+Math.max(0,now-payload.holderSince);
  }
  payload.holderId=interaction.user.id;
  payload.holderSince=now;
  payload.lastCaptureAt[interaction.user.id]=now;
  db.prepare("UPDATE quick_event_rounds SET payload_json=? WHERE id=? AND status='active'").run(JSON.stringify(payload),roundId);
  markParticipation(roundId,interaction.user.id);

  const elapsed=Math.max(0,now-Number(round.activated_at||now));
  const remaining=Math.max(0,120000-elapsed);
  await interaction.update({
    content:`## 👑 КОРОЛЕВСКАЯ КНОПКА\nТекущий владелец трона: ${interaction.user}\nДо конца: **${Math.ceil(remaining/1000)} сек.**\n\nПобедит тот, кто суммарно удерживал трон дольше всех. Повторные клики владельца и клики чаще 1 раза/сек. игнорируются.`,
    components:multiEventComponents(roundId,'royal_button'),
    allowedMentions:{parse:[]},
  });return true;
}

function diceLeaderboard(roundId){
  return db.prepare("SELECT user_id,value FROM quick_event_actions WHERE round_id=? AND action='dice' ORDER BY value DESC,created_at ASC LIMIT 10").all(roundId);
}

async function resolveDiceTournament(channel,roundId){
  const round=db.prepare("SELECT * FROM quick_event_rounds WHERE id=? AND type='dice_tournament' AND status='active'").get(roundId);if(!round)return;
  const rolls=diceLeaderboard(roundId);if(!rolls.length)return expireMultiEvent(channel,roundId,'## 🎲 ТУРНИР D12\nНикто не сделал бросок.');
  const max=rolls[0].value;const leaders=db.prepare("SELECT user_id FROM quick_event_actions WHERE round_id=? AND action='dice' AND value=?").all(roundId,max);const winner=pick(leaders);
  const member=await channel.guild.members.fetch(winner.user_id).catch(()=>null);if(!member)return;
  const reward=grantSpecialReward(member.user,pickSpecialReward('lucky'),roundId);
  db.prepare("UPDATE quick_event_rounds SET status='solved',winner_id=?,solved_at=?,reward_type=?,reward_amount=?,reward_details=? WHERE id=? AND status='active'").run(member.id,Date.now(),reward.type,reward.amount||1,reward.details,roundId);
  recordQuickEventWin(member.id,'dice_tournament',roundId);clearRuntimeTimers(roundId);
  await closeMultiEventMessage(channel,round,`## 🎲 ТУРНИР D12 — завершён\nПобедитель: ${member} с результатом **${max}**.\nНаграда: **${reward.label}**.`);
}

async function handleDiceTournament(interaction,roundId){
  const round=db.prepare("SELECT * FROM quick_event_rounds WHERE id=? AND type='dice_tournament' AND status='active'").get(roundId);if(!round){await interaction.reply({content:'❌ Турнир уже завершён.',ephemeral:true});return true;}
  const value=randomInt(1,12);const result=db.prepare("INSERT OR IGNORE INTO quick_event_actions(round_id,user_id,action,value,created_at) VALUES(?,?,?,?,?)").run(roundId,interaction.user.id,'dice',value,Date.now());
  if(!result.changes){await interaction.reply({content:'❌ У тебя уже был один бросок.',ephemeral:true});return true;}
  markParticipation(roundId,interaction.user.id);await interaction.reply({content:`🎲 Твой результат: **${value}**`,ephemeral:true});
  const board=diceLeaderboard(roundId);const lines=board.map((r,i)=>`${i+1}. <@${r.user_id}> — 🎲 **${r.value}**`);
  await interaction.message.edit({content:['## 🎲 ТУРНИР D12','Один бросок на игрока. Турнир длится **5 минут**.','','### Текущий топ',...lines].join('\n'),components:multiEventComponents(roundId,'dice_tournament'),allowedMentions:{parse:[]}}).catch(()=>{});return true;
}

async function getLuckyRollCandidates(channel) {
  const guild = channel.guild;
  const members = await guild.members.fetch().catch(() => guild.members.cache);
  const activeSince = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentIds = new Set(
    db.prepare(`
      SELECT DISTINCT user_id
      FROM quick_event_participation
      WHERE created_at >= ?
    `).all(activeSince).map(row => String(row.user_id))
  );

  let pool = [...members.values()].filter(member =>
    !member.user.bot &&
    recentIds.has(String(member.id))
  );

  if (!pool.length) {
    pool = [...members.values()].filter(member =>
      !member.user.bot &&
      member.presence?.status &&
      member.presence.status !== 'offline'
    );
  }

  if (!pool.length) {
    pool = [...members.values()].filter(member => !member.user.bot);
  }

  return pool;
}

async function resolveLuckyRoll(channel, roundId, event) {
  const candidates = await getLuckyRollCandidates(channel);
  if (!candidates.length) {
    db.prepare(`
      UPDATE quick_event_rounds SET status='expired'
      WHERE id=? AND status IN ('pending','active')
    `).run(roundId);
    await channel.send('🎲 Lucky Roll отменён: не найдено подходящих участников.');
    return;
  }

  const winner = pick(candidates);
  const claimed = db.prepare(`
    UPDATE quick_event_rounds
    SET status='solved',winner_id=?,solved_at=?
    WHERE id=? AND status IN ('pending','active')
  `).run(winner.id, Date.now(), roundId);

  if (!claimed.changes) return;

  markParticipation(roundId, winner.id);
  const reward = grantSpecialReward(
    winner.user,
    pickSpecialReward('lucky'),
    roundId
  );

  db.prepare(`
    UPDATE quick_event_rounds
    SET reward_type=?,reward_amount=?,reward_details=?
    WHERE id=?
  `).run(reward.type, reward.amount || 1, reward.details, roundId);

  const stats = recordQuickEventWin(winner.id, 'lucky_roll', roundId);
  const winnerName = getServerDisplayName(winner, winner.user);
  const winnerCard = await createQuickEventWinnerCard({
    type:'lucky_roll',
    winnerName,
    reward,
    tier:event.tier || 'normal',
  });

  await channel.send({
    content:[
      '## 🎲 GS Lucky Roll',
      `${winner} выбран счастливчиком!`,
      `Награда: **${reward.label}**`,
      `Побед Quick Event: **${stats.totalWins}**`,
    ].join('\n'),
    files:[new AttachmentBuilder(winnerCard,{name:'gs-lucky-roll-winner.png'})],
    allowedMentions:{users:[winner.id]},
  });
}

async function handleTreasureChest(interaction, roundId) {
  const round = db.prepare(`
    SELECT * FROM quick_event_rounds
    WHERE id=? AND type='treasure_chest' AND status='active'
  `).get(roundId);

  if (!round) {
    await interaction.reply({
      content:'❌ Этот сундук уже открыт или событие завершено.',
      ephemeral:true,
    });
    return true;
  }

  const claimed = db.prepare(`
    UPDATE quick_event_rounds
    SET status='solved',winner_id=?,solved_at=?
    WHERE id=? AND status='active'
  `).run(interaction.user.id, Date.now(), roundId);

  if (!claimed.changes) {
    await interaction.reply({
      content:'❌ Кто-то успел открыть сундук раньше.',
      ephemeral:true,
    });
    return true;
  }

  markParticipation(roundId, interaction.user.id);
  const reward = grantSpecialReward(
    interaction.user,
    pickSpecialReward('chest'),
    roundId
  );

  db.prepare(`
    UPDATE quick_event_rounds
    SET reward_type=?,reward_amount=?,reward_details=?
    WHERE id=?
  `).run(reward.type, reward.amount || 1, reward.details, roundId);

  const stats = recordQuickEventWin(
    interaction.user.id,
    'treasure_chest',
    roundId
  );

  await interaction.update({components:[]});

  const member = interaction.member;
  const winnerName = getServerDisplayName(member, interaction.user);
  const winnerCard = await createQuickEventWinnerCard({
    type:'treasure_chest',
    winnerName,
    reward,
    tier:'normal',
  });

  await interaction.channel.send({
    content:[
      '## 🎁 Сундук открыт!',
      `${interaction.user} первым открыл сундук.`,
      `Награда: **${reward.label}**`,
      `Побед Quick Event: **${stats.totalWins}**`,
    ].join('\n'),
    files:[new AttachmentBuilder(winnerCard,{name:'gs-treasure-winner.png'})],
    allowedMentions:{users:[interaction.user.id]},
  });

  return true;
}

async function handleWorldBoss(interaction, roundId) {
  const round = db.prepare(`
    SELECT * FROM quick_event_rounds
    WHERE id=? AND type='world_boss' AND status='active'
  `).get(roundId);

  if (!round) {
    await interaction.reply({
      content:'❌ Босс уже побеждён или событие завершено.',
      ephemeral:true,
    });
    return true;
  }

  const now = Date.now();
  const previous = db.prepare(`
    SELECT * FROM quick_event_boss_attacks
    WHERE round_id=? AND user_id=?
  `).get(roundId, interaction.user.id);

  const cooldownMs = 60 * 1000;
  if (previous && now - Number(previous.last_attack_at || 0) < cooldownMs) {
    const wait = Math.ceil(
      (cooldownMs - (now - Number(previous.last_attack_at || 0))) / 1000
    );
    await interaction.reply({
      content:`⏳ Следующая атака будет доступна через **${wait} сек.**`,
      ephemeral:true,
    });
    return true;
  }

  const payload = JSON.parse(round.payload_json || '{}');
  const damage = Math.random() < 0.10
    ? randomInt(55,80)
    : randomInt(15,40);
  const currentHp = Math.max(0, Number(payload.hp || payload.maxHp || 1000));
  const newHp = Math.max(0, currentHp - damage);

  payload.hp = newHp;

  db.prepare(`
    INSERT INTO quick_event_boss_attacks(
      round_id,user_id,damage,attacks,last_attack_at
    ) VALUES(?,?,?,1,?)
    ON CONFLICT(round_id,user_id) DO UPDATE SET
      damage=quick_event_boss_attacks.damage+excluded.damage,
      attacks=quick_event_boss_attacks.attacks+1,
      last_attack_at=excluded.last_attack_at
  `).run(roundId, interaction.user.id, damage, now);

  markParticipation(roundId, interaction.user.id);

  db.prepare(`
    UPDATE quick_event_rounds
    SET payload_json=?
    WHERE id=? AND status='active'
  `).run(JSON.stringify(payload), roundId);

  if (newHp > 0) {
    await interaction.reply({
      content:`⚔️ Ты нанёс **${damage} урона**. У босса осталось **${newHp}/${payload.maxHp} HP**.`,
      ephemeral:true,
    });

    await interaction.message.edit({
      content:[
        '## 👾 GS WORLD BOSS',
        `**${payload.bossName || 'Мировой босс'}**`,
        `❤️ HP: **${newHp}/${payload.maxHp}**`,
        'Атаковать можно раз в минуту.',
      ].join('\n'),
      components:[specialEventButton(roundId,'world_boss')],
    }).catch(() => {});

    return true;
  }

  const finished = db.prepare(`
    UPDATE quick_event_rounds
    SET status='solved',solved_at=?
    WHERE id=? AND status='active'
  `).run(now, roundId);

  if (!finished.changes) {
    await interaction.reply({
      content:'❌ Босс уже побеждён.',
      ephemeral:true,
    });
    return true;
  }

  await interaction.update({components:[]});

  const attackers = db.prepare(`
    SELECT user_id,damage,attacks
    FROM quick_event_boss_attacks
    WHERE round_id=?
    ORDER BY damage DESC,attacks ASC
  `).all(roundId);

  for (const attacker of attackers) {
    addCardDust(attacker.user_id, 60);
  }

  const mvp = attackers[0];
  let mvpReward = null;

  if (mvp) {
    const mvpMember = await interaction.guild.members
      .fetch(mvp.user_id)
      .catch(() => null);

    if (mvpMember) {
      mvpReward = grantSpecialReward(
        mvpMember.user,
        pickSpecialReward('boss_mvp'),
        roundId
      );
    }
  }

  db.prepare(`
    UPDATE quick_event_rounds
    SET winner_id=?,reward_type=?,reward_amount=?,reward_details=?
    WHERE id=?
  `).run(
    mvp?.user_id || null,
    'boss_rewards',
    attackers.length,
    `60 Dust каждому; MVP: ${mvpReward?.label || 'нет'}`,
    roundId
  );

  const mentions = attackers.map(item => `<@${item.user_id}>`);
  await interaction.channel.send({
    content:[
      '# 👾 Мировой босс повержен!',
      `Участников: **${attackers.length}**`,
      'Каждый участник получил **60 GS Dust**.',
      mvp
        ? `🥇 MVP: <@${mvp.user_id}> — **${mvp.damage} урона**`
        : '',
      mvpReward
        ? `🎁 Награда MVP: **${mvpReward.label}**`
        : '',
    ].filter(Boolean).join('\n'),
    allowedMentions:{users:attackers.map(item => item.user_id)},
  });

  return true;
}

function randomDelay(){
  if(Math.random()<BONUS_INTERVAL_CHANCE)return BONUS_INTERVAL_MS;
  return randomInt(MIN_INTERVAL_MS,MAX_INTERVAL_MS);
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
function eventMessageContent(event, fallback = 'Событие начинается!'){
  if(event?.type === 'emoji_riddle'){
    return `## ⚡ GS Quick Event\nОтгадайте слово или словосочетание:\n\n# ${event.prompt}`;
  }
  return `## ⚡ GS Quick Event\n${fallback}`;
}
async function activateRound(channel,message,id,event,phase='active'){
  const card=await createQuickEventCard(event,phase);await message.edit({content:eventMessageContent(event,'Первый правильный ответ получает награду.'),files:[new AttachmentBuilder(card,{name:'gs-quick-event.png'})],attachments:[]});
  db.prepare("UPDATE quick_event_rounds SET status='active',activated_at=? WHERE id=? AND status='pending'").run(Date.now(),id);
}

function memoryButton(roundId){
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`quickevent_memory_${roundId}`).setLabel('Показать последовательность').setEmoji('🧠').setStyle(ButtonStyle.Primary)
  );
}
async function handleQuickEventComponent(interaction){
  if(!interaction.isButton())return false;
  initTables();

  if(interaction.customId.startsWith('quickevent_chest_')){
    const roundId=Number(interaction.customId.slice('quickevent_chest_'.length));
    return handleTreasureChest(interaction,roundId);
  }

  if(interaction.customId.startsWith('quickevent_boss_')){
    const roundId=Number(interaction.customId.slice('quickevent_boss_'.length));
    return handleWorldBoss(interaction,roundId);
  }
  if(interaction.customId.startsWith('quickevent_loot_')) return handleLootShare(interaction,Number(interaction.customId.slice('quickevent_loot_'.length)));
  if(interaction.customId.startsWith('quickevent_risk_safe_')) return handleRisk(interaction,Number(interaction.customId.slice('quickevent_risk_safe_'.length)),'safe');
  if(interaction.customId.startsWith('quickevent_risk_gamble_')) return handleRisk(interaction,Number(interaction.customId.slice('quickevent_risk_gamble_'.length)),'gamble');
  if(interaction.customId.startsWith('quickevent_dont_register_')) return handleDontPress(interaction,Number(interaction.customId.slice('quickevent_dont_register_'.length)),'register');
  if(interaction.customId.startsWith('quickevent_dont_bomb_')) return handleDontPress(interaction,Number(interaction.customId.slice('quickevent_dont_bomb_'.length)),'bomb');
  if(interaction.customId.startsWith('quickevent_royal_')) return handleRoyalButton(interaction,Number(interaction.customId.slice('quickevent_royal_'.length)));
  if(interaction.customId.startsWith('quickevent_dice_')) return handleDiceTournament(interaction,Number(interaction.customId.slice('quickevent_dice_'.length)));

  if(!interaction.customId.startsWith('quickevent_memory_'))return false;

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
  initTables();
  db.prepare("UPDATE quick_event_rounds SET status='expired' WHERE status IN ('active','pending')").run();

  const channel=await client.channels.fetch(CHANNEL_ID).catch(()=>null);
  if(!channel?.isTextBased())return console.error('[QuickEvent] Канал не найден:',CHANNEL_ID);

  const type=weightedType();
  const diff=difficulty();
  const tier=pickEventTier();
  const event=await buildEvent(client,type,diff);
  event.type=type;
  event.difficulty=diff;
  event.tier=tier;

  const now=Date.now();
  const info=db.prepare(`
    INSERT INTO quick_event_rounds(
      round_key,channel_id,type,difficulty,prompt,
      answers_json,payload_json,created_at
    ) VALUES(?,?,?,?,?,?,?,?)
  `).run(
    roundKey(),
    CHANNEL_ID,
    type,
    diff,
    event.prompt||event.display||'',
    JSON.stringify(event.answers||[]),
    JSON.stringify({...event,media:undefined}),
    now
  );

  const roundId=Number(info.lastInsertRowid);

  if(['loot_share','risk','dont_press','royal_button','dice_tournament'].includes(type)){
    const titles={loot_share:'💰 ДЕЛЁЖ ДОБЫЧИ',risk:'🎰 РИСК',dont_press:'💣 НЕ НАЖИМАЙ!',royal_button:'👑 КОРОЛЕВСКАЯ КНОПКА',dice_tournament:'🎲 ТУРНИР D12'};
    const descriptions={
      loot_share:`В общем запасе **${event.bank} GS Dust**. Один участник может забрать долю только один раз.`,
      risk:'Выбери: гарантированные **35 Dust** или риск ради более крупной награды. Один выбор на игрока.',
      dont_press:'Регистрация длится **20 секунд**. После неё появится кнопка, которую нельзя нажимать.',
      royal_button:'Ивент длится **2 минуты**. Перехватывай трон и удерживай его суммарно дольше остальных. Повторный клик владельца не считается, захват доступен не чаще раза в секунду.',
      dice_tournament:'Один бросок **D12** на игрока. Через **5 минут** лучший результат заберёт приз.',
    };
    const message=await channel.send({content:`## ${titles[type]}
${descriptions[type]}`,components:multiEventComponents(roundId,type,type==='dont_press'?'registration':'active')});
    db.prepare("UPDATE quick_event_rounds SET message_id=?,status='active',activated_at=? WHERE id=?").run(message.id,Date.now(),roundId);
    if(type==='loot_share') addRuntimeTimer(roundId,setTimeout(()=>expireMultiEvent(channel,roundId,'## 💰 ДЕЛЁЖ ДОБЫЧИ — время вышло').catch(console.error),2*60*1000));
    if(type==='risk') addRuntimeTimer(roundId,setTimeout(()=>expireMultiEvent(channel,roundId,'## 🎰 РИСК — время выбора вышло').catch(console.error),90*1000));
    if(type==='dont_press') addRuntimeTimer(roundId,setTimeout(()=>startDontPressTemptation(channel,roundId).catch(console.error),20*1000));
    if(type==='royal_button') addRuntimeTimer(roundId,setTimeout(()=>resolveRoyalButton(channel,roundId).catch(console.error),2*60*1000));
    if(type==='dice_tournament') addRuntimeTimer(roundId,setTimeout(()=>resolveDiceTournament(channel,roundId).catch(console.error),5*60*1000));
    return;
  }

  if(type==='lucky_roll'){
    const card=await createQuickEventCard(event,'active');
    await channel.send({
      content:'## 🎲 GS Lucky Roll\nСистема выбирает случайного активного участника...',
      files:[new AttachmentBuilder(card,{name:'gs-lucky-roll.png'})],
    });
    db.prepare(`
      UPDATE quick_event_rounds
      SET status='active',activated_at=?
      WHERE id=?
    `).run(Date.now(),roundId);
    setTimeout(
      ()=>resolveLuckyRoll(channel,roundId,event).catch(console.error),
      5000
    ).unref?.();
    return;
  }

  if(type==='treasure_chest'){
    const card=await createQuickEventCard(event,'active');
    const message=await channel.send({
      content:'## 🎁 GS TREASURE CHEST\nПервый, кто откроет сундук, получает награду.',
      files:[new AttachmentBuilder(card,{name:'gs-treasure-chest.png'})],
      components:[specialEventButton(roundId,'treasure_chest')],
    });
    db.prepare(`
      UPDATE quick_event_rounds
      SET message_id=?,status='active',activated_at=?
      WHERE id=?
    `).run(message.id,Date.now(),roundId);
    return;
  }

  if(type==='world_boss'){
    const card=await createQuickEventCard(event,'active');
    const message=await channel.send({
      content:[
        '## 👾 GS WORLD BOSS',
        `**${event.bossName}**`,
        `❤️ HP: **${event.hp}/${event.maxHp}**`,
        'Атаковать можно раз в минуту.',
      ].join('\n'),
      files:[new AttachmentBuilder(card,{name:'gs-world-boss.png'})],
      components:[specialEventButton(roundId,'world_boss')],
    });
    db.prepare(`
      UPDATE quick_event_rounds
      SET message_id=?,status='active',activated_at=?
      WHERE id=?
    `).run(message.id,Date.now(),roundId);
    return;
  }

  let phase='active';
  if(type==='reaction')phase='ready';
  const card=await createQuickEventCard(event,phase);
  const components=type==='memory'?[memoryButton(roundId)]:[];
  const content=type==='memory'
    ?'## ⚡ GS Quick Event\nНажми кнопку, запомни последовательность и отправь её в чат.'
    :eventMessageContent(event);
  const message=await channel.send({
    content,
    files:[new AttachmentBuilder(card,{name:'gs-quick-event.png'})],
    components
  });
  db.prepare('UPDATE quick_event_rounds SET message_id=? WHERE id=?').run(message.id,roundId);
  if(type==='reaction'){
    setTimeout(
      ()=>activateRound(channel,message,roundId,event,'go').catch(console.error),
      randomInt(3000,8000)
    );
  }else{
    db.prepare("UPDATE quick_event_rounds SET status='active',activated_at=? WHERE id=?").run(Date.now(),roundId);
  }
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
📦 Паки: /packs`,files:[new AttachmentBuilder(card,{name:'gs-quick-event-winner.png'})],allowedMentions:{repliedUser:false}});return true;
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
    '[QuickEvent] Запущено: 40–70 минут, ' +
    '20% шанс ровно через 20 минут, Golden раз в сутки'
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
