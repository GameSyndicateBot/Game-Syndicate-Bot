'use strict';

const { db, addCardDust } = require('../database/db');

const MIGRATION_KEY = 'v19.6.2-targeted-player-recovery-20260729';

function tableColumns(table) {
  try { return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(x => x.name)); }
  catch (_) { return new Set(); }
}

function resolvePlayerIdByName(name) {
  const exact = db.prepare('SELECT user_id FROM players WHERE LOWER(username)=LOWER(?) LIMIT 1').get(name);
  if (exact?.user_id) return String(exact.user_id);
  const fuzzy = db.prepare('SELECT user_id FROM players WHERE LOWER(username) LIKE LOWER(?) ORDER BY LENGTH(username) ASC LIMIT 1').get(`%${name}%`);
  return fuzzy?.user_id ? String(fuzzy.user_id) : null;
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

function addSyntheticExpedition(userId) {
  const uid = String(userId);
  const exists = db.prepare(`SELECT 1 FROM hero_expeditions WHERE user_id=? AND location_key='void_02'
    AND result_json LIKE '%v19.6.2 backup recovery%' LIMIT 1`).get(uid);
  if (exists) return false;

  const hero = db.prepare('SELECT * FROM heroes WHERE user_id=?').get(uid);
  if (!hero) return false;
  const classKey = hero.class_key || 'warrior';
  const now = new Date();
  const started = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const result = {
    outcome:'success', chance:100, roll:1,
    event:'Экспедиция восстановлена после отсутствующего резервного сохранения.',
    xp:40, classXp:25, classKey, classLevel:1, dust:100, reputation:5,
    materials:[{key:'void_crystal',name:'Кристалл Пустоты',icon:'🔮',quantity:1}],
    tactic:{key:'balanced',icon:'⚖️',name:'Сбалансированно'},
    recoveryNote:'v19.6.2 backup recovery'
  };

  const cols = tableColumns('hero_expeditions');
  const names=['user_id','location_key','status','started_at','returns_at','resolved_at','result_json'];
  const vals=[uid,'void_02','resolved',started,now.toISOString(),now.toISOString(),JSON.stringify(result)];
  for (const [name,val] of [['class_key',classKey],['duration_hours',2],['tactic_key','balanced'],['success_chance',100],['hp_after',hero.hp]]) {
    if (cols.has(name)) { names.push(name); vals.push(val); }
  }
  db.prepare(`INSERT INTO hero_expeditions(${names.join(',')}) VALUES(${names.map(()=>'?').join(',')})`).run(...vals);
  db.prepare('UPDATE heroes SET xp=COALESCE(xp,0)+40, updated_at=CURRENT_TIMESTAMP WHERE user_id=?').run(uid);
  db.prepare(`INSERT INTO hero_class_progress(user_id,class_key,level,xp,expeditions_completed,updated_at)
    VALUES(?,?,1,25,1,CURRENT_TIMESTAMP)
    ON CONFLICT(user_id,class_key) DO UPDATE SET xp=xp+25,expeditions_completed=expeditions_completed+1,updated_at=CURRENT_TIMESTAMP`)
    .run(uid,classKey);
  addCardDust(uid,100,'V19.6.2: восстановленная экспедиция — Земли Теней');
  addMaterial(uid,'void_crystal',1);
  return true;
}

function addBossParticipationForScreenshotUsers() {
  db.exec(`CREATE TABLE IF NOT EXISTS world_boss_battles(
    id INTEGER PRIMARY KEY AUTOINCREMENT, quick_round_id INTEGER, channel_id TEXT NOT NULL, message_id TEXT,
    boss_card_id INTEGER NOT NULL, boss_name TEXT NOT NULL, boss_hp INTEGER NOT NULL, boss_max_hp INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'registration', round_no INTEGER NOT NULL DEFAULT 0, turn_index INTEGER NOT NULL DEFAULT 0,
    turn_deadline INTEGER, registration_ends_at INTEGER, state_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, ended_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS world_boss_players(
    battle_id INTEGER NOT NULL,user_id TEXT NOT NULL,hero_name TEXT,hero_level INTEGER DEFAULT 1,hero_snapshot_json TEXT DEFAULT '{}',class_key TEXT,
    initiative INTEGER DEFAULT 0,hp INTEGER DEFAULT 0,max_hp INTEGER DEFAULT 0,energy INTEGER DEFAULT 0,mana INTEGER DEFAULT 0,ult_charge INTEGER DEFAULT 0,
    damage_done INTEGER DEFAULT 0,healing_done INTEGER DEFAULT 0,damage_taken INTEGER DEFAULT 0,contribution INTEGER DEFAULT 0,status TEXT DEFAULT 'alive',
    effects_json TEXT DEFAULT '{}',summons_json TEXT DEFAULT '[]',joined_at INTEGER NOT NULL,PRIMARY KEY(battle_id,user_id)
  )`);
  const markerName='Восстановленная битва V19.6.2';
  let battle=db.prepare('SELECT id FROM world_boss_battles WHERE boss_name=? LIMIT 1').get(markerName);
  if (!battle) {
    const now=Date.now();
    const res=db.prepare(`INSERT INTO world_boss_battles(channel_id,boss_card_id,boss_name,boss_hp,boss_max_hp,status,state_json,created_at,ended_at)
      VALUES('recovery',0,?,0,1,'won','{"recovery":"v19.6.2"}',?,?)`).run(markerName,now,now);
    battle={id:Number(res.lastInsertRowid)};
  }
  const names=['Сварщик','Нела (Оля)','13','Флорочка(Киришечка)','Кусь (Анфиска)','ДЕППЕЦ','Nelochka','NonF','uroshima','Pupochek'];
  const insert=db.prepare(`INSERT OR IGNORE INTO world_boss_players(battle_id,user_id,hero_name,joined_at,status)
    VALUES(?,?,?,?, 'alive')`);
  let added=0;
  for (const name of names) {
    const uid=resolvePlayerIdByName(name);
    if (!uid) { console.warn(`[V19.6.2] Не найден Discord игрок для boss recovery: ${name}`); continue; }
    const hero=db.prepare('SELECT name FROM heroes WHERE user_id=?').get(uid);
    added += Number(insert.run(battle.id,uid,hero?.name || name,Date.now()).changes || 0);
  }
  return added;
}

function applyTargetedRecoveryV1962() {
  db.exec(`CREATE TABLE IF NOT EXISTS gs_one_time_migrations(
    migration_key TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  if (db.prepare('SELECT 1 FROM gs_one_time_migrations WHERE migration_key=?').get(MIGRATION_KEY)) return {applied:false};

  const result=db.transaction(()=>{
    // Удаляем именно экземпляр #12 Изумрудного Костяного коня.
    const mountRemoved=db.prepare(`DELETE FROM hero_companions
      WHERE user_id=? AND id=? AND LOWER(name)=LOWER(?)`)
      .run('468683569359880192',12,'Изумрудный Костяной конь').changes;

    addMaterial('317166633619816450','board',7);
    addMaterial('317166633619816450','iron_ingot',7);

    const expeditionA=addSyntheticExpedition('561961056197672991');
    const expeditionB=addSyntheticExpedition('317166633619816450');
    const bossParticipants=addBossParticipationForScreenshotUsers();

    db.prepare('INSERT INTO gs_one_time_migrations(migration_key) VALUES(?)').run(MIGRATION_KEY);
    return {mountRemoved,expeditionA,expeditionB,bossParticipants};
  })();
  console.log('[V19.6.2] Targeted recovery completed:',result);
  return {applied:true,...result};
}

module.exports={applyTargetedRecoveryV1962};
