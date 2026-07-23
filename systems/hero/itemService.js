const { db } = require('../../database/db');
const { ITEMS, RARITY_ORDER } = require('./itemData');

const STAT_KEYS=['hp','strength','defense','dexterity','intelligence','luck','expedition_success','rare_find','world_boss_damage','world_boss_resistance','boss_flat_damage'];
function parseBonuses(value){ try{return JSON.parse(value||'{}')||{};}catch(_){return {};} }
function seedItems(){
 const stmt=db.prepare(`INSERT INTO hero_items (item_key,name,item_type,rarity,description,slot,bonuses_json,lore,is_consumable)
 VALUES (@key,@name,@type,@rarity,@description,@slot,@bonuses,@lore,@consumable)
 ON CONFLICT(item_key) DO UPDATE SET name=excluded.name,item_type=excluded.item_type,rarity=excluded.rarity,description=excluded.description,slot=excluded.slot,bonuses_json=excluded.bonuses_json,lore=excluded.lore,is_consumable=excluded.is_consumable`);
 const tx=db.transaction(()=>{for(const [key,item] of Object.entries(ITEMS))stmt.run({key,name:item.name,type:item.type,rarity:item.rarity,description:item.description,slot:item.slot||null,bonuses:JSON.stringify(item.bonuses||{}),lore:item.lore||'',consumable:item.consumable?1:0});}); tx();
}
function grantItem(userId,itemKey,quantity=1,source='system'){
 seedItems(); const item=ITEMS[itemKey]; if(!item)return null;
 db.prepare(`INSERT INTO hero_inventory(user_id,item_key,quantity,acquired_from) VALUES(?,?,?,?)
 ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=quantity+excluded.quantity, acquired_from=excluded.acquired_from`).run(userId,itemKey,Math.max(1,quantity),source);
 db.prepare(`INSERT OR IGNORE INTO hero_item_collection(user_id,item_key,first_acquired_from) VALUES(?,?,?)`).run(userId,itemKey,source);
 return getInventoryItemByKey(userId,itemKey);
}
function getInventory(userId,{type=null,limit=100}={}){
 seedItems(); let sql=`SELECT hi.*,i.name,i.item_type,i.rarity,i.description,i.slot,i.bonuses_json,i.lore,i.is_consumable,
 CASE i.rarity WHEN 'exclusive' THEN 6 WHEN 'mythic' THEN 5 WHEN 'legendary' THEN 4 WHEN 'epic' THEN 3 WHEN 'rare' THEN 2 ELSE 1 END rarity_rank
 FROM hero_inventory hi JOIN hero_items i ON i.item_key=hi.item_key WHERE hi.user_id=?`;
 const params=[userId]; if(type){sql+=' AND i.item_type=?';params.push(type);} sql+=' ORDER BY rarity_rank DESC,i.name ASC LIMIT ?';params.push(limit); return db.prepare(sql).all(...params);
}
function getInventoryItem(userId,id){return db.prepare(`SELECT hi.*,i.name,i.item_type,i.rarity,i.description,i.slot,i.bonuses_json,i.lore,i.is_consumable FROM hero_inventory hi JOIN hero_items i ON i.item_key=hi.item_key WHERE hi.user_id=? AND hi.id=?`).get(userId,id)||null;}
function getInventoryItemByKey(userId,key){return db.prepare(`SELECT hi.*,i.name,i.item_type,i.rarity,i.description,i.slot,i.bonuses_json,i.lore,i.is_consumable FROM hero_inventory hi JOIN hero_items i ON i.item_key=hi.item_key WHERE hi.user_id=? AND hi.item_key=?`).get(userId,key)||null;}
function getEquipment(userId){return db.prepare(`SELECT he.slot,he.inventory_id,hi.item_key,i.name,i.item_type,i.rarity,i.description,i.bonuses_json,i.lore FROM hero_equipment he JOIN hero_inventory hi ON hi.id=he.inventory_id JOIN hero_items i ON i.item_key=hi.item_key WHERE he.user_id=?`).all(userId);}
function equipItem(userId,inventoryId){
 const item=getInventoryItem(userId,inventoryId); if(!item)return {ok:false,reason:'not_found'}; if(!item.slot)return {ok:false,reason:'not_equippable'};
 db.prepare(`INSERT INTO hero_equipment(user_id,slot,inventory_id) VALUES(?,?,?) ON CONFLICT(user_id,slot) DO UPDATE SET inventory_id=excluded.inventory_id,equipped_at=CURRENT_TIMESTAMP`).run(userId,item.slot,item.id);
 return {ok:true,item,slot:item.slot};
}
function unequipItem(userId,slot){const r=db.prepare('DELETE FROM hero_equipment WHERE user_id=? AND slot=?').run(userId,slot);return {ok:r.changes>0};}
function getEquipmentBonuses(userId){const total=Object.fromEntries(STAT_KEYS.map(k=>[k,0]));for(const item of getEquipment(userId)){const b=parseBonuses(item.bonuses_json);for(const k of STAT_KEYS)total[k]+=Number(b[k]||0);}try{const {getCompanionBonuses}=require('./companionService');const cb=getCompanionBonuses(userId);for(const k of STAT_KEYS)total[k]+=Number(cb[k]||0);}catch(_){}return total;}
function getEffectiveHero(hero){if(!hero)return null;const b=getEquipmentBonuses(hero.user_id);return {...hero,equipmentBonuses:b,max_hp:hero.max_hp+b.hp,hp:Math.min(hero.hp+b.hp,hero.max_hp+b.hp),strength:hero.strength+b.strength,defense:hero.defense+b.defense,dexterity:hero.dexterity+b.dexterity,intelligence:hero.intelligence+b.intelligence,luck:hero.luck+b.luck};}
function getCollection(userId){seedItems();const rows=db.prepare(`SELECT c.item_key,c.first_acquired_at,i.name,i.item_type,i.rarity FROM hero_item_collection c JOIN hero_items i ON i.item_key=c.item_key WHERE c.user_id=?`).all(userId);return {rows,found:rows.length,total:Object.keys(ITEMS).length};}
function formatBonuses(value){const b=typeof value==='string'?parseBonuses(value):value||{};const labels={hp:'❤️ HP',strength:'⚔️ Сила',defense:'🛡️ Защита',dexterity:'🏃 Ловкость',intelligence:'🧠 Интеллект',luck:'🍀 Удача',expedition_success:'🗺️ Успех экспедиции',rare_find:'✨ Шанс редкой добычи',world_boss_damage:'🐉 Урон по боссу',world_boss_resistance:'🛡️ Защита от босса',boss_flat_damage:'💣 Урон бомбы',heal:'🧪 Лечение'};return Object.entries(b).filter(([,v])=>v).map(([k,v])=>`${labels[k]||k}: +${v}${['expedition_success','rare_find','world_boss_damage','world_boss_resistance'].includes(k)?'%':''}`);}
seedItems();
module.exports={seedItems,grantItem,getInventory,getInventoryItem,getInventoryItemByKey,getEquipment,equipItem,unequipItem,getEquipmentBonuses,getEffectiveHero,getCollection,formatBonuses,parseBonuses};
