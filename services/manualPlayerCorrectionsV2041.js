'use strict';

const { db, addCardDust, unlockAchievement } = require('../database/db');

const KEY = 'v20.4.1-manual-player-corrections-2026-08-18';
const BACKPACK_KEY = 'v20.4.1-restore-506371696878551041-runic-shadow-bag-2026-08-18';
const QUICK_USER = '308557208147329025';
const STREAK_USER = '561961056197672991';
const SPEAR_USER = '695364739987013673';
const WOLF_USER = '1080729129915256843';
const BACKPACK_USER = '506371696878551041';

function tableExists(name) {
  try { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)); }
  catch (_) { return false; }
}
function cols(name) {
  try { return new Set(db.prepare(`PRAGMA table_info(${name})`).all().map(x => x.name)); }
  catch (_) { return new Set(); }
}
function parseJson(value, fallback = {}) { try { return JSON.parse(value || '{}'); } catch (_) { return fallback; } }
function ensureMigrationTable() {
  db.exec(`CREATE TABLE IF NOT EXISTS gs_one_time_migrations(migration_key TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
}
function grantInventoryItem(userId, item, source) {
  if (!item || !item.key) return false;
  const key = String(item.key);
  db.prepare(`INSERT INTO hero_items(item_key,name,item_type,rarity,description,slot,bonuses_json,lore,is_consumable)
    VALUES(?,?,?,?,?,?,?,?,0)
    ON CONFLICT(item_key) DO UPDATE SET name=excluded.name,item_type=excluded.item_type,rarity=excluded.rarity,
      description=excluded.description,slot=COALESCE(excluded.slot,hero_items.slot),bonuses_json=excluded.bonuses_json,lore=excluded.lore`)
    .run(key, item.name || key, item.type || 'equipment', item.rarity || 'legendary', item.description || '', item.slot || 'melee', JSON.stringify(item.bonuses || {}), item.lore || '');
  db.prepare(`INSERT INTO hero_inventory(user_id,item_key,quantity,acquired_from) VALUES(?,?,1,?)
    ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=hero_inventory.quantity+1,acquired_from=excluded.acquired_from`)
    .run(String(userId), key, source);
  if (tableExists('hero_item_collection')) db.prepare(`INSERT OR IGNORE INTO hero_item_collection(user_id,item_key,first_acquired_from) VALUES(?,?,?)`).run(String(userId), key, source);
  return true;
}
function findLegendarySpear() {
  if (tableExists('caravan_offers')) {
    try {
      const rows = db.prepare(`SELECT item_key,item_json,rarity,base_price,current_price FROM caravan_offers
        WHERE lower(rarity)='legendary' AND (base_price=1400 OR current_price=1400) ORDER BY id DESC`).all();
      for (const row of rows) {
        const j = parseJson(row.item_json, {}); const name = String(j.name || '');
        if (/копь|spear/i.test(name)) return { key: row.item_key || j.key || j.catalogKey, name, type:j.type||j.item_type||'equipment', rarity:'legendary', description:j.description||'', slot:j.slot||'melee', bonuses:j.bonuses||{}, lore:j.lore||'' };
      }
    } catch (_) {}
  }
  if (tableExists('hero_items')) {
    try {
      const row = db.prepare(`SELECT * FROM hero_items WHERE lower(rarity)='legendary' AND (lower(name) LIKE '%копь%' OR lower(name) LIKE '%spear%') ORDER BY created_at DESC LIMIT 1`).get();
      if (row) return { key:row.item_key,name:row.name,type:row.item_type,rarity:row.rarity,description:row.description,slot:row.slot,bonuses:parseJson(row.bonuses_json,{}),lore:row.lore };
    } catch (_) {}
  }
  return { key:'manual_legendary_spear_1400', name:'Легендарное копьё', type:'equipment', rarity:'legendary', description:'Легендарное копьё Караванщика.', slot:'melee', bonuses:{}, lore:'Восстановлено владельцем после потери данных.' };
}
function findWolfDefinition() {
  const wanted = 'Теневой Боевой волк';
  if (tableExists('economy_log')) {
    try {
      const row = db.prepare(`SELECT asset_key,asset_name,metadata_json FROM economy_log WHERE lower(asset_name)=lower(?) ORDER BY id DESC LIMIT 1`).get(wanted);
      if (row?.asset_key) {
        const meta=parseJson(row.metadata_json,{}); return {key:String(row.asset_key),name:row.asset_name||wanted,rarity:meta.rarity||null};
      }
    } catch (_) {}
  }
  if (tableExists('hero_companions')) {
    try { const row=db.prepare(`SELECT companion_key,name,rarity FROM hero_companions WHERE lower(name)=lower(?) ORDER BY id DESC LIMIT 1`).get(wanted); if(row) return {key:row.companion_key,name:row.name,rarity:row.rarity}; } catch(_) {}
  }
  if (tableExists('hero_items')) {
    try { const row=db.prepare(`SELECT item_key,name,rarity FROM hero_items WHERE lower(name)=lower(?) LIMIT 1`).get(wanted); if(row) return {key:row.item_key,name:row.name,rarity:row.rarity}; } catch(_) {}
  }
  return {key:'shadow_battle_wolf',name:wanted,rarity:'epic'};
}
function grantWolf() {
  const w=findWolfDefinition();
  const exists=db.prepare(`SELECT 1 FROM hero_companions WHERE user_id=? AND companion_key=? LIMIT 1`).get(WOLF_USER,w.key);
  if (!exists) db.prepare(`INSERT INTO hero_companions(user_id,companion_key,name,rarity,level,xp,active) VALUES(?,?,?,?,1,0,0)`).run(WOLF_USER,w.key,w.name,w.rarity||'epic');
  // Companion merchant items are mirrored in inventory in current builds; keep the mirror if registry exists.
  if (tableExists('hero_items')) {
    const item=db.prepare('SELECT 1 FROM hero_items WHERE item_key=?').get(w.key);
    if (item) db.prepare(`INSERT INTO hero_inventory(user_id,item_key,quantity,acquired_from) VALUES(?,?,1,'manual_restore_v20.4.1') ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=MAX(quantity,1)`).run(WOLF_USER,w.key);
  }
  return w;
}
function restoreQuickStreak() {
  if (!tableExists('quick_event_player_stats')) return {skipped:'no table'};
  const c=cols('quick_event_player_stats'); const now=Date.now();
  const row=db.prepare('SELECT * FROM quick_event_player_stats WHERE user_id=?').get(QUICK_USER);
  if (row) {
    const sets=[]; const vals=[];
    if(c.has('total_wins')){sets.push('total_wins=MAX(total_wins,5)');}
    if(c.has('current_streak')){sets.push('current_streak=5');}
    if(c.has('best_streak')){sets.push('best_streak=MAX(best_streak,5)');}
    if(c.has('updated_at')){sets.push('updated_at=?');vals.push(now);}
    if(sets.length) db.prepare(`UPDATE quick_event_player_stats SET ${sets.join(',')} WHERE user_id=?`).run(...vals,QUICK_USER);
  } else {
    db.prepare(`INSERT INTO quick_event_player_stats(user_id,total_wins,current_streak,best_streak,types_json,last_win_round_id,updated_at) VALUES(?,5,5,5,'[]',NULL,?)`).run(QUICK_USER,now);
  }
  if (tableExists('player_achievements')) {
    const has=db.prepare(`SELECT 1 FROM player_achievements WHERE user_id=? AND achievement_id='quick_event_streak_5'`).get(QUICK_USER);
    if(!has) unlockAchievement(QUICK_USER,'quick_event_streak_5');
    if (tableExists('players') && cols('players').has('achievements')) db.prepare(`UPDATE players SET achievements=(SELECT COUNT(*) FROM player_achievements WHERE user_id=?) WHERE user_id=?`).run(QUICK_USER,QUICK_USER);
  }
  return db.prepare('SELECT total_wins,current_streak,best_streak FROM quick_event_player_stats WHERE user_id=?').get(QUICK_USER);
}
function set39DayStreaks() {
  if (!tableExists('streaks')) return [];
  const types=['daily_claim','chat','voice','given_reactions','received_reactions']; // intentionally excludes event/game nights
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const stmt=db.prepare(`INSERT INTO streaks(user_id,type,current,best,last_date,updated_at) VALUES(?,?,39,39,?,CURRENT_TIMESTAMP)
    ON CONFLICT(user_id,type) DO UPDATE SET current=39,best=MAX(streaks.best,39),last_date=excluded.last_date,updated_at=CURRENT_TIMESTAMP`);
  for(const type of types) stmt.run(STREAK_USER,type,today);
  return types;
}
function grantMaterials() {
  if (!tableExists('hero_materials')) return null;
  // Current material catalog uses beast_hide for animal/bear hides.
  db.prepare(`INSERT INTO hero_materials(user_id,material_key,quantity) VALUES(?,?,5)
    ON CONFLICT(user_id,material_key) DO UPDATE SET quantity=hero_materials.quantity+5,updated_at=CURRENT_TIMESTAMP`).run(SPEAR_USER,'beast_hide');
  return 'beast_hide +5';
}

function restoreRunicShadowBag() {
  const item = {
    key: 'caravan_backpack_1081',
    name: 'Рунный Сумка Тихой тени',
    type: 'backpack',
    rarity: 'mythic',
    description: 'Редкий товар странствующего Караванщика: рунный сумка тихой тени.',
    slot: 'backpack',
    bonuses: { expedition_success: 7, rare_find: 5 },
    lore: 'Эта вещь прошла множество земель, прежде чем оказаться у ворот Гильдии.'
  };

  db.prepare(`INSERT INTO hero_items(item_key,name,item_type,rarity,description,slot,bonuses_json,lore,is_consumable)
    VALUES(?,?,?,?,?,?,?,?,0)
    ON CONFLICT(item_key) DO UPDATE SET name=excluded.name,item_type=excluded.item_type,rarity=excluded.rarity,
      description=excluded.description,slot=excluded.slot,bonuses_json=excluded.bonuses_json,lore=excluded.lore`)
    .run(item.key,item.name,item.type,item.rarity,item.description,item.slot,JSON.stringify(item.bonuses),item.lore);

  const owned = db.prepare(`SELECT quantity FROM hero_inventory WHERE user_id=? AND item_key=?`).get(BACKPACK_USER,item.key);
  if (Number(owned?.quantity || 0) <= 0) {
    db.prepare(`INSERT INTO hero_inventory(user_id,item_key,quantity,acquired_from) VALUES(?,?,1,'manual_restore_v20.4.1_backpack')
      ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=MAX(hero_inventory.quantity,1),acquired_from=excluded.acquired_from`)
      .run(BACKPACK_USER,item.key);
  }
  if (tableExists('hero_item_collection')) {
    db.prepare(`INSERT OR IGNORE INTO hero_item_collection(user_id,item_key,first_acquired_from) VALUES(?,?,'manual_restore_v20.4.1_backpack')`)
      .run(BACKPACK_USER,item.key);
  }
  return { ...item, alreadyOwned: Number(owned?.quantity || 0) > 0 };
}

function applyBackpackCorrectionV2041() {
  ensureMigrationTable();
  if (db.prepare('SELECT 1 FROM gs_one_time_migrations WHERE migration_key=?').get(BACKPACK_KEY)) return {applied:false};
  const result = db.transaction(() => {
    const backpack = restoreRunicShadowBag();
    db.prepare('INSERT INTO gs_one_time_migrations(migration_key) VALUES(?)').run(BACKPACK_KEY);
    return backpack;
  })();
  console.log('[V20.4.1 Backpack Restore] applied', JSON.stringify(result));
  return {applied:true,backpack:result};
}

function applyManualPlayerCorrectionsV2041() {
  ensureMigrationTable();
  let base = {applied:false};
  if(!db.prepare('SELECT 1 FROM gs_one_time_migrations WHERE migration_key=?').get(KEY)) {
    const result=db.transaction(()=>{
      const quick=restoreQuickStreak();
      const streaks=set39DayStreaks();
      const material=grantMaterials();
      const spear=findLegendarySpear(); grantInventoryItem(SPEAR_USER,spear,'manual_restore_v20.4.1');
      addCardDust(SPEAR_USER,3000);
      const wolf=grantWolf();
      db.prepare('INSERT INTO gs_one_time_migrations(migration_key) VALUES(?)').run(KEY);
      return {quick,streaks,material,spear,wolf};
    })();
    console.log('[V20.4.1 Manual Corrections] applied', JSON.stringify(result));
    base = {applied:true,...result};
  }
  const backpack = applyBackpackCorrectionV2041();
  return {...base, backpackCorrection:backpack};
}
module.exports={applyManualPlayerCorrectionsV2041};
