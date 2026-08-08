'use strict';
const { db, addCardDust } = require('../../database/db');
const { grantItem } = require('./itemService');
const { grantResource, consumeResources, normalizeResourceKey, resourceMeta } = require('./resourceService');

const TOOL_TIERS = Object.freeze([
  {tier:1,level:1,key:'simple',qty:0,rare:0,cost:{board:4,iron_ingot:2}},
  {tier:2,level:4,key:'reinforced',qty:1,rare:2,cost:{board:8,iron_ingot:6}},
  {tier:3,level:8,key:'steel',qty:1,rare:5,cost:{board:12,iron_ingot:12,leather:4}},
  {tier:4,level:15,key:'runic',qty:2,rare:8,cost:{ancient_wood:6,crystal:5,gemstone:3}},
  {tier:5,level:25,key:'legendary',qty:3,rare:12,cost:{ancient_wood:12,void_crystal:3,gemstone:8}},
]);

const TOOL_NAMES = Object.freeze({
  herbalist: {
    noun: 'серп',
    tiers: ['Простой серп', 'Усиленный серп', 'Стальной серп', 'Рунический серп', 'Легендарный серп'],
  },
  miner: {
    noun: 'кирка',
    tiers: ['Простая кирка', 'Усиленная кирка', 'Стальная кирка', 'Руническая кирка', 'Легендарная кирка'],
  },
  lumberjack: {
    noun: 'топор',
    tiers: ['Простой топор', 'Усиленный топор', 'Стальной топор', 'Рунический топор', 'Легендарный топор'],
  },
  fisher: {
    noun: 'удочка',
    tiers: ['Простая удочка', 'Усиленная удочка', 'Стальная удочка', 'Руническая удочка', 'Легендарная удочка'],
  },
  hunter: {
    noun: 'охотничье снаряжение',
    tiers: ['Простое охотничье снаряжение', 'Усиленное охотничье снаряжение', 'Стальное охотничье снаряжение', 'Руническое охотничье снаряжение', 'Легендарное охотничье снаряжение'],
  },
});

function ensure(){db.exec(`
CREATE TABLE IF NOT EXISTS hero_profession_tools(user_id TEXT PRIMARY KEY,profession_key TEXT NOT NULL,tier INTEGER NOT NULL DEFAULT 1,crafted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS hero_artifact_equipment(user_id TEXT NOT NULL,slot_no INTEGER NOT NULL CHECK(slot_no BETWEEN 1 AND 2),inventory_id INTEGER NOT NULL,equipped_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(user_id,slot_no),UNIQUE(user_id,inventory_id));
CREATE TABLE IF NOT EXISTS player_correction_migrations(key TEXT PRIMARY KEY,details_json TEXT,applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS item_gift_log(id INTEGER PRIMARY KEY AUTOINCREMENT,from_user_id TEXT NOT NULL,to_user_id TEXT NOT NULL,asset_type TEXT NOT NULL,asset_key TEXT NOT NULL,quantity INTEGER NOT NULL,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
`);}
function migration(key,fn){ensure();if(db.prepare('SELECT 1 FROM player_correction_migrations WHERE key=?').get(key))return false;db.transaction(()=>{fn();db.prepare('INSERT INTO player_correction_migrations(key,details_json) VALUES(?,?)').run(key,'{}');})();return true;}
function applyTargetedCorrections(){
 migration('v19.6.9:denis-treasure-maps-2',()=>grantItem('230011067080769538','treasure_map',2,'player_correction_v19.6.9'));
 migration('v19.6.9:necromancer-level-5',()=>{
   db.prepare(`INSERT INTO hero_class_progress(user_id,class_key,level,xp,expeditions_completed) VALUES('1080729129915256843','necromancer',5,0,0)
   ON CONFLICT(user_id,class_key) DO UPDATE SET level=MAX(level,5),xp=CASE WHEN level<5 THEN 0 ELSE xp END,updated_at=CURRENT_TIMESTAMP`).run();
   const h=db.prepare('SELECT class_key FROM heroes WHERE user_id=?').get('1080729129915256843');
   if(h?.class_key==='necromancer'||h?.class_key==='warlock')db.prepare('UPDATE heroes SET level=MAX(level,5),xp=CASE WHEN level<5 THEN 0 ELSE xp END WHERE user_id=?').run('1080729129915256843');
 });
 // Remove phantom caravan bear only when it exists both as companion and stale inventory copy.
 migration('v19.6.9:bear-duplicate-audit-759026090038657034',()=>{
   const uid='759026090038657034';
   const bears=db.prepare("SELECT * FROM hero_companions WHERE user_id=? AND lower(name) LIKE '%медвед%'").all(uid);
   for(const b of bears){
     const stale=db.prepare('SELECT id,quantity FROM hero_inventory WHERE user_id=? AND item_key=?').get(uid,b.companion_key);
     if(stale) db.prepare('DELETE FROM hero_inventory WHERE id=?').run(stale.id);
   }
 });
}
function getTool(userId){ensure();return db.prepare('SELECT * FROM hero_profession_tools WHERE user_id=?').get(String(userId))||null;}
function toolInfo(userId,profession){
  const row=getTool(userId);
  const tier=row&&row.profession_key===profession?Number(row.tier):0;
  const def=TOOL_TIERS.find(x=>x.tier===tier)||null;
  const naming=TOOL_NAMES[profession]||{noun:'инструмент',tiers:[]};
  return {
    tier,
    def,
    name:naming.noun,
    fullName:tier>0?(naming.tiers[tier-1]||naming.noun):naming.noun,
    nextFullName:naming.tiers[tier]||null,
  };
}
function craftTool(userId){ensure();const prof=db.prepare('SELECT * FROM hero_professions WHERE user_id=?').get(String(userId));if(!prof)return {ok:false,reason:'profession'};const current=getTool(userId);const nextTier=(current&&current.profession_key===prof.profession_key?Number(current.tier):0)+1;const def=TOOL_TIERS.find(x=>x.tier===nextTier);if(!def)return {ok:false,reason:'max'};if(Number(prof.level)<def.level)return {ok:false,reason:'level',required:def.level};const result=consumeResources(userId,def.cost);if(!result.ok)return {ok:false,reason:'materials',missing:result.missing};db.prepare(`INSERT INTO hero_profession_tools(user_id,profession_key,tier) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET profession_key=excluded.profession_key,tier=excluded.tier,updated_at=CURRENT_TIMESTAMP`).run(String(userId),prof.profession_key,nextTier);return {ok:true,tool:toolInfo(userId,prof.profession_key),cost:def.cost};}
function dismantle(userId,inventoryId){
 ensure();
 const item=db.prepare(`SELECT hi.*,i.name,i.rarity,i.slot,i.item_type FROM hero_inventory hi JOIN hero_items i ON i.item_key=hi.item_key WHERE hi.user_id=? AND hi.id=?`).get(String(userId),Number(inventoryId));
 if(!item||!item.slot)return {ok:false,reason:'item'};
 let equipped=false;
 try{equipped=!!db.prepare(`SELECT 1 FROM hero_equipment WHERE user_id=? AND inventory_id=? UNION SELECT 1 FROM hero_class_equipment WHERE user_id=? AND inventory_id=? UNION SELECT 1 FROM hero_artifact_equipment WHERE user_id=? AND inventory_id=? LIMIT 1`).get(String(userId),item.id,String(userId),item.id,String(userId),item.id);}catch(_){equipped=!!db.prepare('SELECT 1 FROM hero_equipment WHERE user_id=? AND inventory_id=? UNION SELECT 1 FROM hero_class_equipment WHERE user_id=? AND inventory_id=? LIMIT 1').get(String(userId),item.id,String(userId),item.id);}
 if(equipped&&Number(item.quantity)<=1)return {ok:false,reason:'equipped'};
 const name=String(item.name||'').toLowerCase();
 let key=/сапог|перчат|кож|ботин/.test(name)?'leather':/лук|арбалет/.test(name)?'board':/кольц|амулет|ожерел|обруч/.test(name)?'gemstone':/посох|жезл|книга|гримуар/.test(name)?'crystal':'iron_ingot';
 const desired={common:2,rare:3,epic:5,legendary:8,mythic:12,exclusive:16}[item.rarity]||2;
 // hero_inventory stores identical copies in one row.  upgrade_level belongs to the
 // upgraded/equipped copy, not to a fresh duplicate that later dropped into the same stack.
 // When there is more than one copy, dismantling consumes a free base (+0) copy first.
 // This closes the exploit where one +N item made every duplicate salvage as +N.
 const storedUpgrade=Math.max(0,Number(item.upgrade_level||0));
 const dismantledUpgrade=Number(item.quantity||0)>1 ? 0 : storedUpgrade;
 const materialValue=Math.max(1,Number(resourceMeta(key).value||1));
 // За основу берём фактическую цену покупки у Караванщика, если она известна.
 // Разбор никогда не возвращает материалов дороже 55% этой цены.
 let referencePrice=0;
 try{referencePrice=Number(db.prepare(`SELECT current_price FROM caravan_offers WHERE item_key=? AND purchased=1 ORDER BY id DESC LIMIT 1`).get(item.item_key)?.current_price||0);}catch(_){}
 if(!referencePrice) referencePrice={common:300,rare:700,epic:1500,legendary:3500,mythic:8000,exclusive:18000}[item.rarity]||300;
 const economicCap=Math.max(1,Math.floor(referencePrice*0.55/materialValue));
 const qty=Math.max(1,Math.min(desired+Math.floor(dismantledUpgrade/2),economicCap));
 db.transaction(()=>{
   if(Number(item.quantity)>1)db.prepare('UPDATE hero_inventory SET quantity=quantity-1 WHERE id=? AND user_id=?').run(item.id,String(userId));
   else db.prepare('DELETE FROM hero_inventory WHERE id=? AND user_id=?').run(item.id,String(userId));
   grantResource(userId,key,qty,'equipment_dismantle');
 })();
 return {ok:true,item:{...item,dismantled_upgrade_level:dismantledUpgrade},key,qty,name:resourceMeta(key).name,referencePrice,salvageValue:qty*materialValue};
}
function giftMaterial(from,to,key,qty){key=normalizeResourceKey(key);qty=Math.max(1,Math.floor(Number(qty)||0));const r=consumeResources(from,{[key]:qty});if(!r.ok)return {ok:false,reason:'materials'};grantResource(to,key,qty,'gift');db.prepare('INSERT INTO item_gift_log(from_user_id,to_user_id,asset_type,asset_key,quantity) VALUES(?,?,?,?,?)').run(String(from),String(to),'material',key,qty);return {ok:true,key,qty,name:resourceMeta(key).name};}
function giftItem(from,to,inventoryId,qty=1){
 const fromId=String(from),toId=String(to),id=Number(inventoryId);
 if(fromId===toId)return {ok:false,reason:'self'};
 try{
  return db.transaction(()=>{
   const row=db.prepare(`SELECT hi.*,i.name,i.slot,i.item_type FROM hero_inventory hi JOIN hero_items i ON i.item_key=hi.item_key WHERE hi.user_id=? AND hi.id=?`).get(fromId,id);
   if(!row)throw Object.assign(new Error('item'),{code:'item'});
   const available=Math.max(0,Number(row.quantity)||0);
   const amount=Math.floor(Number(qty)||0);
   if(amount<1||amount>available)throw Object.assign(new Error('quantity'),{code:'quantity',available});

   if(amount===available){
    db.prepare('DELETE FROM hero_equipment WHERE user_id=? AND inventory_id=?').run(fromId,row.id);
    db.prepare('DELETE FROM hero_class_equipment WHERE user_id=? AND inventory_id=?').run(fromId,row.id);
    db.prepare('DELETE FROM hero_artifact_equipment WHERE user_id=? AND inventory_id=?').run(fromId,row.id);
    const removed=db.prepare('DELETE FROM hero_inventory WHERE id=? AND user_id=? AND quantity=?').run(row.id,fromId,available);
    if(removed.changes!==1)throw Object.assign(new Error('concurrent'),{code:'concurrent'});
   }else{
    const changed=db.prepare('UPDATE hero_inventory SET quantity=quantity-? WHERE id=? AND user_id=? AND quantity>=?').run(amount,row.id,fromId,amount);
    if(changed.changes!==1)throw Object.assign(new Error('concurrent'),{code:'concurrent'});
   }

   const before=Number(db.prepare('SELECT quantity FROM hero_inventory WHERE user_id=? AND item_key=?').get(toId,row.item_key)?.quantity||0);
   const granted=grantItem(toId,row.item_key,amount,'gift');
   if(!granted)throw Object.assign(new Error('grant'),{code:'grant'});
   const after=Number(db.prepare('SELECT quantity FROM hero_inventory WHERE user_id=? AND item_key=?').get(toId,row.item_key)?.quantity||0);
   if(after-before!==amount)throw Object.assign(new Error('verify'),{code:'verify'});
   if(Number(row.upgrade_level||0)>0)db.prepare('UPDATE hero_inventory SET upgrade_level=MAX(COALESCE(upgrade_level,0),?) WHERE user_id=? AND item_key=?').run(Number(row.upgrade_level),toId,row.item_key);
   db.prepare('INSERT INTO item_gift_log(from_user_id,to_user_id,asset_type,asset_key,quantity) VALUES(?,?,?,?,?)').run(fromId,toId,row.item_type==='artifact'?'artifact':'item',row.item_key,amount);
   return {ok:true,row,qty:amount,remaining:available-amount};
  })();
 }catch(e){return {ok:false,reason:e?.code||e?.message||'transaction',available:e?.available};}
}
function equipArtifact(userId,inventoryId,slot=1){ensure();const row=db.prepare(`SELECT hi.id,i.name,i.item_type FROM hero_inventory hi JOIN hero_items i ON i.item_key=hi.item_key WHERE hi.user_id=? AND hi.id=?`).get(String(userId),Number(inventoryId));if(!row||row.item_type!=='artifact')return {ok:false,reason:'item'};slot=Math.max(1,Math.min(2,Number(slot)||1));db.prepare(`INSERT INTO hero_artifact_equipment(user_id,slot_no,inventory_id) VALUES(?,?,?) ON CONFLICT(user_id,slot_no) DO UPDATE SET inventory_id=excluded.inventory_id,equipped_at=CURRENT_TIMESTAMP`).run(String(userId),slot,row.id);return {ok:true,row,slot};}
function unequipArtifact(userId,slot){ensure();return {ok:db.prepare('DELETE FROM hero_artifact_equipment WHERE user_id=? AND slot_no=?').run(String(userId),Number(slot)).changes>0};}
ensure();applyTargetedCorrections();
module.exports={TOOL_TIERS,TOOL_NAMES,getTool,toolInfo,craftTool,dismantle,giftMaterial,giftItem,equipArtifact,unequipArtifact,applyTargetedCorrections};
