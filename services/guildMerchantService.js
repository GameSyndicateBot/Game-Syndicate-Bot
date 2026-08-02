const { db, getCardDust, addCardDust, removeCardDust } = require('../database/db');
const { MATERIALS } = require('../systems/hero/materialData');
const { ITEMS, RARITY_LABELS } = require('../systems/hero/itemData');
const { listResources, consumeResources, grantResource } = require('../systems/hero/resourceService');
const { getInventory, getInventoryItem } = require('../systems/hero/itemService');
const { getProfessionCounts } = require('../systems/hero/professionService');
const { sellableCompanions, takeCompanionForTransfer } = require('../systems/hero/companionService');

const PROFESSION_KEYS = {
  herbalist: ['forest_herbs','culinary_herbs','moon_blossom','spicy_herbs','herb_extract','herb'],
  miner: ['iron_ore','iron_ingot','gemstone','crystal','ancient_fragment','stone'],
  lumberjack: ['wood','hardwood','board','wild_berries','forest_mushrooms','ancient_wood'],
  fisher: ['fresh_fish','shellfish','moon_carp','pearl'],
  hunter: ['raw_meat','beast_hide','beast_bone','beast_heart','leather','bone'],
};
const RARITY_MULT = { common:1, rare:1.55, epic:2.5, legendary:4.2, mythic:7, exclusive:10 };
const EQUIPMENT_BASE = { common:140, rare:380, epic:950, legendary:2400, mythic:5600, exclusive:8500 };
const CONSUMABLE_BASE = { common:18, rare:45, epic:110, legendary:260, mythic:600, exclusive:900 };

db.exec(`
CREATE TABLE IF NOT EXISTS guild_merchant_sales (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id TEXT NOT NULL,
 asset_type TEXT NOT NULL,
 asset_key TEXT NOT NULL,
 quantity INTEGER NOT NULL,
 dust_paid INTEGER NOT NULL,
 unit_price INTEGER NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_guild_merchant_sales_asset_time ON guild_merchant_sales(asset_key,created_at);
CREATE TABLE IF NOT EXISTS guild_merchant_stock (
 stock_date TEXT NOT NULL,
 material_key TEXT NOT NULL,
 quantity INTEGER NOT NULL,
 unit_price INTEGER NOT NULL,
 PRIMARY KEY(stock_date,material_key)
);
`);

function moscowDateKey(date=new Date()){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}
function professionForMaterial(key){
  return Object.entries(PROFESSION_KEYS).find(([,keys])=>keys.includes(key))?.[0] || null;
}
function professionPopulation(){
  const rows = getProfessionCounts?.() || [];
  const map = {};
  if (Array.isArray(rows)) for (const r of rows) map[r.profession_key || r.key] = Number(r.count || r.total || 0);
  else if (rows && typeof rows === 'object') Object.assign(map, rows);
  return map;
}
function scarcityMultiplier(key){
  const profession = professionForMaterial(key);
  if(!profession) return 1;
  const counts = professionPopulation();
  const values = Object.keys(PROFESSION_KEYS).map(k=>Number(counts[k]||0));
  const avg = values.reduce((a,b)=>a+b,0) / Math.max(1, values.filter(v=>v>=0).length);
  const count = Number(counts[profession]||0);
  if(avg <= 0) return 1;
  const raw = Math.sqrt((avg + 1)/(count + 1));
  return Math.max(.72, Math.min(1.48, raw));
}
function recentSupplyMultiplier(key){
  const row=db.prepare(`SELECT COALESCE(SUM(quantity),0) qty FROM guild_merchant_sales WHERE asset_key=? AND created_at>=datetime('now','-7 day')`).get(key);
  const qty=Number(row?.qty||0);
  return Math.max(.78, 1-Math.min(.22,qty/1200));
}
function materialBuyPrice(key){
  const m=MATERIALS[key]||ITEMS[key]||{};
  const base=Math.max(5,Number(m.value)||10);
  const rarity=RARITY_MULT[m.rarity||'common']||1;
  return Math.max(4,Math.round(base*1.35*rarity*scarcityMultiplier(key)*recentSupplyMultiplier(key)));
}
function equipmentBuyPrice(item){
  const rarity=item.rarity||'common';
  const base=EQUIPMENT_BASE[rarity]||140;
  const upgrade=1+Math.max(0,Number(item.upgrade_level)||0)*.12;
  return Math.max(50,Math.round(base*upgrade));
}
function saleStock(){
  const date=moscowDateKey();
  let rows=db.prepare('SELECT * FROM guild_merchant_stock WHERE stock_date=? AND quantity>0 ORDER BY unit_price DESC').all(date);
  if(rows.length) return rows.map(r=>({...r,meta:MATERIALS[r.material_key]||ITEMS[r.material_key]||{name:r.material_key,icon:'📦'}}));
  const keys=Object.keys(MATERIALS).filter(k=>Number(MATERIALS[k].value||0)>0);
  const seeded=[...keys].sort(()=>Math.random()-.5).slice(0,7);
  const ins=db.prepare('INSERT OR IGNORE INTO guild_merchant_stock(stock_date,material_key,quantity,unit_price) VALUES(?,?,?,?)');
  const tx=db.transaction(()=>seeded.forEach(k=>{
    const buy=materialBuyPrice(k);
    ins.run(date,k,Math.max(2,Math.floor(3+Math.random()*10)),Math.max(buy+2,Math.round(buy*1.58)));
  })); tx();
  rows=db.prepare('SELECT * FROM guild_merchant_stock WHERE stock_date=? AND quantity>0 ORDER BY unit_price DESC').all(date);
  return rows.map(r=>({...r,meta:MATERIALS[r.material_key]||ITEMS[r.material_key]||{name:r.material_key,icon:'📦'}}));
}
function sellableMaterials(userId){
  return listResources(userId).map(r=>({...r,unitPrice:materialBuyPrice(r.key),profession:professionForMaterial(r.key)})).filter(r=>r.quantity>0);
}
function equippedReservationMap(userId){
  // hero_inventory хранит одинаковые предметы одной строкой с quantity > 1.
  // Один надетый экземпляр резервирует только одну штуку, а не всю стопку.
  const rows=db.prepare(`
    SELECT inventory_id FROM hero_equipment WHERE user_id=?
    UNION
    SELECT inventory_id FROM hero_class_equipment WHERE user_id=?
  `).all(userId,userId);
  const reserved=new Map();
  for(const row of rows){
    const id=Number(row.inventory_id);
    if(Number.isFinite(id)) reserved.set(id,1);
  }
  return reserved;
}
function sellableEquipment(userId){
  const reserved=equippedReservationMap(userId);
  return getInventory(userId,{limit:100})
    .filter(i=>i.slot)
    .map(i=>{
      const equippedQuantity=reserved.get(Number(i.id))||0;
      // Разрешаем продажу даже единственного экземпляра. При подтверждении
      // он автоматически снимается со всех комплектов и затем передаётся торговцу.
      const sellableQuantity=Math.max(0,Number(i.quantity||0));
      return {...i,equippedQuantity,sellableQuantity,unitPrice:equipmentBuyPrice(i)};
    })
    .filter(i=>i.sellableQuantity>0);
}
function sellMaterial(userId,key,quantity){
  const owned=sellableMaterials(userId).find(x=>x.key===key);
  const qty=Math.max(1,Math.min(Number(quantity)||1,Number(owned?.quantity)||0));
  if(!owned||qty<=0)return {ok:false,reason:'missing'};
  const unit=materialBuyPrice(key), total=unit*qty;
  const tx=db.transaction(()=>{
    const taken=consumeResources(userId,{[key]:qty}); if(!taken.ok)throw new Error('missing');
    addCardDust(userId,total);
    db.prepare('INSERT INTO guild_merchant_sales(user_id,asset_type,asset_key,quantity,dust_paid,unit_price) VALUES(?,?,?,?,?,?)').run(userId,'material',key,qty,total,unit);
  });
  try{tx();return {ok:true,total,qty,unit,balance:getCardDust(userId),item:owned};}catch(e){return {ok:false,reason:e.message};}
}
function sellEquipment(userId,id){
  const item=sellableEquipment(userId).find(x=>Number(x.id)===Number(id));
  if(!item)return {ok:false,reason:'missing'};
  const total=equipmentBuyPrice(item);
  const tx=db.transaction(()=>{
    // Продаём ровно один свободный экземпляр. Если в строке quantity=2 и один
    // экземпляр надет, второй можно продать, не затрагивая экипированный.
    const current=db.prepare('SELECT quantity FROM hero_inventory WHERE id=? AND user_id=?').get(Number(id),userId);
    if(!current||Number(current.quantity)<1)throw new Error('missing');
    const reserved=equippedReservationMap(userId).get(Number(id))||0;
    if(reserved>0){
      db.prepare('DELETE FROM hero_equipment WHERE user_id=? AND inventory_id=?').run(String(userId),Number(id));
      db.prepare('DELETE FROM hero_class_equipment WHERE user_id=? AND inventory_id=?').run(String(userId),Number(id));
      try{db.prepare('DELETE FROM hero_artifact_equipment WHERE user_id=? AND inventory_id=?').run(String(userId),Number(id));}catch(_){}
    }
    const changed=Number(current.quantity)===1
      ? db.prepare('DELETE FROM hero_inventory WHERE id=? AND user_id=?').run(Number(id),userId)
      : db.prepare('UPDATE hero_inventory SET quantity=quantity-1 WHERE id=? AND user_id=?').run(Number(id),userId);
    if(!changed.changes)throw new Error('missing');
    addCardDust(userId,total);
    db.prepare('INSERT INTO guild_merchant_sales(user_id,asset_type,asset_key,quantity,dust_paid,unit_price) VALUES(?,?,?,?,?,?)').run(userId,'equipment',item.item_key,1,total,total);
  });
  try{tx();return {ok:true,total,item,balance:getCardDust(userId)};}catch(e){return {ok:false,reason:e.message};}
}

function consumableBuyPrice(item){
  const rarity=item?.rarity||'common';
  return Math.max(5,Math.round(CONSUMABLE_BASE[rarity]||18));
}
function sellableConsumables(userId){
  return getInventory(userId,{type:'consumable',limit:100})
    .filter(i=>Number(i.quantity||0)>0)
    .map(i=>({...i,unitPrice:consumableBuyPrice(i)}));
}
function sellConsumable(userId,id,quantity=1){
  const item=sellableConsumables(userId).find(x=>Number(x.id)===Number(id));
  if(!item)return {ok:false,reason:'missing'};
  const qty=Math.max(1,Math.min(Number(quantity)||1,Number(item.quantity)||0));
  if(qty<1)return {ok:false,reason:'missing'};
  const unit=consumableBuyPrice(item),total=unit*qty;
  try{return db.transaction(()=>{
    const current=db.prepare('SELECT quantity FROM hero_inventory WHERE id=? AND user_id=?').get(Number(id),String(userId));
    if(!current||Number(current.quantity)<qty)throw new Error('missing');
    const changed=Number(current.quantity)===qty
      ? db.prepare('DELETE FROM hero_inventory WHERE id=? AND user_id=?').run(Number(id),String(userId))
      : db.prepare('UPDATE hero_inventory SET quantity=quantity-? WHERE id=? AND user_id=? AND quantity>=?').run(qty,Number(id),String(userId),qty);
    if(!changed.changes)throw new Error('missing');
    addCardDust(userId,total);
    db.prepare('INSERT INTO guild_merchant_sales(user_id,asset_type,asset_key,quantity,dust_paid,unit_price) VALUES(?,?,?,?,?,?)').run(String(userId),'consumable',item.item_key,qty,total,unit);
    return {ok:true,total,qty,unit,item,balance:getCardDust(userId)};
  })();}catch(e){return {ok:false,reason:e.message};}
}

function buyMaterial(userId,key,quantity=1){
  const date=moscowDateKey();
  const row=db.prepare('SELECT * FROM guild_merchant_stock WHERE stock_date=? AND material_key=? AND quantity>=?').get(date,key,quantity);
  if(!row)return {ok:false,reason:'stock'};
  const total=row.unit_price*quantity;
  if(getCardDust(userId)<total)return {ok:false,reason:'dust',total,balance:getCardDust(userId)};
  const tx=db.transaction(()=>{
    if(!removeCardDust(userId,total))throw new Error('dust');
    const upd=db.prepare('UPDATE guild_merchant_stock SET quantity=quantity-? WHERE stock_date=? AND material_key=? AND quantity>=?').run(quantity,date,key,quantity);
    if(!upd.changes)throw new Error('stock');
    grantResource(userId,key,quantity,'guild_merchant_purchase');
  });
  try{tx();return {ok:true,total,quantity,balance:getCardDust(userId),meta:MATERIALS[key]||ITEMS[key]};}catch(e){return {ok:false,reason:e.message};}
}

function companionBuyPrice(row){const rarity=row?.transfer?.rarity||row?.rarity||'common';const base={common:180,rare:500,epic:1300,legendary:3300,mythic:7200,exclusive:11000}[rarity]||180;return Math.round(base*(row?.transfer?.kind==='mount'?1.25:1));}
function sellableCompanionRows(userId){return sellableCompanions(userId).map(x=>({...x,unitPrice:companionBuyPrice(x)}));}
function sellCompanion(userId,id){const row=sellableCompanionRows(userId).find(x=>Number(x.id)===Number(id));if(!row)return {ok:false,reason:'missing'};const total=row.unitPrice;try{return db.transaction(()=>{const data=takeCompanionForTransfer(userId,id);if(!data)throw new Error('missing');addCardDust(userId,total);db.prepare('INSERT INTO guild_merchant_sales(user_id,asset_type,asset_key,quantity,dust_paid,unit_price) VALUES(?,?,?,?,?,?)').run(userId,data.kind,data.key,1,total,total);return {ok:true,total,item:data,balance:getCardDust(userId)};})();}catch(e){return {ok:false,reason:e.message};}}

function marketSummary(){
  const counts=professionPopulation();
  const sorted=Object.entries(PROFESSION_KEYS).map(([key])=>({key,count:Number(counts[key]||0)})).sort((a,b)=>a.count-b.count);
  return {counts,scarce:sorted[0],abundant:sorted.at(-1)};
}
module.exports={materialBuyPrice,equipmentBuyPrice,consumableBuyPrice,companionBuyPrice,sellableMaterials,sellableEquipment,sellableConsumables,sellableCompanionRows,sellMaterial,sellEquipment,sellConsumable,sellCompanion,saleStock,buyMaterial,marketSummary,professionForMaterial};
