const { db, getCardDust, addCardDust, removeCardDust } = require('../../database/db');
const { getInventory, getInventoryItem, grantItem } = require('./itemService');

const BLACKSMITH_PRICES={common:25,rare:70,epic:180,legendary:450,mythic:1000,exclusive:1500};

db.exec(`
CREATE TABLE IF NOT EXISTS equipment_market_listings (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 seller_id TEXT NOT NULL,
 item_key TEXT NOT NULL,
 item_name TEXT NOT NULL,
 rarity TEXT NOT NULL,
 upgrade_level INTEGER NOT NULL DEFAULT 0,
 quantity INTEGER NOT NULL DEFAULT 1,
 price INTEGER NOT NULL,
 status TEXT NOT NULL DEFAULT 'open',
 buyer_id TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_equipment_market_open ON equipment_market_listings(status,id DESC);
CREATE INDEX IF NOT EXISTS idx_equipment_market_seller ON equipment_market_listings(seller_id,id DESC);
`);
function isEquipped(userId,inventoryId){
 return !!db.prepare(`SELECT 1 FROM hero_equipment WHERE user_id=? AND inventory_id=?
 UNION ALL SELECT 1 FROM hero_class_equipment WHERE user_id=? AND inventory_id=? LIMIT 1`).get(userId,inventoryId,userId,inventoryId);
}
function duplicateEquipment(userId){
 return getInventory(userId,{limit:200}).filter(x=>x.slot && !isEquipped(userId,x.id) && Number(x.quantity)>0).map(x=>({...x,sellable:Number(x.quantity)}));
}
function removeOne(userId,item){
 if(Number(item.quantity)<=1) db.prepare('DELETE FROM hero_inventory WHERE id=? AND user_id=?').run(item.id,userId);
 else db.prepare('UPDATE hero_inventory SET quantity=quantity-1 WHERE id=? AND user_id=?').run(item.id,userId);
}
function sellToBlacksmith(userId,inventoryId){
 const item=getInventoryItem(userId,inventoryId); if(!item||!item.slot)return {ok:false,reason:'not_found'};
 if(isEquipped(userId,inventoryId))return {ok:false,reason:'equipped'};
 const earned=(BLACKSMITH_PRICES[item.rarity]||20)+Number(item.upgrade_level||0)*15;
 const tx=db.transaction(()=>{removeOne(userId,item);addCardDust(userId,earned);}); tx();
 return {ok:true,item,earned,balance:getCardDust(userId)};
}
function createListing(userId,inventoryId,price){
 price=Math.floor(Number(price)); if(price<1||price>10000000)return {ok:false,reason:'price'};
 const item=getInventoryItem(userId,inventoryId); if(!item||!item.slot)return {ok:false,reason:'not_found'};
 if(isEquipped(userId,inventoryId))return {ok:false,reason:'equipped'};
 let id; const tx=db.transaction(()=>{removeOne(userId,item);id=db.prepare(`INSERT INTO equipment_market_listings(seller_id,item_key,item_name,rarity,upgrade_level,quantity,price) VALUES(?,?,?,?,?,1,?)`).run(userId,item.item_key,item.name,item.rarity,Number(item.upgrade_level||0),price).lastInsertRowid;}); tx();
 return {ok:true,listing:getListing(id)};
}
function getListing(id){return db.prepare('SELECT * FROM equipment_market_listings WHERE id=?').get(id)||null;}
function listOpen(limit=25){return db.prepare("SELECT * FROM equipment_market_listings WHERE status='open' ORDER BY id DESC LIMIT ?").all(limit);}
function listMine(userId,limit=25){return db.prepare('SELECT * FROM equipment_market_listings WHERE seller_id=? ORDER BY id DESC LIMIT ?').all(userId,limit);}
function buyListing(userId,id){
 const l=getListing(id); if(!l||l.status!=='open')return {ok:false,reason:'closed'}; if(l.seller_id===String(userId))return {ok:false,reason:'self'};
 if(getCardDust(userId)<Number(l.price))return {ok:false,reason:'dust',price:l.price};
 const tx=db.transaction(()=>{if(!removeCardDust(userId,Number(l.price)))throw new Error('dust');addCardDust(l.seller_id,Number(l.price));grantItem(userId,l.item_key,1,'equipment_market');if(Number(l.upgrade_level)>0)db.prepare('UPDATE hero_inventory SET upgrade_level=MAX(upgrade_level,?) WHERE user_id=? AND item_key=?').run(Number(l.upgrade_level),userId,l.item_key);db.prepare("UPDATE equipment_market_listings SET status='sold',buyer_id=?,closed_at=CURRENT_TIMESTAMP WHERE id=? AND status='open'").run(userId,id);});
 try{tx();}catch(e){return {ok:false,reason:'transaction'};} return {ok:true,listing:getListing(id)};
}
function cancelListing(userId,id){
 const l=getListing(id); if(!l||l.seller_id!==String(userId)||l.status!=='open')return {ok:false,reason:'missing'};
 const tx=db.transaction(()=>{grantItem(userId,l.item_key,1,'equipment_market_cancel');if(Number(l.upgrade_level)>0)db.prepare('UPDATE hero_inventory SET upgrade_level=MAX(upgrade_level,?) WHERE user_id=? AND item_key=?').run(Number(l.upgrade_level),userId,l.item_key);db.prepare("UPDATE equipment_market_listings SET status='cancelled',closed_at=CURRENT_TIMESTAMP WHERE id=?").run(id);});tx();return {ok:true,listing:getListing(id)};
}
module.exports={duplicateEquipment,sellToBlacksmith,createListing,listOpen,listMine,buyListing,cancelListing};
