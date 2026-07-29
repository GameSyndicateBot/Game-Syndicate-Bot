const { db, getCardDust, removeCardDust, addCardDust } = require('../database/db');
const { COMPANIONS } = require('../systems/hero/companionData');

const GUILD_CHANNEL_ID = '1530165282512044032';
const VISIT_MS = 30 * 60 * 1000;
const CHECK_MS = 30 * 1000;
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

const RARITY = {
  common: { label:'Обычный', icon:'⚪', weight:42, min:280, max:700, mult:1 },
  rare: { label:'Редкий', icon:'🔵', weight:28, min:700, max:1500, mult:1.6 },
  epic: { label:'Эпический', icon:'🟣', weight:17, min:1500, max:3500, mult:2.4 },
  legendary: { label:'Легендарный', icon:'🟠', weight:8, min:3500, max:8000, mult:3.5 },
  mythic: { label:'Мифический', icon:'🔴', weight:4, min:8000, max:20000, mult:5 },
  exclusive: { label:'Эксклюзивный', icon:'🌈', weight:1, min:18000, max:32000, mult:7 },
};

const ATMOSPHERE = [
  ['🏜️','Сегодня прибыл восточный караван.'],['❄️','Сегодня купец вернулся из Ледяных земель.'],
  ['🌌','Сегодня торговец привёз вещи, найденные в руинах Бездны.'],['⛰️','Караван пересёк Хребет Великанов.'],
  ['🌊','Торговцы прибыли с Южных островов.'],['🌲','Караван вернулся из Изумрудных лесов.'],
  ['🐉','Купец выкупил трофеи после битвы с древним драконом.'],['🏰','Сегодня выставлены находки из Проклятой крепости.'],
  ['🕯️','Караванщик привёз реликвии из забытых катакомб.'],['🌋','Торговцы вернулись из Пылающей пустоши.'],
  ['🌙','Караван добрался из земель вечной ночи.'],['⚓','Купец разгрузил товары с кораблей Туманного моря.'],
  ['🧭','Караван случайно свернул не туда — и оказался у Гильдии.'],['🐪','Один из верблюдов снова попытался съесть карту маршрута.'],
  ['💰','Караванщик клянётся, что сегодня ничего не продаст себе в убыток.'],['🗿','Торговец привёз товары из долины каменных исполинов.'],
  ['🧊','В сундуках каравана ещё не растаял лёд северных пещер.'],['⚔️','Сегодня продаются трофеи с полей давно забытой войны.'],
  ['🔮','Купец уверяет, что часть товаров ему подсказал провидец.'],['🌪️','Караван чудом прошёл сквозь Песчаную бурю.'],
  ['🦅','Торговцы спустились с Орлиного перевала.'],['🍄','Караван вернулся из леса, которого нет ни на одной карте.'],
  ['👑','Среди товаров есть вещи из сокровищницы павшего короля.'],['🕳️','Купец привёз артефакты от охотников за реликвиями.'],
  ['🔥','Сегодня караван прибыл из земель огненных кузниц.'],['🌫️','Торговцы вышли из тумана прямо у ворот Гильдии.'],
  ['🦴','Купец привёз добычу из владений Костяного Императора.'],['⚡','Караван пережил грозу на равнинах Тирана.'],
  ['🪞','Сегодня среди товаров встречаются странные зеркальные реликвии.'],['⏳','Купец уверяет, что часть груза прибыла из другого времени.'],
];

const TYPE_DEFS = [
  { type:'weapon', slot:'weapon', icon:'⚔️', bases:['Клинок','Меч','Топор','Копьё','Молот','Кинжал','Арбалет','Лук','Посох','Коса','Катана','Алебарда'] },
  { type:'armor', slot:'armor', icon:'🛡️', bases:['Кираса','Кольчуга','Латы','Мантия','Панцирь','Доспех','Кафтан','Броня'] },
  { type:'helmet', slot:'helmet', icon:'🪖', bases:['Шлем','Капюшон','Корона','Маска','Венец','Забрало'] },
  { type:'gloves', slot:'gloves', icon:'🧤', bases:['Перчатки','Рукавицы','Наручи','Латные перчатки'] },
  { type:'boots', slot:'boots', icon:'🥾', bases:['Сапоги','Ботинки','Поножи','Сандалии странника'] },
  { type:'ring', slot:'ring', icon:'💍', bases:['Кольцо','Печать','Перстень','Обруч'] },
  { type:'amulet', slot:'amulet', icon:'📿', bases:['Амулет','Талисман','Подвеска','Медальон'] },
  { type:'backpack', slot:'backpack', icon:'🎒', bases:['Рюкзак','Сумка','Ранец','Походный мешок'] },
  { type:'mount', slot:null, icon:'🐎', bases:['Боевой волк','Пустынный верблюд','Северный медведь','Сумеречная пантера','Грозовой ящер','Белый олень','Костяной конь','Пепельный грифон','Молодой виверн','Лунный тигр'] },
  { type:'artifact', slot:null, icon:'🔮', bases:['Сфера','Идол','Компас','Часы','Зеркало','Осколок','Ключ','Реликварий'] },
];
const PREFIXES = ['Забытый','Сумеречный','Багровый','Ледяной','Грозовой','Пустынный','Рунный','Драконий','Теневой','Звёздный','Проклятый','Королевский','Бездонный','Лунный','Солнечный','Костяной','Изумрудный','Хрустальный','Обсидиановый','Небесный','Серебряный','Кровавый','Дикий','Призрачный','Императорский'];
const SUFFIXES = ['Странника','Бездны','Севера','Павшего короля','Древнего ордена','Охотника','Повелителя бурь','Хранителя времени','Забытой крепости','Пепельных земель','Тихой тени','Драконьего сердца'];

function hash(text){let h=2166136261;for(const ch of String(text)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function seeded(seed){let x=hash(seed)||1;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;};}
function choose(arr,rng=Math.random){return arr[Math.floor(rng()*arr.length)];}
function randint(min,max,rng=Math.random){return Math.floor(rng()*(max-min+1))+min;}
function moscowDay(now=Date.now()){return new Date(now+MOSCOW_OFFSET_MS).toISOString().slice(0,10);}
function nextMoscowDay(dayKey=moscowDay()){const [y,m,d]=dayKey.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+1)).toISOString().slice(0,10);}
function iso(ms){return new Date(ms).toISOString();}
function parseMs(v){return v?new Date(v).getTime():0;}

function bonusFor(type,rarity,seed){
  const rng=seeded(seed); const n=RARITY[rarity].mult;
  const stat=(base)=>Math.max(1,Math.round(base*n));
  if(type==='weapon') return { strength:stat(randint(2,4,rng)), world_boss_damage:rarity==='common'?0:stat(1) };
  if(type==='armor') return { hp:stat(randint(8,14,rng)), defense:stat(randint(2,4,rng)) };
  if(type==='helmet') return { defense:stat(2), intelligence:stat(1) };
  if(type==='gloves') return { strength:stat(2), dexterity:stat(2) };
  if(type==='boots') return { dexterity:stat(2), expedition_success:stat(1) };
  if(type==='ring') return { luck:stat(2), rare_find:stat(1) };
  if(type==='amulet') return { hp:stat(5), intelligence:stat(2) };
  if(type==='backpack') return { expedition_success:stat(2), rare_find:stat(1) };
  if(type==='mount') return { expedition_success:stat(2), rare_find:stat(1) };
  return { luck:stat(2), world_boss_resistance:stat(1) };
}

function buildCatalog(){
  const out=[]; let i=0;
  for(const def of TYPE_DEFS){
    for(const base of def.bases){
      for(const prefix of PREFIXES){
        const suffix=SUFFIXES[(i*7+3)%SUFFIXES.length];
        const name=def.type==='mount'?`${prefix} ${base}`:`${prefix} ${base} ${suffix}`;
        const key=`caravan_${def.type}_${String(i++).padStart(4,'0')}`;
        out.push({key,name,type:def.type,slot:def.slot,icon:def.icon,description:`Редкий товар странствующего Караванщика: ${name.toLowerCase()}.`,lore:`Эта вещь прошла множество земель, прежде чем оказаться у ворот Гильдии.`});
      }
    }
  }
  for(const [key,p] of Object.entries(COMPANIONS)) out.push({key:`pet:${key}`,name:p.name,type:'pet',slot:null,icon:p.icon,description:p.description,lore:'Верный спутник, найденный Караванщиком в далёком путешествии.',fixedRarity:p.rarity});
  return Object.freeze(out);
}
const CATALOG=buildCatalog();

function ensureTables(){
  db.exec(`
  CREATE TABLE IF NOT EXISTS caravan_state(id INTEGER PRIMARY KEY CHECK(id=1),day_key TEXT,opens_at TEXT,closes_at TEXT,atmosphere_index INTEGER NOT NULL DEFAULT 0,announced INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS caravan_offers(id INTEGER PRIMARY KEY AUTOINCREMENT,day_key TEXT NOT NULL,user_id TEXT NOT NULL,slot_no INTEGER NOT NULL,item_key TEXT NOT NULL,item_json TEXT NOT NULL,rarity TEXT NOT NULL,base_price INTEGER NOT NULL,current_price INTEGER NOT NULL,is_daily_deal INTEGER NOT NULL DEFAULT 0,discount_percent INTEGER NOT NULL DEFAULT 0,bargained INTEGER NOT NULL DEFAULT 0,purchased INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(day_key,user_id,slot_no));
  CREATE TABLE IF NOT EXISTS caravan_reservations(user_id TEXT PRIMARY KEY,item_key TEXT NOT NULL,item_json TEXT NOT NULL,rarity TEXT NOT NULL,base_price INTEGER NOT NULL,reserved_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE TABLE IF NOT EXISTS caravan_history(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT NOT NULL,item_key TEXT NOT NULL,day_key TEXT NOT NULL,action TEXT NOT NULL DEFAULT 'shown',created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  CREATE INDEX IF NOT EXISTS idx_caravan_history_user_day ON caravan_history(user_id,day_key,item_key);
  CREATE INDEX IF NOT EXISTS idx_caravan_offers_user_day ON caravan_offers(user_id,day_key);
  `);
}
ensureTables();

function repairCaravanMountCompanions(){
  const { grantCustomCompanion, registerCompanionDefinition }=require('../systems/hero/companionService');
  const rows=db.prepare(`
    SELECT hi.user_id, hi.item_key, h.name, h.rarity, h.description, h.bonuses_json
    FROM hero_inventory hi
    JOIN hero_items h ON h.item_key=hi.item_key
    WHERE hi.quantity>0 AND h.item_type='mount' AND hi.item_key LIKE 'caravan_mount_%'
  `).all();
  for(const row of rows){
    const data={name:row.name,icon:'🐎',rarity:row.rarity||'common',kind:'mount',description:row.description||'Караванный спутник.',bonuses:JSON.parse(row.bonuses_json||'{}')};
    registerCompanionDefinition(row.item_key,data);
    grantCustomCompanion(String(row.user_id),row.item_key,data,'caravan-repair');
  }

  const manual=[
    {userId:'290777169431625728',key:'caravan_mount_1361',name:'Королевский Виверн',rarity:'legendary'},
    {userId:'506371696878551041',key:'caravan_mount_1289',name:'Солнечный Белый Олень',rarity:'common'},
    {userId:'468683569359880192',key:'caravan_mount_1230',name:'Пустынная Сумеречная Пантера',rarity:'common'},
    {userId:'752908251896479915',key:'caravan_mount_1315',name:'Костяной Конь',rarity:'rare'},
  ];
  const seed=db.prepare(`INSERT INTO hero_items(item_key,name,item_type,rarity,description,slot,bonuses_json,lore,is_consumable)
    VALUES(?,?, 'mount', ?, ?, NULL, ?, ?, 0)
    ON CONFLICT(item_key) DO UPDATE SET name=excluded.name,item_type='mount',rarity=excluded.rarity,description=excluded.description,bonuses_json=excluded.bonuses_json,lore=excluded.lore`);
  const inv=db.prepare(`INSERT INTO hero_inventory(user_id,item_key,quantity,acquired_from) VALUES(?,?,1,'caravan-repair')
    ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=MAX(quantity,1)`);
  const coll=db.prepare(`INSERT OR IGNORE INTO hero_item_collection(user_id,item_key,first_acquired_from) VALUES(?,?,'caravan-repair')`);
  const rename=db.prepare('UPDATE hero_companions SET name=?,rarity=? WHERE user_id=? AND companion_key=?');
  db.transaction(()=>{
    for(const row of manual){
      const rarity=row.rarity;
      const bonuses=bonusFor('mount',rarity,`repair:${row.userId}:${row.key}`);
      const data={name:row.name,icon:'🐎',rarity,kind:'mount',description:'Редкий ездовой спутник, полученный у Караванщика.',bonuses};
      seed.run(row.key,row.name,rarity,data.description,JSON.stringify(bonuses),'Возвращён владельцу после исправления учёта питомцев Караванщика.');
      inv.run(row.userId,row.key);
      coll.run(row.userId,row.key);
      registerCompanionDefinition(row.key,data);
      grantCustomCompanion(row.userId,row.key,data,'caravan-repair');
      rename.run(row.name,rarity,row.userId,row.key);
    }
  })();
}
repairCaravanMountCompanions();

function applyV1913TargetedGearRecovery(){
  db.exec(`CREATE TABLE IF NOT EXISTS gs_one_time_migrations (migration_key TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  const migrationKey='v19.1.3-targeted-gear-recovery';
  if(db.prepare('SELECT 1 FROM gs_one_time_migrations WHERE migration_key=?').get(migrationKey)) return;
  const rewards=[
    {userId:'302797251271458817',key:'recovery_imperial_plate_gloves_north',name:'Императорские Латные перчатки Севера',type:'equipment',rarity:'epic',slot:'gloves',bonuses:{defense:8,strength:5}},
    {userId:'561961056197672991',key:'recovery_bone_sandals_fallen_king',name:'Костяные Сандалии странника Павшего короля',type:'equipment',rarity:'epic',slot:'boots',bonuses:{defense:5,dexterity:7}},
    {userId:'561961056197672991',key:'recovery_abyssal_blade_fallen_king',name:'Бездонный Клинок Павшего короля',type:'equipment',rarity:'epic',slot:'weapon',bonuses:{strength:10,rare_find:2}},
    {userId:'506371696878551041',key:'recovery_gloves_fallen_king',name:'Перчатки Павшего короля',type:'equipment',rarity:'epic',slot:'gloves',bonuses:{defense:6,strength:6}},
    {userId:'290777169431625728',key:'recovery_epic_hammer_fallen_king',name:'Императорский Молот Павшего короля',type:'equipment',rarity:'epic',slot:'weapon',bonuses:{strength:11,world_boss_damage:2}},
  ];
  const seed=db.prepare(`INSERT INTO hero_items(item_key,name,item_type,rarity,description,slot,bonuses_json,lore,is_consumable) VALUES(?,?,?,?,?,?,?,?,0)
    ON CONFLICT(item_key) DO UPDATE SET name=excluded.name,item_type=excluded.item_type,rarity=excluded.rarity,description=excluded.description,slot=excluded.slot,bonuses_json=excluded.bonuses_json,lore=excluded.lore`);
  const inv=db.prepare(`INSERT INTO hero_inventory(user_id,item_key,quantity,acquired_from) VALUES(?,?,1,'v19.1.3-recovery') ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=MAX(quantity,1)`);
  const coll=db.prepare(`INSERT OR IGNORE INTO hero_item_collection(user_id,item_key,first_acquired_from) VALUES(?,?,'v19.1.3-recovery')`);
  db.transaction(()=>{
    for(const r of rewards){
      seed.run(r.key,r.name,r.type,r.rarity,'Возвращённый предмет после исправления наград.',r.slot,JSON.stringify(r.bonuses),'Восстановлен владельцу администрацией Game Syndicate.');
      inv.run(r.userId,r.key); coll.run(r.userId,r.key);
    }
    db.prepare('INSERT INTO gs_one_time_migrations(migration_key) VALUES(?)').run(migrationKey);
  })();
  console.log('[V19.1.3] Целевые предметы восстановлены владельцам.');
}
applyV1913TargetedGearRecovery();


function applyV1914DungeonRewardRecovery(){
  db.exec(`CREATE TABLE IF NOT EXISTS gs_one_time_migrations (migration_key TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  const migrationKey='v19.1.4-heroic-giant-tomb-reward-recovery';
  if(db.prepare('SELECT 1 FROM gs_one_time_migrations WHERE migration_key=?').get(migrationKey)) return;
  const dustRewards=[
    ['759026090038657034',250],
    ['506371696878551041',198],
    ['561961056197672991',217],
    ['752908251896479915',221],
    ['290777169431625728',237],
    ['614389501955014667',229],
    ['680859156046938158',212],
  ];
  const rareRewards=[
    {userId:'759026090038657034',key:'dungeon_giant_tomb_signet',name:'Печать Гробницы Великана',rarity:'rare',slot:'ring',bonuses:{strength:3,luck:3}},
    {userId:'614389501955014667',key:'dungeon_giant_bone_cuirass',name:'Костяной Панцирь Великана',rarity:'epic',slot:'armor',bonuses:{hp:30,defense:7}},
    {userId:'680859156046938158',key:'dungeon_tomb_guard_hammer',name:'Молот Стража Гробницы',rarity:'epic',slot:'weapon',bonuses:{strength:9,world_boss_damage:2}},
  ];
  const seed=db.prepare(`INSERT INTO hero_items(item_key,name,item_type,rarity,description,slot,bonuses_json,lore,is_consumable) VALUES(?,?, 'equipment', ?, ?, ?, ?, ?, 0)
    ON CONFLICT(item_key) DO UPDATE SET name=excluded.name,rarity=excluded.rarity,description=excluded.description,slot=excluded.slot,bonuses_json=excluded.bonuses_json,lore=excluded.lore`);
  const inv=db.prepare(`INSERT INTO hero_inventory(user_id,item_key,quantity,acquired_from) VALUES(?,?,1,'v19.1.4-dungeon-recovery') ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=MAX(quantity,1)`);
  const coll=db.prepare(`INSERT OR IGNORE INTO hero_item_collection(user_id,item_key,first_acquired_from) VALUES(?,?,'v19.1.4-dungeon-recovery')`);
  db.transaction(()=>{
    for(const [userId,dust] of dustRewards){
      db.prepare(`INSERT OR IGNORE INTO players(user_id,username,card_dust) VALUES(?,?,0)`).run(userId,`Recovered ${userId}`);
      addCardDust(userId,dust,'Возврат награды: героическая Гробница Великана');
    }
    for(const r of rareRewards){
      seed.run(r.key,r.name,r.rarity,'Редкая добыча героического подземелья.',r.slot,JSON.stringify(r.bonuses),'Найдена в Гробнице Великана и восстановлена после исправления системы наград.');
      inv.run(r.userId,r.key); coll.run(r.userId,r.key);
    }
    const { grantCompanion }=require('../systems/hero/companionService');
    grantCompanion('290777169431625728','gray_wolf','v19.1.4-recovery');
    db.prepare('INSERT INTO gs_one_time_migrations(migration_key) VALUES(?)').run(migrationKey);
  })();
  console.log('[V19.1.4] Награды Гробницы Великана, редкие предметы и Серый Волк восстановлены.');
}
applyV1914DungeonRewardRecovery();

function createSchedule(dayKey=moscowDay()){
  const rng=seeded(`caravan:${dayKey}:${Date.now()}`);
  const [y,m,d]=dayKey.split('-').map(Number);
  const dayStart=Date.UTC(y,m-1,d,-3,0,0,0);
  const dayEnd=dayStart+24*60*60*1000-60*1000;
  const now=Date.now();
  const earliest=(moscowDay(now)===dayKey)?Math.max(dayStart,now+5*60*1000):dayStart;
  const latest=Math.max(earliest,dayEnd);
  const opens=earliest+Math.floor(rng()*Math.max(1,latest-earliest));
  const roundedOpens=Math.floor(opens/60000)*60000;
  const closes=roundedOpens+VISIT_MS;
  const atmosphereIndex=randint(0,ATMOSPHERE.length-1,rng);
  db.prepare(`INSERT INTO caravan_state(id,day_key,opens_at,closes_at,atmosphere_index,announced,updated_at) VALUES(1,?,?,?,?,0,CURRENT_TIMESTAMP)
  ON CONFLICT(id) DO UPDATE SET day_key=excluded.day_key,opens_at=excluded.opens_at,closes_at=excluded.closes_at,atmosphere_index=excluded.atmosphere_index,announced=0,updated_at=CURRENT_TIMESTAMP`).run(dayKey,iso(roundedOpens),iso(closes),atmosphereIndex);
  db.prepare('DELETE FROM caravan_offers WHERE day_key < ?').run(dayKey);
  return getState();
}
function getState(){return db.prepare('SELECT * FROM caravan_state WHERE id=1').get()||null;}
function ensureToday(){
  const day=moscowDay();
  const now=Date.now();
  let s=getState();
  if(!s) return createSchedule(day);
  if(now>=parseMs(s.opens_at)&&now<parseMs(s.closes_at)) return s;
  if(String(s.day_key)<day) return createSchedule(day);
  if(String(s.day_key)>day) return s;
  if(now>=parseMs(s.closes_at)) return createSchedule(nextMoscowDay(day));
  return s;
}
function isActive(now=Date.now()){const s=ensureToday();return now>=parseMs(s.opens_at)&&now<parseMs(s.closes_at);}
function remainingMs(now=Date.now()){const s=ensureToday();return Math.max(0,parseMs(s.closes_at)-now);}
function formatTimeLeft(ms=remainingMs()){const min=Math.max(0,Math.ceil(ms/60000));return `${min} мин.`;}
function statePublic(){const s=ensureToday();return {...s,active:isActive(),remainingMs:remainingMs(),atmosphere:ATMOSPHERE[s.atmosphere_index]||ATMOSPHERE[0]};}

function rollRarity(rng){let r=rng()*100;for(const [key,v] of Object.entries(RARITY)){r-=v.weight;if(r<=0)return key;}return 'common';}
function priceFor(rarity,rng){const x=RARITY[rarity];return Math.round(randint(x.min,x.max,rng)/10)*10;}
function recentKeys(userId){return new Set(db.prepare(`SELECT item_key FROM caravan_history WHERE user_id=? AND created_at>=datetime('now','-30 days')`).all(userId).map(x=>String(x.item_key).replace(/_(common|rare|epic|legendary|mythic|exclusive)$/,'')));}
function prepareItem(item,rarity,seed){return {...item,catalogKey:item.key,key:`${item.key}_${rarity}`,rarity,bonuses:bonusFor(item.type,rarity,seed)};}

function ensureOffers(userId){
  const s=ensureToday(); if(!isActive()) return [];
  let rows=db.prepare('SELECT * FROM caravan_offers WHERE day_key=? AND user_id=? ORDER BY slot_no').all(s.day_key,String(userId));
  if(rows.length)return rows.map(hydrateOffer);
  const rng=seeded(`${s.day_key}:${userId}:${s.opens_at}`); const blocked=recentKeys(userId); const picked=new Set(); const offers=[];
  const reservation=db.prepare('SELECT * FROM caravan_reservations WHERE user_id=?').get(String(userId));
  if(reservation){
    const item=JSON.parse(reservation.item_json);offers.push({slot:1,item,rarity:reservation.rarity,price:reservation.base_price,reserved:true});picked.add(item.catalogKey||String(reservation.item_key).replace(/_(common|rare|epic|legendary|mythic|exclusive)$/,''));
  }
  while(offers.length<5){
    let item=null;
    for(let tries=0;tries<200;tries++){const candidate=choose(CATALOG,rng);if(!picked.has(candidate.key)&&(!blocked.has(candidate.key)||tries>150)){item=candidate;break;}}
    if(!item) item=choose(CATALOG,rng);
    const rarity=item.fixedRarity||rollRarity(rng); const full=prepareItem(item,rarity,`${userId}:${s.day_key}:${item.key}`);
    offers.push({slot:offers.length+1,item:full,rarity,price:priceFor(rarity,rng),reserved:false});picked.add(item.key);
  }
  const dealIndex=randint(0,offers.length-1,rng); const discount=randint(25,40,rng);
  const insert=db.prepare(`INSERT INTO caravan_offers(day_key,user_id,slot_no,item_key,item_json,rarity,base_price,current_price,is_daily_deal,discount_percent) VALUES(?,?,?,?,?,?,?,?,?,?)`);
  db.transaction(()=>{
    for(let idx=0;idx<offers.length;idx++){
      const o=offers[idx],daily=idx===dealIndex?1:0,finalPrice=daily?Math.max(50,Math.round(o.price*(100-discount)/100/10)*10):o.price;
      insert.run(s.day_key,String(userId),o.slot,o.item.key,JSON.stringify(o.item),o.rarity,o.price,finalPrice,daily,daily?discount:0);
      db.prepare(`INSERT INTO caravan_history(user_id,item_key,day_key,action) VALUES(?,?,?,'shown')`).run(String(userId),o.item.key,s.day_key);
    }
  })();
  return db.prepare('SELECT * FROM caravan_offers WHERE day_key=? AND user_id=? ORDER BY slot_no').all(s.day_key,String(userId)).map(hydrateOffer);
}
function hydrateOffer(row){return {...row,item:JSON.parse(row.item_json)};}
function getOffer(userId,id){const s=ensureToday();const row=db.prepare('SELECT * FROM caravan_offers WHERE id=? AND user_id=? AND day_key=?').get(Number(id),String(userId),s.day_key);return row?hydrateOffer(row):null;}

function reserveOffer(userId,id){const offer=getOffer(userId,id);if(!offer||offer.purchased)return {ok:false,reason:'missing'};
  db.prepare(`INSERT INTO caravan_reservations(user_id,item_key,item_json,rarity,base_price,reserved_at) VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)
  ON CONFLICT(user_id) DO UPDATE SET item_key=excluded.item_key,item_json=excluded.item_json,rarity=excluded.rarity,base_price=excluded.base_price,reserved_at=CURRENT_TIMESTAMP`).run(String(userId),offer.item_key,offer.item_json,offer.rarity,offer.base_price);
  db.prepare(`INSERT INTO caravan_history(user_id,item_key,day_key,action) VALUES(?,?,?,'reserved')`).run(String(userId),offer.item_key,offer.day_key);
  return {ok:true,offer};
}
function cancelReservation(userId){const r=db.prepare('DELETE FROM caravan_reservations WHERE user_id=?').run(String(userId));return {ok:r.changes>0};}
function bargain(userId,id){const offer=getOffer(userId,id);if(!offer||offer.purchased)return {ok:false,reason:'missing'};if(offer.bargained)return {ok:false,reason:'used',offer};
  const rng=seeded(`bargain:${offer.day_key}:${userId}:${id}`);const roll=rng()*100;let percent=0;if(roll<10)percent=10;else if(roll<30)percent=-30;else if(roll<55)percent=-20;else if(roll<80)percent=-10;
  const next=Math.max(50,Math.round(offer.current_price*(100+percent)/100/10)*10);
  db.prepare('UPDATE caravan_offers SET current_price=?,bargained=1 WHERE id=?').run(next,offer.id);
  return {ok:true,percent,oldPrice:offer.current_price,newPrice:next,offer:getOffer(userId,id)};
}
function seedCaravanItem(item){
  db.prepare(`INSERT INTO hero_items(item_key,name,item_type,rarity,description,slot,bonuses_json,lore,is_consumable) VALUES(?,?,?,?,?,?,?,?,0)
  ON CONFLICT(item_key) DO UPDATE SET name=excluded.name,item_type=excluded.item_type,rarity=excluded.rarity,description=excluded.description,slot=excluded.slot,bonuses_json=excluded.bonuses_json,lore=excluded.lore`).run(item.key,item.name,item.type,item.rarity,item.description,item.slot||null,JSON.stringify(item.bonuses||{}),item.lore||'');
}
function companionDataFromCaravanItem(item){
  return {
    name:item.name,
    icon:item.icon || (item.type==='mount' ? '🐎' : '🐾'),
    rarity:item.rarity || 'common',
    description:item.description || 'Редкий спутник, привезённый Караванщиком.',
    bonuses:item.bonuses || {},
    kind:item.type==='mount'?'mount':'pet',
  };
}
function grantPurchased(userId,item){
  if(item.type==='pet'&&String(item.catalogKey||item.key).startsWith('pet:')){
    const { grantCompanion }=require('../systems/hero/companionService');return grantCompanion(userId,String(item.catalogKey||item.key).slice(4),'caravan');
  }
  seedCaravanItem(item);
  db.prepare(`INSERT INTO hero_inventory(user_id,item_key,quantity,acquired_from) VALUES(?,?,1,'caravan') ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=quantity+1,acquired_from='caravan'`).run(String(userId),item.key);
  db.prepare(`INSERT OR IGNORE INTO hero_item_collection(user_id,item_key,first_acquired_from) VALUES(?,?,'caravan')`).run(String(userId),item.key);
  if(item.type==='mount'){
    const { grantCustomCompanion }=require('../systems/hero/companionService');
    grantCustomCompanion(String(userId),item.key,companionDataFromCaravanItem(item),'caravan');
  }
  return true;
}
function buyOffer(userId,id){const offer=getOffer(userId,id);if(!isActive())return {ok:false,reason:'closed'};if(!offer||offer.purchased)return {ok:false,reason:'missing'};
  try{return db.transaction(()=>{
    const payment=removeCardDust(String(userId),offer.current_price,`Караванщик: ${offer.item.name}`);if(!payment.ok)return {ok:false,reason:'dust',balance:payment.balance};
    grantPurchased(String(userId),offer.item);
    db.prepare('UPDATE caravan_offers SET purchased=1 WHERE id=? AND purchased=0').run(offer.id);
    db.prepare('DELETE FROM caravan_reservations WHERE user_id=? AND item_key=?').run(String(userId),offer.item_key);
    db.prepare(`INSERT INTO caravan_history(user_id,item_key,day_key,action) VALUES(?,?,?,'purchased')`).run(String(userId),offer.item_key,offer.day_key);
    return {ok:true,offer,balance:payment.balance};
  })();}catch(error){console.error('[Caravan buy]',error);return {ok:false,reason:'error'};}}

async function announce(client,s){
  const channel=await client.channels.fetch(GUILD_CHANNEL_ID).catch(()=>null);if(!channel?.isTextBased())return;
  const [icon,text]=ATMOSPHERE[s.atmosphere_index]||ATMOSPHERE[0];
  await channel.send({content:`## 🐪 В Гильдию прибыл Караванщик!\n${icon} **${text}**\n\n🎁 Для каждого героя подготовлены **5 персональных предложений**.\n🔥 Одно из них — **Товар дня** со скидкой.\n⭐ Желаемый предмет можно отложить до следующего визита.\n\n⏳ Караванщик пробудет здесь всего **30 минут**. Откройте **🏰 Гильдейцы → 🐪 Караванщик**.`});
}
async function refreshHub(client){try{const guild=require('../commands/guild');if(guild?.ensureGuildHub)await guild.ensureGuildHub(client);}catch(e){console.error('[Caravan hub refresh]',e);}}

function applyV1935DailyScheduleReset(){
 db.exec(`CREATE TABLE IF NOT EXISTS gs_one_time_migrations (migration_key TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
 const key='v19.3.5-caravan-daily-from-2026-07-30';
 if(db.prepare('SELECT 1 FROM gs_one_time_migrations WHERE migration_key=?').get(key))return;
 const today=moscowDay();
 if(today<='2026-07-29')createSchedule('2026-07-30');
 else ensureToday();
 db.prepare('INSERT INTO gs_one_time_migrations(migration_key) VALUES(?)').run(key);
 console.log('[V19.3.5] Caravan current visit suppressed; daily schedule resumes from 2026-07-30.');
}
applyV1935DailyScheduleReset();

let timer=null,lastActive=null;
function startCaravanScheduler(client){if(timer)return timer;ensureToday();const tick=async()=>{const s=ensureToday(),active=isActive();if(active&&!s.announced){db.prepare('UPDATE caravan_state SET announced=1 WHERE id=1').run();await announce(client,s);await refreshHub(client);}if(lastActive===true&&!active)await refreshHub(client);lastActive=active;};tick().catch(console.error);timer=setInterval(()=>tick().catch(console.error),CHECK_MS);timer.unref?.();console.log('🐪 Caravan scheduler started');return timer;}

module.exports={RARITY,CATALOG,ATMOSPHERE,ensureToday,isActive,remainingMs,formatTimeLeft,statePublic,ensureOffers,getOffer,reserveOffer,cancelReservation,bargain,buyOffer,getCardDust,startCaravanScheduler};

// V19.1.5 — точечная коррекция предметов и публичный отчёт о восстановлении данжа.
function applyV1915TargetedCorrections(){
  db.exec(`CREATE TABLE IF NOT EXISTS gs_one_time_migrations (migration_key TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  const migrationKey='v19.1.5-targeted-item-corrections';
  if(db.prepare('SELECT 1 FROM gs_one_time_migrations WHERE migration_key=?').get(migrationKey)) return false;

  const seed=db.prepare(`INSERT INTO hero_items(item_key,name,item_type,rarity,description,slot,bonuses_json,lore,is_consumable)
    VALUES(?,?, 'equipment', ?, ?, ?, ?, ?, 0)
    ON CONFLICT(item_key) DO UPDATE SET name=excluded.name,item_type='equipment',rarity=excluded.rarity,description=excluded.description,slot=excluded.slot,bonuses_json=excluded.bonuses_json,lore=excluded.lore`);
  const inv=db.prepare(`INSERT INTO hero_inventory(user_id,item_key,quantity,acquired_from) VALUES(?,?,1,'v19.1.5-correction')
    ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=MAX(quantity,1),acquired_from='v19.1.5-correction'`);
  const coll=db.prepare(`INSERT OR IGNORE INTO hero_item_collection(user_id,item_key,first_acquired_from) VALUES(?,?,'v19.1.5-correction')`);

  function removeItem(userId,itemKey){
    const rows=db.prepare('SELECT id FROM hero_inventory WHERE user_id=? AND item_key=?').all(userId,itemKey);
    for(const row of rows){
      db.prepare('DELETE FROM hero_equipment WHERE user_id=? AND inventory_id=?').run(userId,row.id);
      db.prepare('DELETE FROM hero_class_equipment WHERE user_id=? AND inventory_id=?').run(userId,row.id);
    }
    db.prepare('DELETE FROM hero_inventory WHERE user_id=? AND item_key=?').run(userId,itemKey);
  }
  function give(r){
    seed.run(r.key,r.name,r.rarity,r.description||'Предмет скорректирован администрацией Game Syndicate.',r.slot,JSON.stringify(r.bonuses),r.lore||'Исправленная версия предмета.');
    inv.run(r.userId,r.key); coll.run(r.userId,r.key);
  }

  db.transaction(()=>{
    // 302797251271458817: заменить ошибочные эпические перчатки и выдать талисман.
    removeItem('302797251271458817','recovery_imperial_plate_gloves_north');
    give({userId:'302797251271458817',key:'correction_abyssal_wanderer_talisman',name:'Бездонный Талисман Странника',rarity:'epic',slot:'amulet',bonuses:{hp:10,intelligence:5}});
    give({userId:'302797251271458817',key:'correction_imperial_plate_gloves_north_rare',name:'Императорские Латные перчатки Севера',rarity:'rare',slot:'gloves',bonuses:{strength:3,dexterity:3}});

    // 561961056197672991: заменить ошибочные эпические сандалии и перчатки.
    removeItem('561961056197672991','recovery_bone_sandals_fallen_king');
    removeItem('561961056197672991','recovery_gloves_fallen_king');
    // На случай, если ошибочные перчатки ранее оказались у 506371696878551041.
    removeItem('506371696878551041','recovery_gloves_fallen_king');
    give({userId:'561961056197672991',key:'correction_bone_sandals_fallen_king_rare',name:'Костяные Сандалии странника Павшего короля',rarity:'rare',slot:'boots',bonuses:{dexterity:5,expedition_success:2}});
    give({userId:'561961056197672991',key:'correction_gloves_fallen_king_rare',name:'Перчатки Павшего короля',rarity:'rare',slot:'gloves',bonuses:{strength:3,dexterity:3}});

    db.prepare('INSERT INTO gs_one_time_migrations(migration_key) VALUES(?)').run(migrationKey);
  })();
  console.log('[V19.1.5] Ошибочные версии экипировки заменены корректными.');
  return true;
}
applyV1915TargetedCorrections();

async function sendV1915DungeonRecoveryNotice(client){
  db.exec(`CREATE TABLE IF NOT EXISTS gs_one_time_migrations (migration_key TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  const key='v19.1.5-dungeon-recovery-notice-channel-1531291125195866203';
  if(db.prepare('SELECT 1 FROM gs_one_time_migrations WHERE migration_key=?').get(key)) return;
  const channel=await client.channels.fetch('1531291125195866203').catch(()=>null);
  if(!channel?.isTextBased?.()) return;
  await channel.send({embeds:[{
    color:0x7c3aed,
    title:'🏆 Награды героической Гробницы Великана восстановлены',
    description:[
      'После проверки прошлого прохождения участникам возвращены потерянные **GS Dust**, а редкая добыча распределена между частью группы по изначальной логике героического подземелья.',
      '',
      '**💎 Редкая добыча:**',
      '<@759026090038657034> — **Печать Гробницы Великана**',
      '<@614389501955014667> — **Костяной Панцирь Великана**',
      '<@680859156046938158> — **Молот Стража Гробницы**',
      '',
      'Остальные участники получили положенную пыль и опыт. Дальнейшие итоги подземелий будут прямо показывать, кто получил Dust, а кому выпал редкий предмет.'
    ].join('\n'),
    footer:{text:'Game Syndicate • Dungeon Reward Recovery V19.1.5'},
    timestamp:new Date().toISOString(),
  }]});
  db.prepare('INSERT INTO gs_one_time_migrations(migration_key) VALUES(?)').run(key);
}

module.exports.sendV1915DungeonRecoveryNotice=sendV1915DungeonRecoveryNotice;

// V19.1.6 — восстановление Логова Мантикоры и Изумрудного Обруча Севера.
function applyV1916DungeonAndItemRecovery(){
  db.exec(`CREATE TABLE IF NOT EXISTS gs_one_time_migrations (migration_key TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  const migrationKey='v19.1.6-manticore-dungeon-and-emerald-ring-recovery';
  if(db.prepare('SELECT 1 FROM gs_one_time_migrations WHERE migration_key=?').get(migrationKey)) return false;
  const dustRewards=[
    ['759026090038657034',198],['752908251896479915',230],['468683569359880192',175],['290777169431625728',162],
    ['219160343467786240',178],['561961056197672991',173],['614389501955014667',212],['506371696878551041',151],
  ];
  const items=[
    {userId:'752908251896479915',key:'recovery_emerald_circlet_north_254',name:'Изумрудный Обруч Севера',rarity:'rare',slot:'ring',quantity:2,bonuses:{luck:3,rare_find:2},description:'Редкий северный обруч, восстановленный владельцу.'},
    {userId:'752908251896479915',key:'dungeon_manticore_venom_ring',name:'Кольцо Яда Мантикоры',rarity:'epic',slot:'ring',quantity:1,bonuses:{dexterity:6,rare_find:2},description:'Редкая добыча героического Логова Мантикоры.'},
    {userId:'468683569359880192',key:'dungeon_manticore_hide_armor',name:'Панцирь Мантикоры',rarity:'epic',slot:'armor',quantity:1,bonuses:{hp:24,defense:7},description:'Редкая добыча героического Логова Мантикоры.'},
    {userId:'219160343467786240',key:'dungeon_manticore_tail_spear',name:'Копьё Хвоста Мантикоры',rarity:'epic',slot:'weapon',quantity:1,bonuses:{strength:8,dexterity:4},description:'Редкая добыча героического Логова Мантикоры.'},
  ];
  const seed=db.prepare(`INSERT INTO hero_items(item_key,name,item_type,rarity,description,slot,bonuses_json,lore,is_consumable)
    VALUES(?,?, 'equipment', ?, ?, ?, ?, ?, 0)
    ON CONFLICT(item_key) DO UPDATE SET name=excluded.name,item_type='equipment',rarity=excluded.rarity,description=excluded.description,slot=excluded.slot,bonuses_json=excluded.bonuses_json,lore=excluded.lore`);
  const inv=db.prepare(`INSERT INTO hero_inventory(user_id,item_key,quantity,acquired_from) VALUES(?,?,?,'v19.1.6-recovery')
    ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=MAX(quantity,excluded.quantity),acquired_from='v19.1.6-recovery'`);
  const coll=db.prepare(`INSERT OR IGNORE INTO hero_item_collection(user_id,item_key,first_acquired_from) VALUES(?,?,'v19.1.6-recovery')`);
  db.transaction(()=>{
    for(const [userId,dust] of dustRewards){
      db.prepare(`INSERT OR IGNORE INTO players(user_id,username,card_dust) VALUES(?,?,0)`).run(userId,`Recovered ${userId}`);
      addCardDust(userId,dust,'Возврат награды: героическое Логово Мантикоры');
    }
    for(const r of items){
      seed.run(r.key,r.name,r.rarity,r.description,r.slot,JSON.stringify(r.bonuses),r.description);
      inv.run(r.userId,r.key,r.quantity||1); coll.run(r.userId,r.key);
    }
    db.prepare('INSERT INTO gs_one_time_migrations(migration_key) VALUES(?)').run(migrationKey);
  })();
  console.log('[V19.1.6] Награды Логова Мантикоры и два Изумрудных Обруча Севера восстановлены.');
  return true;
}
applyV1916DungeonAndItemRecovery();

// V19.2.4 — разовый возврат Кольца Яда Мантикоры игроку 752908251896479915.
// Без публичного уведомления и без записи в журнал наград.
function applyV1924ManticoreRingReturn(){
  db.exec(`CREATE TABLE IF NOT EXISTS gs_one_time_migrations (migration_key TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  const migrationKey='v19.2.4-return-manticore-ring-752908251896479915';
  if(db.prepare('SELECT 1 FROM gs_one_time_migrations WHERE migration_key=?').get(migrationKey)) return false;

  const userId='752908251896479915';
  const itemKey='dungeon_manticore_venom_ring';
  db.transaction(()=>{
    db.prepare(`INSERT INTO hero_items(item_key,name,item_type,rarity,description,slot,bonuses_json,lore,is_consumable)
      VALUES(?,?,'equipment',?,?,?,?,?,0)
      ON CONFLICT(item_key) DO UPDATE SET
        name=excluded.name,item_type='equipment',rarity=excluded.rarity,
        description=excluded.description,slot=excluded.slot,
        bonuses_json=excluded.bonuses_json,lore=excluded.lore`).run(
          itemKey,
          'Кольцо Яда Мантикоры',
          'epic',
          'Редкая добыча героического Логова Мантикоры.',
          'ring',
          JSON.stringify({dexterity:6,rare_find:2}),
          'Редкая добыча героического Логова Мантикоры.'
        );
    db.prepare(`INSERT INTO hero_inventory(user_id,item_key,quantity,acquired_from)
      VALUES(?,?,1,'v19.2.4-return')
      ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=quantity+1`).run(userId,itemKey);
    db.prepare(`INSERT OR IGNORE INTO hero_item_collection(user_id,item_key,first_acquired_from)
      VALUES(?,?,'v19.2.4-return')`).run(userId,itemKey);
    db.prepare('INSERT INTO gs_one_time_migrations(migration_key) VALUES(?)').run(migrationKey);
  })();
  console.log('[V19.2.4] Кольцо Яда Мантикоры возвращено игроку 752908251896479915.');
  return true;
}
applyV1924ManticoreRingReturn();


// V19.3.7 — точечное восстановление двух потерянных колец.
function applyV1937InventoryRecovery(){
  db.exec(`CREATE TABLE IF NOT EXISTS gs_one_time_migrations (migration_key TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  const migrationKey='v19.3.7-ring-and-cancelled-market-recovery';
  if(db.prepare('SELECT 1 FROM gs_one_time_migrations WHERE migration_key=?').get(migrationKey)) return false;
  db.transaction(()=>{
    const manticoreKey='dungeon_manticore_venom_ring';
    db.prepare(`INSERT INTO hero_items(item_key,name,item_type,rarity,description,slot,bonuses_json,lore,is_consumable)
      VALUES(?,?,'equipment',?,?,?,?,?,0)
      ON CONFLICT(item_key) DO UPDATE SET name=excluded.name,item_type='equipment',rarity=excluded.rarity,description=excluded.description,slot=excluded.slot,bonuses_json=excluded.bonuses_json,lore=excluded.lore`).run(
        manticoreKey,'Кольцо Яда Мантикоры','epic','Редкая добыча героического Логова Мантикоры.','ring',JSON.stringify({dexterity:6,rare_find:2}),'Редкая добыча героического Логова Мантикоры.'
      );
    db.prepare(`INSERT INTO hero_inventory(user_id,item_key,quantity,acquired_from)
      VALUES(?,?,1,'v19.3.7-recovery')
      ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=quantity+1,acquired_from='v19.3.7-recovery'`).run('752908251896479915',manticoreKey);
    db.prepare(`INSERT OR IGNORE INTO hero_item_collection(user_id,item_key,first_acquired_from) VALUES(?,?,'v19.3.7-recovery')`).run('752908251896479915',manticoreKey);

    const cancelled=db.prepare(`SELECT * FROM equipment_market_listings
      WHERE seller_id=? AND status='cancelled' AND lower(item_name) LIKE '%кольц%'
      ORDER BY COALESCE(closed_at,created_at) DESC,id DESC LIMIT 1`).get('759026090038657034');
    if(cancelled){
      const exists=db.prepare('SELECT 1 FROM hero_items WHERE item_key=?').get(cancelled.item_key);
      if(exists){
        db.prepare(`INSERT INTO hero_inventory(user_id,item_key,quantity,upgrade_level,acquired_from)
          VALUES(?,?,1,?,'v19.3.7-market-cancel-recovery')
          ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=quantity+1,upgrade_level=MAX(COALESCE(upgrade_level,0),excluded.upgrade_level),acquired_from='v19.3.7-market-cancel-recovery'`)
          .run('759026090038657034',cancelled.item_key,Number(cancelled.upgrade_level||0));
        db.prepare(`INSERT OR IGNORE INTO hero_item_collection(user_id,item_key,first_acquired_from) VALUES(?,?,'v19.3.7-market-cancel-recovery')`).run('759026090038657034',cancelled.item_key);
      }
    }
    db.prepare('INSERT INTO gs_one_time_migrations(migration_key) VALUES(?)').run(migrationKey);
  })();
  console.log('[V19.3.7] Выполнено восстановление Кольца Яда Мантикоры и последнего снятого с рынка кольца.');
  return true;
}
applyV1937InventoryRecovery();

async function sendV1916ManticoreRecoveryNotice(client){
  db.exec(`CREATE TABLE IF NOT EXISTS gs_one_time_migrations (migration_key TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  const key='v19.1.6-manticore-recovery-notice-channel-1531291125195866203';
  if(db.prepare('SELECT 1 FROM gs_one_time_migrations WHERE migration_key=?').get(key)) return;
  const channel=await client.channels.fetch('1531291125195866203').catch(()=>null);
  if(!channel?.isTextBased?.()) return;
  await channel.send({embeds:[{
    color:0x2563eb,
    title:'🏆 Награды героического Логова Мантикоры восстановлены',
    description:[
      'Участникам прошлого прохождения возвращены указанные в итогах **GS Dust**. По правилам героического подземелья редкая добыча досталась только части группы.',
      '',
      '**💎 Редкая добыча:**',
      '<@752908251896479915> — **Кольцо Яда Мантикоры**',
      '<@468683569359880192> — **Панцирь Мантикоры**',
      '<@219160343467786240> — **Копьё Хвоста Мантикоры**',
      '',
      'Остальные участники получили положенную пыль. Новые итоги подземелий сразу показывают каждому игроку Dust, опыт и выпавший предмет.'
    ].join('\n'),
    footer:{text:'Game Syndicate • Dungeon Reward Recovery V19.1.6'},
    timestamp:new Date().toISOString(),
  }]});
  db.prepare('INSERT INTO gs_one_time_migrations(migration_key) VALUES(?)').run(key);
}
module.exports.sendV1916ManticoreRecoveryNotice=sendV1916ManticoreRecoveryNotice;
