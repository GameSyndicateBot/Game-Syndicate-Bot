const { db } = require('../../database/db');
const { ITEMS, RARITY_ORDER } = require('./itemData');
const { normalizeClassKey, isValidClass } = require('./classProgressService');
const { grantResource } = require('./resourceService');
const { getHero } = require('./heroService');


const CASTER_CLASSES=new Set(['mage','pyromancer','mindlord','necromancer','druid','shaman','chronomancer','illusionist','priest','cleric']);
const SHIELD_CLASSES=new Set(['warrior','paladin','guardian','cleric']);
const STAFF_RE=/посох|жезл|staff|wand|сфера|гримуар|книга заклинаний/i;
const BOW_RE=/лук|арбалет|bow|crossbow/i;
const SHIELD_RE=/щит|shield/i;
const TWO_HANDED_RE=/двуруч|двухруч|великий меч|greatsword|greataxe|секира|алебард|копь[её]|пика|боевой молот|тяж[её]лый молот|императорский молот|коса|scythe|halberd|spear/i;
const MARTIAL_RE=/меч|клинок|топор|секир|молот|булав|кинжал|рапир|копь|пика|коса|sword|blade|axe|hammer|mace|dagger|rapier|spear|scythe/i;

// Персональное сюжетное исключение: владелец может использовать этот предмет любым классом.
const UNIVERSAL_PERSONAL_EQUIPMENT = new Map([
 ['830515570377097259', new Set(['звёздный топор забытой крепости'])],
]);
function normalizeEquipmentName(value){return String(value||'').trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е');}
function isUniversalPersonalEquipment(item,userId){
 const allowed=UNIVERSAL_PERSONAL_EQUIPMENT.get(String(userId));
 if(!allowed)return false;
 const name=normalizeEquipmentName(item?.name);
 return [...allowed].some(x=>normalizeEquipmentName(x)===name);
}
function equipmentKind(item){const name=String(item?.name||'');if(SHIELD_RE.test(name))return 'shield';if(BOW_RE.test(name))return 'ranged';if(STAFF_RE.test(name))return 'staff';if(TWO_HANDED_RE.test(name))return 'two_handed';if(MARTIAL_RE.test(name))return 'martial';return String(item?.slot||'');}
function validateEquipmentForClass(item,classKey,userId,{slot=null,classEquipment=false}={}){
 const key=normalizeClassKey(classKey||getHero(userId)?.class_key); if(!key||!isValidClass(key))return {ok:true};
 const kind=equipmentKind(item);
 // Исключение применяется только к указанному владельцу и точному названию предмета.
 if(isUniversalPersonalEquipment(item,userId))return {ok:true,classKey:key,kind,universalPersonal:true};
 if(CASTER_CLASSES.has(key) && ['martial','two_handed','ranged','shield'].includes(kind))return {ok:false,reason:'class_restricted',classKey:key};
 if(!CASTER_CLASSES.has(key) && kind==='staff')return {ok:false,reason:'class_restricted',classKey:key};
 if(kind==='shield' && !SHIELD_CLASSES.has(key))return {ok:false,reason:'class_restricted',classKey:key};
 if(key==='archer' && !['ranged','martial','ring','amulet','belt','legs','chest','boots','helmet','gloves','backpack'].includes(kind) && String(item?.slot||'')==='weapon')return {ok:false,reason:'class_restricted',classKey:key};
 const equipped=classEquipment?getClassEquipment(userId,key,{fallback:false}):getEquipment(userId);
 if(kind==='shield'){
   const main=equipped.find(x=>x.slot==='melee'); if(main && equipmentKind(main)==='two_handed')return {ok:false,reason:'two_handed_conflict'};
 }
 if(kind==='two_handed'){
   const off=equipped.find(x=>x.slot==='offhand'); if(off)return {ok:false,reason:'two_handed_conflict'};
 }
 return {ok:true,classKey:key,kind};
}

const STAT_KEYS=['hp','strength','defense','dexterity','intelligence','wisdom','vitality','luck','expedition_success','rare_find','world_boss_damage','world_boss_resistance','boss_flat_damage','injury_resistance','class_xp_bonus','heal'];
function parseBonuses(value){ try{return JSON.parse(value||'{}')||{};}catch(_){return {};} }
function applyUpgradeToBonuses(bonuses,level=0){const n=Math.max(0,Math.min(10,Number(level)||0));if(!n)return {...bonuses};const out={};for(const [key,value] of Object.entries(bonuses||{})){const numeric=Number(value)||0;if(!numeric){out[key]=value;continue;}const percent=['expedition_success','rare_find','world_boss_damage','world_boss_resistance','injury_resistance','class_xp_bonus'].includes(key);out[key]=percent?numeric+Math.ceil(n*0.8):Math.max(numeric,Math.round(numeric*(1+n*0.15)));}return out;}
function seedItems(){
 const stmt=db.prepare(`INSERT INTO hero_items (item_key,name,item_type,rarity,description,slot,bonuses_json,lore,is_consumable)
 VALUES (@key,@name,@type,@rarity,@description,@slot,@bonuses,@lore,@consumable)
 ON CONFLICT(item_key) DO UPDATE SET name=excluded.name,item_type=excluded.item_type,rarity=excluded.rarity,description=excluded.description,slot=excluded.slot,bonuses_json=excluded.bonuses_json,lore=excluded.lore,is_consumable=excluded.is_consumable`);
 const tx=db.transaction(()=>{for(const [key,item] of Object.entries(ITEMS))stmt.run({key,name:item.name,type:item.type,rarity:item.rarity,description:item.description,slot:item.slot||null,bonuses:JSON.stringify(item.bonuses||{}),lore:item.lore||'',consumable:item.consumable?1:0});}); tx();
}
function grantItem(userId,itemKey,quantity=1,source='system'){
 seedItems();
 const staticItem=ITEMS[itemKey];
 const storedItem=db.prepare('SELECT * FROM hero_items WHERE item_key=?').get(itemKey);
 const item=staticItem||storedItem;
 if(!item)return null;
 const type=staticItem?.type||storedItem?.item_type;
 if(type==='material') return grantResource(userId,itemKey,quantity,source);
 db.prepare(`INSERT INTO hero_inventory(user_id,item_key,quantity,acquired_from) VALUES(?,?,?,?)
 ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=quantity+excluded.quantity, acquired_from=excluded.acquired_from`).run(String(userId),itemKey,Math.max(1,quantity),source);
 db.prepare(`INSERT OR IGNORE INTO hero_item_collection(user_id,item_key,first_acquired_from) VALUES(?,?,?)`).run(String(userId),itemKey,source);
 return getInventoryItemByKey(String(userId),itemKey);
}
function getInventory(userId,{type=null,limit=100}={}){
 seedItems(); let sql=`SELECT hi.*,i.name,i.item_type,i.rarity,i.description,i.slot,i.bonuses_json,i.lore,i.is_consumable,
 COALESCE(hi.upgrade_level,0) upgrade_level,
 CASE i.rarity WHEN 'exclusive' THEN 6 WHEN 'mythic' THEN 5 WHEN 'legendary' THEN 4 WHEN 'epic' THEN 3 WHEN 'rare' THEN 2 ELSE 1 END rarity_rank
 FROM hero_inventory hi JOIN hero_items i ON i.item_key=hi.item_key WHERE hi.user_id=?`;
 const params=[userId]; if(type){sql+=' AND i.item_type=?';params.push(type);} sql+=' ORDER BY rarity_rank DESC,i.name ASC LIMIT ?';params.push(limit); return db.prepare(sql).all(...params);
}
function getInventoryItem(userId,id){return db.prepare(`SELECT hi.*,COALESCE(hi.upgrade_level,0) upgrade_level,i.name,i.item_type,i.rarity,i.description,i.slot,i.bonuses_json,i.lore,i.is_consumable FROM hero_inventory hi JOIN hero_items i ON i.item_key=hi.item_key WHERE hi.user_id=? AND hi.id=?`).get(userId,id)||null;}
function getInventoryItemByKey(userId,key){return db.prepare(`SELECT hi.*,COALESCE(hi.upgrade_level,0) upgrade_level,i.name,i.item_type,i.rarity,i.description,i.slot,i.bonuses_json,i.lore,i.is_consumable FROM hero_inventory hi JOIN hero_items i ON i.item_key=hi.item_key WHERE hi.user_id=? AND hi.item_key=?`).get(userId,key)||null;}
function getEquipment(userId){return db.prepare(`SELECT he.slot,he.inventory_id,hi.item_key,COALESCE(hi.upgrade_level,0) upgrade_level,i.name,i.item_type,i.rarity,i.description,i.slot AS item_slot,i.bonuses_json,i.lore FROM hero_equipment he JOIN hero_inventory hi ON hi.id=he.inventory_id JOIN hero_items i ON i.item_key=hi.item_key WHERE he.user_id=? ORDER BY he.slot`).all(userId);}
function canonicalSlot(item,userId){
 const raw=String(item?.slot||''); const name=String(item?.name||'').toLowerCase();
 if(raw==='ring'){const used=new Set(getEquipment(userId).filter(x=>x.slot==='ring1'||x.slot==='ring2').map(x=>x.slot));return !used.has('ring1')?'ring1':!used.has('ring2')?'ring2':'ring1';}
 if(raw==='weapon'){if(/лук|арбалет|bow|crossbow/.test(name))return 'ranged';if(/щит|shield/.test(name))return 'offhand';return 'melee';}
 if(raw==='armor')return 'chest';
 if(raw==='pants'||raw==='legs')return 'legs';
 if(raw==='belt')return 'belt';
 return raw;
}
function unequipInventoryItem(userId,inventoryId){const r=db.prepare('DELETE FROM hero_equipment WHERE user_id=? AND inventory_id=?').run(userId,Number(inventoryId));return {ok:r.changes>0};}
function getClassEquipment(userId,classKey,{fallback=true}={}){
 const key=normalizeClassKey(classKey); if(!isValidClass(key))return [];
 const classRows=db.prepare(`SELECT hce.slot,hce.inventory_id,hi.item_key,COALESCE(hi.upgrade_level,0) upgrade_level,i.name,i.item_type,i.rarity,i.description,i.slot AS item_slot,i.bonuses_json,i.lore
 FROM hero_class_equipment hce JOIN hero_inventory hi ON hi.id=hce.inventory_id JOIN hero_items i ON i.item_key=hi.item_key
 WHERE hce.user_id=? AND hce.class_key=?`).all(userId,key);
 if(!fallback)return classRows;

 // Классовый комплект переопределяет только занятые в нём слоты.
 // Остальные слоты продолжают брать предметы из общего комплекта героя.
 // Раньше наличие хотя бы одного классового предмета полностью отключало
 // весь общий комплект, из-за чего часть надетых вещей не влияла на экспедиции.
 const merged=new Map(getEquipment(userId).map(row=>[String(row.slot),row]));
 for(const row of classRows)merged.set(String(row.slot),row);
 return [...merged.values()].sort((a,b)=>String(a.slot).localeCompare(String(b.slot),'ru'));
}
function equipItemForClass(userId,inventoryId,classKey){
 const key=normalizeClassKey(classKey); if(!isValidClass(key))return {ok:false,reason:'invalid_class'};
 const item=getInventoryItem(userId,inventoryId); if(!item)return {ok:false,reason:'not_found'}; if(!item.slot)return {ok:false,reason:'not_equippable'};
 const slot=canonicalSlot(item,userId); const allowed=validateEquipmentForClass(item,key,userId,{slot,classEquipment:true}); if(!allowed.ok)return allowed;
 db.prepare(`INSERT INTO hero_class_equipment(user_id,class_key,slot,inventory_id) VALUES(?,?,?,?)
 ON CONFLICT(user_id,class_key,slot) DO UPDATE SET inventory_id=excluded.inventory_id,equipped_at=CURRENT_TIMESTAMP`).run(userId,key,slot,item.id);
 return {ok:true,item,slot,classKey:key};
}
function unequipItemForClass(userId,slot,classKey){
 const key=normalizeClassKey(classKey); if(!isValidClass(key))return {ok:false,reason:'invalid_class'};
 const r=db.prepare('DELETE FROM hero_class_equipment WHERE user_id=? AND class_key=? AND slot=?').run(userId,key,slot);
 return {ok:r.changes>0,classKey:key};
}
function equipItem(userId,inventoryId){
 const item=getInventoryItem(userId,inventoryId); if(!item)return {ok:false,reason:'not_found'}; if(!item.slot)return {ok:false,reason:'not_equippable'};
 const slot=canonicalSlot(item,userId); const allowed=validateEquipmentForClass(item,null,userId,{slot}); if(!allowed.ok)return allowed;
 db.prepare(`INSERT INTO hero_equipment(user_id,slot,inventory_id) VALUES(?,?,?) ON CONFLICT(user_id,slot) DO UPDATE SET inventory_id=excluded.inventory_id,equipped_at=CURRENT_TIMESTAMP`).run(userId,slot,item.id);
 return {ok:true,item,slot};
}
function unequipItem(userId,slot){const r=db.prepare('DELETE FROM hero_equipment WHERE user_id=? AND slot=?').run(userId,slot);return {ok:r.changes>0};}
function sumEquipmentBonuses(items){const total=Object.fromEntries(STAT_KEYS.map(k=>[k,0]));for(const item of items){const b=applyUpgradeToBonuses(parseBonuses(item.bonuses_json),item.upgrade_level);for(const k of STAT_KEYS)total[k]+=Number(b[k]||0);}return total;}
function getEquipmentOnlyBonuses(userId){return sumEquipmentBonuses(getEquipment(userId));}
function getClassEquipmentOnlyBonuses(userId,classKey,{fallback=true}={}){return sumEquipmentBonuses(getClassEquipment(userId,classKey,{fallback}));}
function getEquipmentBonuses(userId,classKey=null){
  const key=normalizeClassKey(classKey||getHero(userId)?.class_key);
  const total=key&&isValidClass(key)?getClassEquipmentOnlyBonuses(userId,key,{fallback:true}):getEquipmentOnlyBonuses(userId);
  try{
    const rows=db.prepare(`SELECT i.bonuses_json,COALESCE(hi.upgrade_level,0) upgrade_level
      FROM hero_artifact_equipment hae
      JOIN hero_inventory hi ON hi.id=hae.inventory_id
      JOIN hero_items i ON i.item_key=hi.item_key
      WHERE hae.user_id=?`).all(String(userId));
    for(const row of rows){
      const bonuses=applyUpgradeToBonuses(parseBonuses(row.bonuses_json),row.upgrade_level);
      for(const k of STAT_KEYS)total[k]+=Number(bonuses[k]||0);
    }
  }catch(_){}
  try{
    const {getCompanionBonuses}=require('./companionService');
    const cb=getCompanionBonuses(userId);
    for(const k of STAT_KEYS)total[k]+=Number(cb[k]||0);
  }catch(_){}
  return total;
}

function getLoadoutBreakdown(userId,classKey=null){
  const key=normalizeClassKey(classKey||getHero(userId)?.class_key);
  const equipmentItems=key&&isValidClass(key)?getClassEquipment(userId,key,{fallback:true}):getEquipment(userId);
  const equipment=sumEquipmentBonuses(equipmentItems);
  const equipmentDetails=equipmentItems.map(row=>({
    ...row,
    baseBonuses:parseBonuses(row.bonuses_json),
    bonuses:applyUpgradeToBonuses(parseBonuses(row.bonuses_json),row.upgrade_level),
  }));

  const artifacts=Object.fromEntries(STAT_KEYS.map(k=>[k,0]));
  let artifactItems=[];
  try{
    artifactItems=db.prepare(`SELECT hae.slot_no,hae.inventory_id,hi.item_key,COALESCE(hi.upgrade_level,0) upgrade_level,i.name,i.rarity,i.bonuses_json
      FROM hero_artifact_equipment hae JOIN hero_inventory hi ON hi.id=hae.inventory_id JOIN hero_items i ON i.item_key=hi.item_key WHERE hae.user_id=? ORDER BY hae.slot_no`).all(String(userId));
    artifactItems=artifactItems.map(row=>{
      const baseBonuses=parseBonuses(row.bonuses_json);
      const bonuses=applyUpgradeToBonuses(baseBonuses,row.upgrade_level);
      for(const k of STAT_KEYS)artifacts[k]+=Number(bonuses[k]||0);
      return {...row,baseBonuses,bonuses};
    });
  }catch(_){}

  const pets=Object.fromEntries(STAT_KEYS.map(k=>[k,0]));
  const mount=Object.fromEntries(STAT_KEYS.map(k=>[k,0]));
  let activePets=[],activeMount=null;
  try{
    const cs=require('./companionService');
    const cb=cs.getCompanionBreakdown?cs.getCompanionBreakdown(userId):null;
    if(cb){
      for(const k of STAT_KEYS){
        pets[k]+=Number(cb.petTotal?.[k]||0);
        mount[k]+=Number(cb.mountTotal?.[k]||0);
      }
      activePets=cb.pets||[];
      activeMount=cb.mount||null;
    }else{
      const legacy=cs.getCompanionBonuses(userId)||{};
      for(const k of STAT_KEYS)pets[k]+=Number(legacy[k]||0);
      activePets=cs.getActiveCompanions(userId)||[];
      activeMount=cs.getActiveMount(userId)||null;
    }
  }catch(_){}

  const companions={};
  const total={};
  for(const k of STAT_KEYS){
    companions[k]=Number(pets[k]||0)+Number(mount[k]||0);
    total[k]=Number(equipment[k]||0)+Number(artifacts[k]||0)+companions[k];
  }
  return {
    classKey:key,
    equipment,artifacts,pets,mount,companions,total,
    equipmentItems:equipmentDetails,artifactItems,activePets,activeMount,
  };
}

function repairSameNameRarityDuplicates(){
  try{
    db.exec(`CREATE TABLE IF NOT EXISTS gs_one_time_migrations (migration_key TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    const migrationKey='v20.2.0-same-name-rarity-duplicates';
    if(db.prepare('SELECT 1 FROM gs_one_time_migrations WHERE migration_key=?').get(migrationKey))return;
    const rank={common:1,rare:2,epic:3,legendary:4,mythic:5,exclusive:6};
    const rows=db.prepare(`SELECT item_key,name,item_type,rarity,bonuses_json FROM hero_items WHERE is_consumable=0 ORDER BY name`).all();
    const groups=new Map();
    for(const row of rows){const n=String(row.name||'').trim().toLocaleLowerCase('ru-RU').replace(/ё/g,'е');if(!groups.has(n))groups.set(n,[]);groups.get(n).push(row);}
    const upd=db.prepare('UPDATE hero_items SET bonuses_json=? WHERE item_key=?');let fixed=0;
    db.transaction(()=>{
      for(const group of groups.values()){
        if(group.length<2||new Set(group.map(x=>x.rarity)).size<2)continue;
        group.sort((a,b)=>(rank[a.rarity]||1)-(rank[b.rarity]||1));
        let prev={};
        for(const row of group){const r=rank[row.rarity]||1;const b=parseBonuses(row.bonuses_json);const out={...b};
          for(const [k,v] of Object.entries(b)){const n=Number(v);if(!Number.isFinite(n)||n<=0)continue;const percent=['expedition_success','rare_find','world_boss_damage','world_boss_resistance','injury_resistance','class_xp_bonus'].includes(k);const floor=percent?Math.max(n,r-1):Math.max(n,Math.ceil(n*(1+(r-1)*0.28)));out[k]=Math.max(floor,Number(prev[k]||0)+(percent?1:1));}
          if(JSON.stringify(out)!==JSON.stringify(b)){upd.run(JSON.stringify(out),row.item_key);fixed++;}prev=out;
        }
      }
      db.prepare('INSERT INTO gs_one_time_migrations(migration_key) VALUES(?)').run(migrationKey);
    })();
    console.log(`[Item Audit] Исправлено одинаковых предметов разных редкостей: ${fixed}.`);
  }catch(e){console.error('[Item Audit] duplicate rarity repair',e);}
}

function getEffectiveHero(hero,options={}){if(!hero)return null;const classKey=normalizeClassKey(options.classKey||hero.class_key);const b=getEquipmentBonuses(hero.user_id,classKey);const {totalStats,deriveStats}=require('./statSystem');const stats=totalStats(hero,b);const derived=deriveStats(stats,classKey);const maxHp=Number(hero.max_hp||0)+derived.bonusHp;return {...hero,class_key:classKey,equipmentBonuses:b,totalStats:stats,derivedStats:derived,max_hp:maxHp,hp:Math.min(Number(hero.hp||0)+derived.bonusHp,maxHp),strength:stats.strength,defense:stats.defense,dexterity:stats.dexterity,intelligence:stats.intelligence,wisdom:stats.wisdom,vitality:stats.vitality,luck:stats.luck};}
function getCollection(userId){seedItems();const rows=db.prepare(`SELECT c.item_key,c.first_acquired_at,i.name,i.item_type,i.rarity FROM hero_item_collection c JOIN hero_items i ON i.item_key=c.item_key WHERE c.user_id=?`).all(userId);return {rows,found:rows.length,total:Object.keys(ITEMS).length};}
function formatBonuses(value){const b=typeof value==='string'?parseBonuses(value):value||{};const labels={hp:'❤️ HP',strength:'⚔️ Сила',defense:'🛡️ Защита',dexterity:'🏃 Ловкость',intelligence:'🧠 Интеллект',wisdom:'✨ Мудрость',vitality:'🛡️ Выносливость',luck:'🍀 Удача',expedition_success:'🗺️ Успех экспедиции',rare_find:'✨ Шанс редкой добычи',world_boss_damage:'🐉 Урон по боссу',world_boss_resistance:'🛡️ Защита от босса',boss_flat_damage:'💣 Урон бомбы',injury_resistance:'❤️ Защита от ранений',class_xp_bonus:'📚 Опыт класса',heal:'🧪 Лечение'};return Object.entries(b).filter(([,v])=>v).map(([k,v])=>`${labels[k]||k}: +${v}${['expedition_success','rare_find','world_boss_damage','world_boss_resistance','injury_resistance','class_xp_bonus'].includes(k)?'%':''}`);}
seedItems();
repairSameNameRarityDuplicates();
module.exports={equipmentKind,validateEquipmentForClass,seedItems,grantItem,getInventory,getInventoryItem,getInventoryItemByKey,getEquipment,getClassEquipment,equipItem,equipItemForClass,unequipItem,unequipInventoryItem,unequipItemForClass,canonicalSlot,getEquipmentOnlyBonuses,getClassEquipmentOnlyBonuses,getEquipmentBonuses,getLoadoutBreakdown,getEffectiveHero,getCollection,formatBonuses,parseBonuses,applyUpgradeToBonuses};
