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
function sellableEquipmentCount(userId,item){
 // Любой принадлежащий игроку экземпляр можно продать или обменять.
 // Если продаётся единственный надетый экземпляр, система автоматически снимает его
 // из основного и классовых комплектов перед резервированием.
 return Math.max(0,Number(item?.quantity)||0);
}
function duplicateEquipment(userId){
 return getInventory(userId,{limit:200})
  .filter(x=>x.slot || x.item_type==='artifact')
  .map(x=>({...x,sellable:sellableEquipmentCount(userId,x)}))
  .filter(x=>x.sellable>0);
}
function unequipInventoryItem(userId,inventoryId){
 db.prepare('DELETE FROM hero_equipment WHERE user_id=? AND inventory_id=?').run(String(userId),Number(inventoryId));
 db.prepare('DELETE FROM hero_class_equipment WHERE user_id=? AND inventory_id=?').run(String(userId),Number(inventoryId));
 db.prepare('DELETE FROM hero_artifact_equipment WHERE user_id=? AND inventory_id=?').run(String(userId),Number(inventoryId));
}
function removeOne(userId,item){
 if(Number(item.quantity)<=1){
  unequipInventoryItem(userId,item.id);
  db.prepare('DELETE FROM hero_inventory WHERE id=? AND user_id=?').run(item.id,userId);
 } else db.prepare('UPDATE hero_inventory SET quantity=quantity-1 WHERE id=? AND user_id=?').run(item.id,userId);
}
function sellToBlacksmith(userId,inventoryId){
 const item=getInventoryItem(userId,inventoryId); if(!item||(!item.slot&&item.item_type!=='artifact'))return {ok:false,reason:'not_found'};
 if(sellableEquipmentCount(userId,item)<1)return {ok:false,reason:'missing'};
 const earned=(BLACKSMITH_PRICES[item.rarity]||20)+Number(item.upgrade_level||0)*15;
 const tx=db.transaction(()=>{removeOne(userId,item);addCardDust(userId,earned);}); tx();
 return {ok:true,item,earned,balance:getCardDust(userId)};
}
function createListing(userId,inventoryId,price){
 price=Math.floor(Number(price)); if(price<1||price>10000000)return {ok:false,reason:'price'};
 const item=getInventoryItem(userId,inventoryId); if(!item||(!item.slot&&item.item_type!=='artifact'))return {ok:false,reason:'not_found'};
 if(sellableEquipmentCount(userId,item)<1)return {ok:false,reason:'missing'};
 let id; const tx=db.transaction(()=>{removeOne(userId,item);id=db.prepare(`INSERT INTO equipment_market_listings(seller_id,item_key,item_name,rarity,upgrade_level,quantity,price) VALUES(?,?,?,?,?,1,?)`).run(userId,item.item_key,item.name,item.rarity,Number(item.upgrade_level||0),price).lastInsertRowid;}); tx();
 return {ok:true,listing:getListing(id)};
}
const LISTING_SELECT=`SELECT l.*,i.item_type,i.slot,i.description,i.lore,i.bonuses_json
 FROM equipment_market_listings l LEFT JOIN hero_items i ON i.item_key=l.item_key`;
function getListing(id){return db.prepare(`${LISTING_SELECT} WHERE l.id=?`).get(id)||null;}
function listOpen(limit=25){return db.prepare(`${LISTING_SELECT} WHERE l.status='open' ORDER BY l.id DESC LIMIT ?`).all(limit);}
function listMine(userId,limit=25){return db.prepare(`${LISTING_SELECT} WHERE l.seller_id=? ORDER BY l.id DESC LIMIT ?`).all(userId,limit);}
function buyListing(userId,id){
 userId=String(userId); id=Number(id);
 try{
  const result=db.transaction(()=>{
   const l=db.prepare("SELECT * FROM equipment_market_listings WHERE id=? AND status='open'").get(id);
   if(!l)throw Object.assign(new Error('closed'),{code:'closed'});
   if(String(l.seller_id)===userId)throw Object.assign(new Error('self'),{code:'self'});
   const price=Math.max(1,Number(l.price)||0);
   const balance=getCardDust(userId);
   if(balance<price)throw Object.assign(new Error('dust'),{code:'dust',balance,price});

   // Сначала атомарно закрываем лот. Если его уже успел купить другой игрок,
   // вся операция откатывается без списаний и потери предмета.
   const claimed=db.prepare("UPDATE equipment_market_listings SET status='sold',buyer_id=?,closed_at=CURRENT_TIMESTAMP WHERE id=? AND status='open'").run(userId,id);
   if(claimed.changes!==1)throw Object.assign(new Error('closed'),{code:'closed'});

   const payment=removeCardDust(userId,price,`Покупка на рынке: ${l.item_name}`);
   if(!payment?.ok)throw Object.assign(new Error('dust'),{code:'dust',balance:payment?.balance||0,price});
   addCardDust(String(l.seller_id),price,`Продажа на рынке: ${l.item_name}`);
   const granted=grantItem(userId,l.item_key,1,'equipment_market_purchase');
   if(!granted)throw Object.assign(new Error('grant'),{code:'grant'});
   if(Number(l.upgrade_level)>0){
    db.prepare('UPDATE hero_inventory SET upgrade_level=MAX(COALESCE(upgrade_level,0),?) WHERE user_id=? AND item_key=?')
      .run(Number(l.upgrade_level),userId,l.item_key);
   }
   return {...l,status:'sold',buyer_id:userId};
  })();
  return {ok:true,listing:result,balance:getCardDust(userId)};
 }catch(e){
  const reason=e?.code||e?.message||'transaction';
  return {ok:false,reason,balance:e?.balance,price:e?.price};
 }
}
function cancelListing(userId,id){
 userId=String(userId); id=Number(id);
 try{
  const result=db.transaction(()=>{
   const l=db.prepare("SELECT * FROM equipment_market_listings WHERE id=? AND seller_id=? AND status='open'").get(id,userId);
   if(!l)throw Object.assign(new Error('missing'),{code:'missing'});
   const claimed=db.prepare("UPDATE equipment_market_listings SET status='cancelled',closed_at=CURRENT_TIMESTAMP WHERE id=? AND seller_id=? AND status='open'").run(id,userId);
   if(claimed.changes!==1)throw Object.assign(new Error('missing'),{code:'missing'});
   const granted=grantItem(userId,l.item_key,1,'equipment_market_cancel');
   if(!granted)throw Object.assign(new Error('grant'),{code:'grant'});
   if(Number(l.upgrade_level)>0)db.prepare('UPDATE hero_inventory SET upgrade_level=MAX(COALESCE(upgrade_level,0),?) WHERE user_id=? AND item_key=?').run(Number(l.upgrade_level),userId,l.item_key);
   return l;
  })();
  return {ok:true,listing:{...result,status:'cancelled'}};
 }catch(e){return {ok:false,reason:e?.code||e?.message||'transaction'};}
}
module.exports={duplicateEquipment,sellToBlacksmith,createListing,getListing,listOpen,listMine,buyListing,cancelListing};
