const { db, getCardDust, removeCardDust } = require('../database/db');
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
function grantPurchased(userId,item){
  if(item.type==='pet'&&String(item.catalogKey||item.key).startsWith('pet:')){
    const { grantCompanion }=require('../systems/hero/companionService');return grantCompanion(userId,String(item.catalogKey||item.key).slice(4),'caravan');
  }
  seedCaravanItem(item);
  db.prepare(`INSERT INTO hero_inventory(user_id,item_key,quantity,acquired_from) VALUES(?,?,1,'caravan') ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=quantity+1,acquired_from='caravan'`).run(String(userId),item.key);
  db.prepare(`INSERT OR IGNORE INTO hero_item_collection(user_id,item_key,first_acquired_from) VALUES(?,?,'caravan')`).run(String(userId),item.key);
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
let timer=null,lastActive=null;
function startCaravanScheduler(client){if(timer)return timer;ensureToday();const tick=async()=>{const s=ensureToday(),active=isActive();if(active&&!s.announced){db.prepare('UPDATE caravan_state SET announced=1 WHERE id=1').run();await announce(client,s);await refreshHub(client);}if(lastActive===true&&!active)await refreshHub(client);lastActive=active;};tick().catch(console.error);timer=setInterval(()=>tick().catch(console.error),CHECK_MS);timer.unref?.();console.log('🐪 Caravan scheduler started');return timer;}

module.exports={RARITY,CATALOG,ATMOSPHERE,ensureToday,isActive,remainingMs,formatTimeLeft,statePublic,ensureOffers,getOffer,reserveOffer,cancelReservation,bargain,buyOffer,getCardDust,startCaravanScheduler};
