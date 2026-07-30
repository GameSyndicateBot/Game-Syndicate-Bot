const crypto = require('crypto');
const { db, getCardDust, removeCardDust, addCardDust } = require('../../database/db');
const { MATERIALS } = require('./materialData');
const { getInventoryItem } = require('./itemService');
const { resourceRows, consumeResources } = require('./resourceService');

const MAX_UPGRADE = 10;
const CHANCES = Object.freeze({ 1:100, 2:100, 3:100, 4:100, 5:100, 6:80, 7:65, 8:50, 9:35, 10:20 });
const RARITY_MULTIPLIER = Object.freeze({ common:1, rare:1.35, epic:1.8, legendary:2.5, mythic:3.4, exclusive:4 });

function isUpgradeable(item) {
  return !!item?.slot && ['weapon','armor','helmet','gloves','boots','ring','amulet','backpack'].includes(item.item_type);
}
function classifyUpgradeGroup(item) {
  const text=`${item?.item_key||''} ${item?.name||''} ${item?.description||''}`.toLowerCase();
  const type=String(item?.item_type||'').toLowerCase();
  const slot=String(item?.slot||'').toLowerCase();
  if (/артефакт|реликв|artifact|relic/.test(text)) return 'artifact';
  if (type==='ring'||slot==='ring'||/кольц|перст|ring/.test(text)) return 'jewelry';
  if (type==='amulet'||slot==='amulet'||/амулет|ожерел|медальон|венец|корон|amulet|necklace|crown/.test(text)) return 'jewelry';
  if (/книга|гримуар|фолиант|book|grimoire/.test(text)) return 'magic_book';
  if (/посох|жезл|сфера|staff|wand|orb/.test(text)) return 'staff';
  if (/лук|арбалет|bow|crossbow/.test(text)) return 'ranged';
  if (/щит|shield/.test(text)) return /дерев|wood/.test(text)?'wood_shield':'metal';
  if (/кожан|кожа|шкур|капюш|leather|hide|hood/.test(text)) return 'leather';
  if (['armor','helmet','gloves','boots','weapon'].includes(type)||['chest','helmet','gloves','boots','melee','offhand'].includes(slot)) return 'metal';
  if (type==='backpack'||slot==='backpack') return 'leather';
  return 'metal';
}
const MATERIAL_SCALE=Object.freeze({1:2,2:3,3:5,4:7,5:10,6:14,7:18,8:24,9:32,10:40});
const RARE_SCALE=Object.freeze({1:0,2:0,3:0,4:1,5:2,6:3,7:4,8:5,9:7,10:10});
const SPECIAL_SCALE=Object.freeze({1:0,2:0,3:0,4:0,5:0,6:0,7:0,8:1,9:2,10:3});
function getUpgradeCost(item, targetLevel) {
  const rarity = RARITY_MULTIPLIER[item.rarity] || 1;
  const dust = Math.round((110 + targetLevel * targetLevel * 42) * rarity / 5) * 5;
  const base=MATERIAL_SCALE[targetLevel]||40, rare=RARE_SCALE[targetLevel]||0, special=SPECIAL_SCALE[targetLevel]||0;
  const group=classifyUpgradeGroup(item), materials={};
  const add=(key,qty)=>{if(qty>0)materials[key]=(materials[key]||0)+Math.max(1,Math.ceil(qty));};
  if(group==='metal') { add('iron_ingot',base); add('gemstone',rare); add('ancient_fragment',special); }
  else if(group==='leather') { add('beast_hide',base); add('gemstone',rare); add('ancient_fragment',special); }
  else if(group==='ranged') { add('board',base); add('ancient_wood',rare); add('gemstone',special); }
  else if(group==='wood_shield') { add('board',base); add(targetLevel>=8?'ancient_wood':'iron_ingot',rare); add('gemstone',special); }
  else if(group==='staff') { add(targetLevel<=3?'board':targetLevel<=7?'crystal':'crystal',base); add(targetLevel<=7?'gemstone':'void_crystal',rare); add('void_crystal',special); }
  else if(group==='magic_book') { add(targetLevel<=3?'gemstone':'crystal',base); add(targetLevel<=7?'crystal':'void_crystal',rare); add('void_crystal',special); }
  else if(group==='jewelry') { add('gemstone',base); add('pearl',rare); add('void_crystal',special); }
  else if(group==='artifact') { add(targetLevel<=3?'gemstone':targetLevel<=7?'ancient_fragment':'void_crystal',base); add('ancient_fragment',rare); add('void_crystal',special); }
  return { dust, materials, group };
}
function materialRows(userId, requirements) { return resourceRows(userId, requirements); }
function getUpgradeInfo(userId, inventoryId) {
  const item = getInventoryItem(userId, inventoryId);
  if (!item) return { ok:false, reason:'not_found' };
  if (!isUpgradeable(item)) return { ok:false, reason:'not_upgradeable', item };
  const level = Math.max(0, Number(item.upgrade_level)||0);
  if (level >= MAX_UPGRADE) return { ok:true, maxed:true, item, level, maxLevel:MAX_UPGRADE };
  const targetLevel = level + 1;
  const cost = getUpgradeCost(item,targetLevel);
  const materials = materialRows(userId,cost.materials);
  const dust = getCardDust(userId);
  const beforeMultiplier=1+level*0.08,afterMultiplier=1+targetLevel*0.08; const previewText=`множитель бонусов ×${beforeMultiplier.toFixed(2)} → ×${afterMultiplier.toFixed(2)} (+8% к базовым бонусам предмета)`; return { ok:true, item, level, targetLevel, chance:CHANCES[targetLevel], dust, previewText, cost:{...cost,materials}, canAfford:dust>=cost.dust && materials.every(m=>m.owned>=m.required) };
}
function secureRoll(userId, inventoryId, targetLevel) {
  const value = crypto.createHash('sha256').update(`${crypto.randomUUID()}:${Date.now()}:${userId}:${inventoryId}:${targetLevel}`).digest().readUInt32BE(0);
  return (value % 100) + 1;
}
function upgradeItem(userId, inventoryId) {
  const info = getUpgradeInfo(userId,inventoryId);
  if (!info.ok || info.maxed) return info;
  const missing = info.cost.materials.filter(m=>m.owned<m.required);
  if (missing.length) return { ok:false, reason:'materials', missing, info };
  const payment = removeCardDust(userId,info.cost.dust);
  if (!payment.ok) return { ok:false, reason:'dust', required:info.cost.dust, balance:payment.balance, info };
  try {
    const result=db.transaction(()=>{
      const consumed=consumeResources(userId,Object.fromEntries(info.cost.materials.map(material=>[material.key,material.required])));
      if(!consumed.ok) throw new Error('Insufficient materials');
      const fresh=db.prepare('SELECT upgrade_level,item_key FROM hero_inventory WHERE id=? AND user_id=?').get(inventoryId,userId);
      if(!fresh || Number(fresh.upgrade_level)!==info.level) throw new Error('Upgrade state changed');
      const roll=secureRoll(userId,inventoryId,info.targetLevel);
      const success=roll<=info.chance;
      if(success){
        db.prepare('UPDATE hero_inventory SET upgrade_level=? WHERE id=? AND user_id=?').run(info.targetLevel,inventoryId,userId);
      }
      db.prepare(`INSERT INTO hero_upgrade_history(user_id,inventory_id,item_key,from_level,to_level,success,chance,dust_spent,materials_json)
        VALUES(?,?,?,?,?,?,?,?,?)`).run(userId,inventoryId,info.item.item_key,info.level,info.targetLevel,success?1:0,info.chance,info.cost.dust,JSON.stringify(info.cost.materials.reduce((a,m)=>(a[m.key]=m.required,a),{})));
      return {success,roll};
    })();
    return { ok:true, ...result, item:info.item, fromLevel:info.level, targetLevel:info.targetLevel, chance:info.chance, spent:info.cost.dust, balance:payment.balance, materials:info.cost.materials };
  } catch(error){
    addCardDust(userId,info.cost.dust);
    console.error('[Upgrade] failed:',error);
    return {ok:false,reason:'error'};
  }
}
function getUpgradeHistory(userId,limit=10){
  return db.prepare(`SELECT h.*,i.name,i.rarity FROM hero_upgrade_history h LEFT JOIN hero_items i ON i.item_key=h.item_key WHERE h.user_id=? ORDER BY h.id DESC LIMIT ?`).all(userId,limit);
}
module.exports={MAX_UPGRADE,CHANCES,isUpgradeable,classifyUpgradeGroup,getUpgradeCost,getUpgradeInfo,upgradeItem,getUpgradeHistory};
