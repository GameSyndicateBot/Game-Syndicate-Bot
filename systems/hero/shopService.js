const { db, getCardDust, removeCardDust, addCardDust }=require('../../database/db');
const { ITEMS }=require('./itemData');
const { grantItem, getInventoryItem }=require('./itemService');
const { COMPANIONS }=require('./companionData');
const { grantCompanion }=require('./companionService');
const SHOP_POOL=[
 ['healing_potion_small',90],['healing_potion_large',180],['forest_herbs',70],['iron_ore',85],['lockpick_set',130],['treasure_map',320],
 ['iron_axe',430],['chainmail',480],['iron_helm',390],['duelist_gloves',360],['mountain_boots',370],['sun_amulet',520],['ring_strength',500],
 ['shadow_dagger',1100],['paladin_plate',1250],['seer_crown',1050],['ring_fortune',1200],['alchemist_bomb',650]
];
const COMPANION_SHOP=[['gray_wolf',650],['white_eagle',1200],['shadow_fox',2400],['stone_golem',2600],['young_dragon',5000]];
function dayKey(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function seeded(seed){let h=2166136261;for(const ch of seed){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return()=>((h=Math.imul(h^h>>>15,2246822507)^Math.imul(h^h>>>13,3266489909))>>>0)/4294967296;}
function dailyStock(){const rnd=seeded(dayKey());const pool=[...SHOP_POOL].sort(()=>rnd()-.5).slice(0,6);const companion=COMPANION_SHOP[Math.floor(rnd()*COMPANION_SHOP.length)];return {date:dayKey(),items:pool.map(([key,price],i)=>({slot:i+1,key,price,item:ITEMS[key]})),companion:{slot:7,key:companion[0],price:companion[1],item:COMPANIONS[companion[0]]}};}
function buy(userId,slot){const stock=dailyStock();const offer=slot===7?stock.companion:stock.items.find(x=>x.slot===slot);if(!offer)return {ok:false,reason:'slot'};
 const bought=db.prepare('SELECT 1 FROM hero_shop_purchases WHERE user_id=? AND shop_date=? AND slot=?').get(userId,stock.date,slot);if(bought)return {ok:false,reason:'bought'};
 const payment=removeCardDust(userId,offer.price);if(!payment.ok)return {ok:false,reason:'dust',balance:payment.balance};
 try{if(slot===7)grantCompanion(userId,offer.key,'daily_shop');else grantItem(userId,offer.key,1,'daily_shop');db.prepare('INSERT INTO hero_shop_purchases(user_id,shop_date,slot,offer_key,price) VALUES(?,?,?,?,?)').run(userId,stock.date,slot,offer.key,offer.price);return {ok:true,offer,balance:payment.balance};}catch(e){addCardDust(userId,offer.price);throw e;}
}
function sell(userId,inventoryId,quantity=1){const item=getInventoryItem(userId,inventoryId);if(!item)return {ok:false,reason:'not_found'};quantity=Math.max(1,Math.min(quantity,item.quantity));
 const equipped=db.prepare('SELECT 1 FROM hero_equipment WHERE user_id=? AND inventory_id=?').get(userId,inventoryId);if(equipped)return {ok:false,reason:'equipped'};
 const base={common:25,rare:70,epic:180,legendary:450,mythic:1000,exclusive:1500}[item.rarity]||20;const earned=base*quantity;
 if(quantity>=item.quantity)db.prepare('DELETE FROM hero_inventory WHERE id=? AND user_id=?').run(inventoryId,userId);else db.prepare('UPDATE hero_inventory SET quantity=quantity-? WHERE id=? AND user_id=?').run(quantity,inventoryId,userId);
 const balance=addCardDust(userId,earned);return {ok:true,item,quantity,earned,balance};}
module.exports={dailyStock,buy,sell,getCardDust};
