const { db, getCardDust, addCardDust, removeCardDust } = require('../../database/db');
const { ITEMS } = require('./itemData');
const { addProfessionXp } = require('./professionService');

db.exec(`
CREATE TABLE IF NOT EXISTS guild_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  buyer_id TEXT NOT NULL,
  item_key TEXT NOT NULL,
  quantity_total INTEGER NOT NULL,
  quantity_remaining INTEGER NOT NULL,
  price_each INTEGER NOT NULL,
  dust_reserved INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT
);
CREATE TABLE IF NOT EXISTS guild_order_fulfillments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  seller_id TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  dust_paid INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_guild_orders_status ON guild_orders(status, id DESC);
CREATE INDEX IF NOT EXISTS idx_guild_orders_buyer ON guild_orders(buyer_id, id DESC);
`);

function materialKeys(){
  return Object.entries(ITEMS).filter(([,v])=>v.type==='material').map(([k])=>k);
}
function getMaterial(userId,itemKey){
  return db.prepare(`SELECT hi.*,i.name,i.item_type FROM hero_inventory hi JOIN hero_items i ON i.item_key=hi.item_key
    WHERE hi.user_id=? AND hi.item_key=? AND i.item_type='material'`).get(userId,itemKey)||null;
}
function removeMaterial(userId,itemKey,quantity){
  const row=getMaterial(userId,itemKey);
  if(!row || Number(row.quantity)<quantity)return false;
  if(Number(row.quantity)===quantity) db.prepare('DELETE FROM hero_inventory WHERE id=?').run(row.id);
  else db.prepare('UPDATE hero_inventory SET quantity=quantity-? WHERE id=?').run(quantity,row.id);
  return true;
}
function addMaterial(userId,itemKey,quantity){
  db.prepare(`INSERT INTO hero_inventory(user_id,item_key,quantity,acquired_from) VALUES(?,?,?,'order')
    ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=quantity+excluded.quantity,acquired_from='order'`).run(userId,itemKey,quantity);
}
function createOrder(buyerId,itemKey,quantity,priceEach){
  quantity=Math.floor(Number(quantity)); priceEach=Math.floor(Number(priceEach));
  if(!ITEMS[itemKey] || ITEMS[itemKey].type!=='material')return {ok:false,reason:'item'};
  if(quantity<1 || quantity>10000)return {ok:false,reason:'quantity'};
  if(priceEach<1 || priceEach>1000000)return {ok:false,reason:'price'};
  const total=quantity*priceEach;
  if(getCardDust(buyerId)<total)return {ok:false,reason:'dust',total};
  if(!removeCardDust(buyerId,total))return {ok:false,reason:'dust',total};
  const r=db.prepare(`INSERT INTO guild_orders(buyer_id,item_key,quantity_total,quantity_remaining,price_each,dust_reserved)
    VALUES(?,?,?,?,?,?)`).run(buyerId,itemKey,quantity,quantity,priceEach,total);
  return {ok:true,order:getOrder(r.lastInsertRowid)};
}
function getOrder(id){return db.prepare('SELECT * FROM guild_orders WHERE id=?').get(id)||null;}
function listOpenOrders(limit=25,itemKey=null){
  if(itemKey)return db.prepare(`SELECT * FROM guild_orders WHERE status='open' AND item_key=? ORDER BY price_each DESC,id ASC LIMIT ?`).all(itemKey,limit);
  return db.prepare(`SELECT * FROM guild_orders WHERE status='open' ORDER BY id DESC LIMIT ?`).all(limit);
}
function listMyOrders(userId,limit=25){return db.prepare('SELECT * FROM guild_orders WHERE buyer_id=? ORDER BY id DESC LIMIT ?').all(userId,limit);}
function fulfillOrder(orderId,sellerId,quantity){
  quantity=Math.floor(Number(quantity));
  const order=getOrder(orderId);
  if(!order || order.status!=='open')return {ok:false,reason:'closed'};
  if(order.buyer_id===sellerId)return {ok:false,reason:'self'};
  if(quantity<1)return {ok:false,reason:'quantity'};
  quantity=Math.min(quantity,Number(order.quantity_remaining));
  const material=getMaterial(sellerId,order.item_key);
  if(!material || Number(material.quantity)<quantity)return {ok:false,reason:'materials',available:Number(material?.quantity||0)};
  const pay=quantity*Number(order.price_each);
  const tx=db.transaction(()=>{
    if(!removeMaterial(sellerId,order.item_key,quantity))throw new Error('materials');
    addMaterial(order.buyer_id,order.item_key,quantity);
    addCardDust(sellerId,pay);
    const remaining=Number(order.quantity_remaining)-quantity;
    const reserved=Number(order.dust_reserved)-pay;
    db.prepare(`UPDATE guild_orders SET quantity_remaining=?,dust_reserved=?,status=?,closed_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`)
      .run(remaining,reserved,remaining===0?'completed':'open',remaining===0?new Date().toISOString():null,order.id);
    db.prepare('INSERT INTO guild_order_fulfillments(order_id,seller_id,quantity,dust_paid) VALUES(?,?,?,?)').run(order.id,sellerId,quantity,pay);
  });
  try{tx();}catch(e){return {ok:false,reason:'transaction'};}
  addProfessionXp(sellerId,Math.max(10,Math.floor(quantity/2)),{orders:1,dust:pay});
  return {ok:true,quantity,pay,remaining:Number(order.quantity_remaining)-quantity,order:getOrder(order.id)};
}
function cancelOrder(orderId,buyerId){
  const order=getOrder(orderId);
  if(!order || order.buyer_id!==buyerId)return {ok:false,reason:'missing'};
  if(order.status!=='open')return {ok:false,reason:'closed'};
  const refund=Number(order.dust_reserved);
  const tx=db.transaction(()=>{
    if(refund>0)addCardDust(buyerId,refund);
    db.prepare(`UPDATE guild_orders SET status='cancelled',dust_reserved=0,closed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(order.id);
  });
  tx();
  return {ok:true,refund};
}
function stats(){
  return db.prepare(`SELECT
    SUM(CASE WHEN status='open' THEN 1 ELSE 0 END) open_orders,
    SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) completed_orders,
    COALESCE(SUM(CASE WHEN status='open' THEN dust_reserved ELSE 0 END),0) reserved_dust
    FROM guild_orders`).get();
}
module.exports={materialKeys,getMaterial,createOrder,getOrder,listOpenOrders,listMyOrders,fulfillOrder,cancelOrder,stats};
