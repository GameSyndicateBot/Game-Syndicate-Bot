'use strict';

const { db, addCardDust } = require('../database/db');

const MIGRATION_KEY = 'v19.6.2-extra-expedition-recovery-759026090038657034-20260729';

function tableColumns(table) {
  try { return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(x => x.name)); }
  catch (_) { return new Set(); }
}

function addMaterial(userId, key, quantity) {
  db.exec(`CREATE TABLE IF NOT EXISTS hero_materials(
    user_id TEXT NOT NULL, material_key TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id,material_key)
  )`);
  db.prepare(`INSERT INTO hero_materials(user_id,material_key,quantity,updated_at)
    VALUES(?,?,?,CURRENT_TIMESTAMP)
    ON CONFLICT(user_id,material_key) DO UPDATE SET quantity=quantity+excluded.quantity,updated_at=CURRENT_TIMESTAMP`)
    .run(String(userId), key, Number(quantity));
}

function addEightHourShadowlandsExpedition(userId) {
  const uid = String(userId);
  const exists = db.prepare(`SELECT 1 FROM hero_expeditions WHERE user_id=? AND location_key='void_02'
    AND result_json LIKE '%v19.6.2 extra 8h backup recovery%' LIMIT 1`).get(uid);
  if (exists) return false;

  const hero = db.prepare('SELECT * FROM heroes WHERE user_id=?').get(uid);
  if (!hero) return false;
  const classKey = hero.class_key || 'warrior';
  const now = new Date();
  const started = new Date(now.getTime() - 8 * 60 * 60 * 1000).toISOString();

  const result = {
    outcome: 'success', chance: 100, roll: 1,
    event: 'Экспедиция восстановлена после отсутствующего резервного сохранения.',
    xp: 160, classXp: 100, classKey, classLevel: 1, dust: 400, reputation: 20,
    materials: [{ key: 'void_crystal', name: 'Кристалл Пустоты', icon: '🔮', quantity: 4 }],
    tactic: { key: 'balanced', icon: '⚖️', name: 'Сбалансированно' },
    recoveryNote: 'v19.6.2 extra 8h backup recovery'
  };

  const cols = tableColumns('hero_expeditions');
  const names = ['user_id','location_key','status','started_at','returns_at','resolved_at','result_json'];
  const vals = [uid,'void_02','resolved',started,now.toISOString(),now.toISOString(),JSON.stringify(result)];
  for (const [name,val] of [['class_key',classKey],['duration_hours',8],['tactic_key','balanced'],['success_chance',100],['hp_after',hero.hp]]) {
    if (cols.has(name)) { names.push(name); vals.push(val); }
  }

  db.prepare(`INSERT INTO hero_expeditions(${names.join(',')}) VALUES(${names.map(()=>'?').join(',')})`).run(...vals);
  db.prepare('UPDATE heroes SET xp=COALESCE(xp,0)+160, updated_at=CURRENT_TIMESTAMP WHERE user_id=?').run(uid);
  db.prepare(`INSERT INTO hero_class_progress(user_id,class_key,level,xp,expeditions_completed,updated_at)
    VALUES(?,?,1,100,1,CURRENT_TIMESTAMP)
    ON CONFLICT(user_id,class_key) DO UPDATE SET xp=xp+100,expeditions_completed=expeditions_completed+1,updated_at=CURRENT_TIMESTAMP`)
    .run(uid,classKey);
  addCardDust(uid,400,'V19.6.2: восстановленная 8-часовая экспедиция — Земли Теней');
  addMaterial(uid,'void_crystal',4);
  return true;
}

function applyTargetedRecoveryV1962Extra() {
  db.exec(`CREATE TABLE IF NOT EXISTS gs_one_time_migrations(
    migration_key TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  if (db.prepare('SELECT 1 FROM gs_one_time_migrations WHERE migration_key=?').get(MIGRATION_KEY)) return { applied: false };

  const expedition = db.transaction(() => {
    const added = addEightHourShadowlandsExpedition('759026090038657034');
    db.prepare('INSERT INTO gs_one_time_migrations(migration_key) VALUES(?)').run(MIGRATION_KEY);
    return added;
  })();

  console.log('[V19.6.2 Extra] 8h Shadowlands expedition recovery:', expedition);
  return { applied: true, expedition };
}

module.exports = { applyTargetedRecoveryV1962Extra };
