'use strict';

const { db, getCardDust, addCardDust, unlockAchievement } = require('../database/db');

const KEY = 'v20.4.2-durable-player-restores-2026-08-18';
const U308 = '308557208147329025';
const U561 = '561961056197672991';
const U695 = '695364739987013673';
const U108 = '1080729129915256843';
const U506 = '506371696878551041';

function tableExists(name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}
function cols(name) {
  return new Set(db.prepare(`PRAGMA table_info(${name})`).all().map(r => r.name));
}
function ensureMigrationTable() {
  db.exec(`CREATE TABLE IF NOT EXISTS gs_one_time_migrations(
    migration_key TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
}
function ensureItemDef(item) {
  db.prepare(`INSERT INTO hero_items(item_key,name,item_type,rarity,description,slot,bonuses_json,lore,is_consumable)
    VALUES(?,?,?,?,?,?,?,?,0)
    ON CONFLICT(item_key) DO UPDATE SET name=excluded.name,item_type=excluded.item_type,rarity=excluded.rarity,
      description=excluded.description,slot=COALESCE(excluded.slot,hero_items.slot),
      bonuses_json=excluded.bonuses_json,lore=excluded.lore`)
    .run(item.key,item.name,item.type||'equipment',item.rarity||'legendary',item.description||'',
      item.slot||'melee',JSON.stringify(item.bonuses||{}),item.lore||'');
}
function ensureInventory(userId,item,minimum=1,source='manual_restore_v20.4.2') {
  ensureItemDef(item);
  db.prepare(`INSERT INTO hero_inventory(user_id,item_key,quantity,acquired_from)
    VALUES(?,?,?,?)
    ON CONFLICT(user_id,item_key) DO UPDATE SET
      quantity=MAX(hero_inventory.quantity,excluded.quantity),
      acquired_from=CASE WHEN hero_inventory.quantity < excluded.quantity THEN excluded.acquired_from ELSE hero_inventory.acquired_from END`)
    .run(userId,item.key,minimum,source);
  if (tableExists('hero_item_collection')) {
    db.prepare(`INSERT OR IGNORE INTO hero_item_collection(user_id,item_key,first_acquired_from) VALUES(?,?,?)`)
      .run(userId,item.key,source);
  }
}
function ensureClassFloor(userId,classKey,level) {
  if (!tableExists('hero_class_progress')) return;
  const c=cols('hero_class_progress');
  const row=db.prepare(`SELECT level,xp,expeditions_completed FROM hero_class_progress WHERE user_id=? AND class_key=?`).get(userId,classKey);
  if (row) {
    if (Number(row.level||1)<level) db.prepare(`UPDATE hero_class_progress SET level=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND class_key=?`).run(level,userId,classKey);
  } else {
    db.prepare(`INSERT INTO hero_class_progress(user_id,class_key,level,xp,expeditions_completed) VALUES(?,?,?,0,0)`).run(userId,classKey,level);
  }
  const hero=db.prepare(`SELECT class_key,level FROM heroes WHERE user_id=?`).get(userId);
  if (String(hero?.class_key||'').toLowerCase()===classKey && Number(hero?.level||1)<level) {
    db.prepare(`UPDATE heroes SET level=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=?`).run(level,userId);
  }
}
function restoreQuick5() {
  if (!tableExists('quick_event_player_stats')) return;
  const c=cols('quick_event_player_stats'), now=Date.now();
  const row=db.prepare(`SELECT * FROM quick_event_player_stats WHERE user_id=?`).get(U308);
  if (row) {
    const sets=[];
    if(c.has('total_wins')) sets.push('total_wins=MAX(total_wins,5)');
    if(c.has('current_streak')) sets.push('current_streak=MAX(current_streak,5)');
    if(c.has('best_streak')) sets.push('best_streak=MAX(best_streak,5)');
    if(c.has('updated_at')) sets.push(`updated_at=${Number(now)}`);
    if(sets.length) db.prepare(`UPDATE quick_event_player_stats SET ${sets.join(',')} WHERE user_id=?`).run(U308);
  } else {
    db.prepare(`INSERT INTO quick_event_player_stats(user_id,total_wins,current_streak,best_streak,types_json,last_win_round_id,updated_at)
      VALUES(?,5,5,5,'[]',NULL,?)`).run(U308,now);
  }
  if (tableExists('player_achievements')) {
    const has=db.prepare(`SELECT 1 FROM player_achievements WHERE user_id=? AND achievement_id='quick_event_streak_5'`).get(U308);
    if(!has) unlockAchievement(U308,'quick_event_streak_5');
  }
}
function restore39Streaks() {
  if (!tableExists('streaks')) return;
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Kyiv',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const types=['daily_claim','chat','voice','given_reactions','received_reactions'];
  const stmt=db.prepare(`INSERT INTO streaks(user_id,type,current,best,last_date,updated_at) VALUES(?,?,39,39,?,CURRENT_TIMESTAMP)
    ON CONFLICT(user_id,type) DO UPDATE SET current=MAX(streaks.current,39),best=MAX(streaks.best,39),last_date=excluded.last_date,updated_at=CURRENT_TIMESTAMP`);
  for(const type of types) stmt.run(U561,type,today);
}
function restoreWolf() {
  if (!tableExists('hero_companions')) return;
  const name='Теневой Боевой волк', key='shadow_battle_wolf';
  const exists=db.prepare(`SELECT 1 FROM hero_companions WHERE user_id=? AND (companion_key=? OR lower(name)=lower(?)) LIMIT 1`).get(U108,key,name);
  if(!exists) db.prepare(`INSERT INTO hero_companions(user_id,companion_key,name,rarity,level,xp,active) VALUES(?,?,?,'epic',1,0,0)`).run(U108,key,name);
}
function applyDurablePlayerRestoresV2042() {
  ensureMigrationTable();
  if(db.prepare(`SELECT 1 FROM gs_one_time_migrations WHERE migration_key=?`).get(KEY)) return {applied:false};

  const report=db.transaction(()=>{
    ensureClassFloor(U308,'bard',20);
    ensureClassFloor(U308,'archer',8);
    const before308=getCardDust(U308);
    if(before308<20000) addCardDust(U308,20000-before308,'Восстановление прогресса после отката 18.08.2026');
    restoreQuick5();

    restore39Streaks();

    if(tableExists('hero_materials')) {
      db.prepare(`INSERT INTO hero_materials(user_id,material_key,quantity) VALUES(?,?,5)
        ON CONFLICT(user_id,material_key) DO UPDATE SET quantity=MAX(hero_materials.quantity,5),updated_at=CURRENT_TIMESTAMP`).run(U695,'beast_hide');
    }
    ensureInventory(U695,{
      key:'manual_legendary_spear_1400',name:'Легендарное копьё',type:'equipment',rarity:'legendary',
      description:'Легендарное копьё Караванщика стоимостью 1400 GS Dust.',slot:'melee',bonuses:{},
      lore:'Восстановлено после потери прогресса.'
    });
    // Это новая миграция: возвращаем заявленные 3000 Dust ровно один раз.
    addCardDust(U695,3000,'Ручное восстановление после потери прогресса');

    restoreWolf();

    ensureInventory(U506,{
      key:'caravan_backpack_1081',name:'Рунный Сумка Тихой тени',type:'backpack',rarity:'mythic',
      description:'Редкий товар странствующего Караванщика: рунный сумка тихой тени.',slot:'backpack',
      bonuses:{expedition_success:7,rare_find:5},
      lore:'Эта вещь прошла множество земель, прежде чем оказаться у ворот Гильдии.'
    });

    db.prepare(`INSERT INTO gs_one_time_migrations(migration_key) VALUES(?)`).run(KEY);
    return {dust308:getCardDust(U308),restored:true};
  })();
  console.log('[V20.4.2 Durable Player Restores]',JSON.stringify(report));
  return {applied:true,...report};
}
module.exports={applyDurablePlayerRestoresV2042};
