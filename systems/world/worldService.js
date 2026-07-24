const crypto = require('crypto');
const { db } = require('../../database/db');
const { WORLD_REGIONS, WORLD_EVENTS, CONTRACT_TEMPLATES } = require('./worldData');

function dateKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone:'Europe/Moscow', year:'numeric', month:'2-digit', day:'2-digit' }).format(date);
}
function hash(text) { return parseInt(crypto.createHash('sha256').update(String(text)).digest('hex').slice(0, 10), 16); }
function stageForReputation(rep) { return Math.max(1, Math.min(5, Math.floor(Number(rep || 0) / 1000) + 1)); }
function nextThreshold(stage) { return Math.max(1, Number(stage || 1)) * 1000; }

function cleanupExpiredBuffs(guildId='global') {
  db.prepare("DELETE FROM world_region_buffs WHERE guild_id=? AND datetime(expires_at)<=datetime('now')").run(guildId);
}

function ensureWorld(guildId = 'global') {
  const insert = db.prepare(`INSERT OR IGNORE INTO world_regions
    (guild_id, region_key, reputation, stage, discovered, active_event_key, event_date_key, last_activity_at)
    VALUES (?, ?, 0, 1, ?, 'calm', ?, CURRENT_TIMESTAMP)`);
  const today = dateKey();
  db.transaction(() => {
    for (const region of Object.values(WORLD_REGIONS)) insert.run(guildId, region.key, region.unlockStage <= 1 ? 1 : 0, today);
  })();
  cleanupExpiredBuffs(guildId);
  rotateDailyState(guildId);
  ensureDailyContracts(guildId);
}

function rotateDailyState(guildId = 'global') {
  const today = dateKey();
  const rows = db.prepare('SELECT * FROM world_regions WHERE guild_id=?').all(guildId);
  const events = Object.keys(WORLD_EVENTS);
  const update = db.prepare('UPDATE world_regions SET active_event_key=?, event_date_key=? WHERE guild_id=? AND region_key=?');
  for (const row of rows) {
    if (row.event_date_key === today) continue;
    const idx = hash(`${guildId}:${row.region_key}:${today}`) % events.length;
    update.run(events[idx], today, guildId, row.region_key);
  }
}

function ensureDailyContracts(guildId = 'global') {
  const today = dateKey();
  const rows = db.prepare('SELECT region_key FROM world_regions WHERE guild_id=? AND discovered=1').all(guildId);
  const insert = db.prepare(`INSERT OR IGNORE INTO world_contracts
    (guild_id, date_key, region_key, contract_key, type, title, icon, target, progress, reward_text, completed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0)`);
  db.transaction(() => {
    for (const { region_key } of rows) {
      const seed = hash(`${guildId}:${region_key}:${today}:contract`);
      const template = CONTRACT_TEMPLATES[seed % CONTRACT_TEMPLATES.length];
      const target = template.targets[Math.floor(seed / 7) % template.targets.length];
      insert.run(guildId, today, region_key, `${region_key}:${today}:${template.type}`, template.type, template.title, template.icon, target, template.reward);
    }
  })();
}

function getActiveBuffs(guildId='global', regionKey=null) {
  cleanupExpiredBuffs(guildId);
  const sql = regionKey
    ? "SELECT * FROM world_region_buffs WHERE guild_id=? AND region_key=? AND datetime(expires_at)>datetime('now') ORDER BY expires_at"
    : "SELECT * FROM world_region_buffs WHERE guild_id=? AND datetime(expires_at)>datetime('now') ORDER BY region_key,expires_at";
  return regionKey ? db.prepare(sql).all(guildId, regionKey) : db.prepare(sql).all(guildId);
}

function activateContractReward(guildId, regionKey, contract) {
  const template = CONTRACT_TEMPLATES.find(t => t.type === contract.type);
  if (!template) return null;
  const expiresAt = new Date(Date.now() + 24 * 3600000).toISOString();
  const sourceKey = `contract:${contract.id}`;
  db.prepare(`INSERT INTO world_region_buffs(guild_id,region_key,buff_key,source_key,value,description,expires_at)
    VALUES(?,?,?,?,?,?,?) ON CONFLICT(guild_id,region_key,buff_key,source_key)
    DO UPDATE SET value=excluded.value,description=excluded.description,expires_at=excluded.expires_at`)
    .run(guildId, regionKey, template.rewardKey, sourceKey, template.rewardValue, template.reward, expiresAt);
  return { key:template.rewardKey, value:template.rewardValue, description:template.reward, expiresAt };
}

function getRegionEffects(guildId='global', regionKey) {
  ensureWorld(guildId);
  const row = db.prepare('SELECT active_event_key FROM world_regions WHERE guild_id=? AND region_key=?').get(guildId,regionKey);
  const event = WORLD_EVENTS[row?.active_event_key] || WORLD_EVENTS.calm;
  const effects = {
    success:Number(event.success||0), xp:Number(event.xp||1), dust:Number(event.dust||1),
    materials:Number(event.materials||1), rare:Number(event.rare||0), incident:Number(event.incident||0),
    event, buffs:getActiveBuffs(guildId,regionKey), specialNpc:false,
  };
  for (const buff of effects.buffs) {
    if (buff.buff_key === 'success') effects.success += Number(buff.value||0);
    else if (buff.buff_key === 'xp') effects.xp *= Number(buff.value||1);
    else if (buff.buff_key === 'dust') effects.dust *= Number(buff.value||1);
    else if (buff.buff_key === 'materials') effects.materials *= Number(buff.value||1);
    else if (buff.buff_key === 'rare') effects.rare += Number(buff.value||0);
    else if (buff.buff_key === 'incident') effects.incident += Number(buff.value||0);
    else if (buff.buff_key === 'special_npc') { effects.specialNpc=true; effects.rare += 8; effects.dust *= 1.10; }
  }
  return effects;
}

function getWorld(guildId = 'global') {
  ensureWorld(guildId);
  const rows = db.prepare('SELECT * FROM world_regions WHERE guild_id=? ORDER BY discovered DESC, stage DESC, region_key').all(guildId);
  return rows.map(row => {
    const data = WORLD_REGIONS[row.region_key] || { key:row.region_key, icon:'🗺️', name:row.region_key, danger:1, resources:[] };
    const stage = stageForReputation(row.reputation);
    const event = WORLD_EVENTS[row.active_event_key] || WORLD_EVENTS.calm;
    return { ...row, ...data, stage, event, buffs:getActiveBuffs(guildId,row.region_key), nextThreshold:nextThreshold(stage) };
  });
}
function getRegion(guildId, regionKey) { return getWorld(guildId).find(r => r.region_key === regionKey || r.key === regionKey) || null; }
function getContracts(guildId = 'global', regionKey = null) {
  ensureWorld(guildId);
  const sql = regionKey ? 'SELECT * FROM world_contracts WHERE guild_id=? AND date_key=? AND region_key=? ORDER BY id' : 'SELECT * FROM world_contracts WHERE guild_id=? AND date_key=? ORDER BY region_key,id';
  return regionKey ? db.prepare(sql).all(guildId,dateKey(),regionKey) : db.prepare(sql).all(guildId,dateKey());
}
function maybeUnlockRegions(guildId) {
  const total = db.prepare('SELECT COALESCE(SUM(reputation),0) total FROM world_regions WHERE guild_id=?').get(guildId).total;
  const worldStage = Math.max(1,Math.min(5,Math.floor(total/2500)+1));
  const unlock = db.prepare('UPDATE world_regions SET discovered=1 WHERE guild_id=? AND region_key=?');
  for (const region of Object.values(WORLD_REGIONS)) if (region.unlockStage<=worldStage) unlock.run(guildId,region.key);
  return { total,worldStage };
}
function progressContract(guildId,regionKey,type,amount) {
  if (!amount) return null;
  const row=db.prepare('SELECT * FROM world_contracts WHERE guild_id=? AND date_key=? AND region_key=? AND type=?').get(guildId,dateKey(),regionKey,type);
  if (!row || row.completed) return null;
  const progress=Math.min(row.target,row.progress+Math.max(0,Math.floor(amount)));
  const completed=progress>=row.target;
  db.prepare("UPDATE world_contracts SET progress=?,completed=?,completed_at=CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE completed_at END WHERE id=?").run(progress,completed?1:0,completed?1:0,row.id);
  if (!completed) return null;
  return { contract:{...row,progress,completed:1}, reward:activateContractReward(guildId,regionKey,row) };
}
function applyExpeditionResult(guildId='global',location,result={}) {
  ensureWorld(guildId);
  const regionKey=location?.region;
  if (!regionKey || !WORLD_REGIONS[regionKey]) return null;
  const success=result.outcome==='success'||result.outcome==='great';
  const event=getRegion(guildId,regionKey)?.event||WORLD_EVENTS.calm;
  let gain=result.outcome==='great'?8:result.outcome==='success'?5:result.outcome==='partial'?2:1;
  gain+=Math.max(0,Number(event.reputation||1)-1);
  const materialCount=(result.materials||[]).reduce((a,m)=>a+Number(m.quantity||0),0);
  db.prepare(`UPDATE world_regions SET reputation=reputation+?,expeditions=expeditions+1,successes=successes+?,materials_collected=materials_collected+?,last_activity_at=CURRENT_TIMESTAMP WHERE guild_id=? AND region_key=?`)
    .run(gain,success?1:0,materialCount,guildId,regionKey);
  const completedContracts=[
    progressContract(guildId,regionKey,'expeditions',1),
    progressContract(guildId,regionKey,'successes',success?1:0),
    progressContract(guildId,regionKey,'materials',materialCount),
    progressContract(guildId,regionKey,'reputation',gain),
  ].filter(Boolean);
  const state=maybeUnlockRegions(guildId);
  return { regionKey,reputationGain:gain,worldStage:state.worldStage,completedContracts,effects:getRegionEffects(guildId,regionKey) };
}
function getWorldProgress(guildId='global') {
  ensureWorld(guildId);
  const rows=db.prepare('SELECT reputation,discovered FROM world_regions WHERE guild_id=?').all(guildId);
  const total=rows.reduce((a,r)=>a+Number(r.reputation||0),0), discovered=rows.filter(r=>r.discovered).length;
  return { total,discovered,totalRegions:Object.keys(WORLD_REGIONS).length,percent:Math.min(100,Math.round(discovered/Object.keys(WORLD_REGIONS).length*100)) };
}
module.exports={ dateKey,ensureWorld,getWorld,getRegion,getContracts,getActiveBuffs,getRegionEffects,applyExpeditionResult,getWorldProgress,stageForReputation };
