const crypto = require('crypto');
const { db, getCardDust, removeCardDust, addCardDust } = require('../../database/db');
const { MATERIALS } = require('./materialData');
const { getInventoryItem } = require('./itemService');

const MAX_UPGRADE = 10;
const CHANCES = Object.freeze({ 1:100, 2:100, 3:100, 4:100, 5:100, 6:80, 7:65, 8:50, 9:35, 10:20 });
const RARITY_MULTIPLIER = Object.freeze({ common:1, rare:1.35, epic:1.8, legendary:2.5, mythic:3.4, exclusive:4 });

function isUpgradeable(item) {
  return !!item?.slot && ['weapon','armor','helmet','gloves','boots','ring','amulet','backpack'].includes(item.item_type);
}
function getUpgradeCost(item, targetLevel) {
  const rarity = RARITY_MULTIPLIER[item.rarity] || 1;
  const dust = Math.round((60 + targetLevel * targetLevel * 22) * rarity / 5) * 5;
  const materials = {};
  materials.iron_ore = Math.max(1, Math.ceil(targetLevel * rarity));
  if (targetLevel >= 4) materials.crystal = Math.max(1, Math.ceil((targetLevel - 3) * rarity / 2));
  if (targetLevel >= 7) materials.essence = Math.max(1, Math.ceil((targetLevel - 6) * rarity / 2));
  if (targetLevel >= 9) materials.void_crystal = Math.max(1, Math.ceil((targetLevel - 8) * rarity / 2));
  return { dust, materials };
}
function materialRows(userId, requirements) {
  const owned = new Map(db.prepare('SELECT material_key,quantity FROM hero_materials WHERE user_id=?').all(userId).map(r=>[r.material_key,r.quantity]));
  return Object.entries(requirements).map(([key,required])=>({ key, required, owned:owned.get(key)||0, ...(MATERIALS[key]||{name:key,icon:'📦'}) }));
}
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
  return { ok:true, item, level, targetLevel, chance:CHANCES[targetLevel], dust, cost:{...cost,materials}, canAfford:dust>=cost.dust && materials.every(m=>m.owned>=m.required) };
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
      for(const material of info.cost.materials){
        const changed=db.prepare(`UPDATE hero_materials SET quantity=quantity-?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND material_key=? AND quantity>=?`)
          .run(material.required,userId,material.key,material.required);
        if(!changed.changes) throw new Error(`Insufficient material: ${material.key}`);
      }
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
module.exports={MAX_UPGRADE,CHANCES,isUpgradeable,getUpgradeCost,getUpgradeInfo,upgradeItem,getUpgradeHistory};
