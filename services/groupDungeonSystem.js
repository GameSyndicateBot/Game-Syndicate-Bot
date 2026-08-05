const crypto = require('crypto');
'use strict';

const {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
  StringSelectMenuBuilder, ChannelType, PermissionFlagsBits, AttachmentBuilder,
} = require('discord.js');
const { db, addCardDust } = require('../database/db');
const { getHero } = require('../systems/hero/heroService');
const { getClassProgress, grantClassXp, normalizeClassKey } = require('../systems/hero/classProgressService');
const { buildHeroSnapshot } = require('./worldBoss/heroIntegration');
const { getEffectiveHero, getEquipmentBonuses } = require('../systems/hero/itemService');
const path = require('path');
const { checkAchievementsForUsers } = require('../utils/checkAchievementsForUser');

const DUNGEON_IMAGE_DIR=path.join(__dirname,'..','assets','dungeons');
function dungeonHubImage(date=new Date()){const w=currentWindow(date);const key=w?.key||'closed';return {name:`dungeon-hub-${key}.jpg`,path:path.join(DUNGEON_IMAGE_DIR,`dungeon-hub-${key}.jpg`)};}

const TZ = 'Europe/Moscow';
const MIN_PLAYERS = 2;
const PREFERRED_MIN_PLAYERS = 4;
const MAX_PLAYERS = 6;
const RAID_DURATION_MS = 50 * 60 * 1000;
const WINDOWS = [{ startH: 11, startM: 0, closeH: 11, closeM: 59, processH: 12, processM: 0, key: 'day' }, { startH: 18, startM: 0, closeH: 18, closeM: 59, processH: 19, processM: 0, key: 'evening' }];
const TANKS = new Set(['warrior','paladin','guardian']);
const HEALERS = new Set(['cleric','priest','druid','shaman']);
const CONTROL = new Set(['mage','mind_lord','illusionist','chronomancer','bard','shaman']);
const CLASS_LABELS = {
  warrior:'Воин',paladin:'Паладин',guardian:'Страж',berserker:'Берсерк',assassin:'Ассасин',archer:'Лучник',engineer:'Инженер',mage:'Маг',necromancer:'Некромант',cleric:'Клирик',priest:'Жрец',bard:'Бард',pyromancer:'Пиромант',duelist:'Дуэлянт',reaper:'Жнец',mind_lord:'Повелитель Разума',druid:'Друид',shaman:'Шаман',chronomancer:'Хрономант',illusionist:'Иллюзионист'
};
const DUNGEONS = [
'Забытая шахта','Катакомбы Короля','Башня Архимага','Лес Духов','Крепость Ледяного Ордена','Гнездо Пауков','Болото Ведьм','Лабиринт Некроманта','Огненная Кузница','Пещера Драконов',
'Затонувший храм','Цитадель Пепла','Склеп Безымянных','Обитель Бездны','Хрустальные пещеры','Тюрьма Теней','Руины Часовщика','Зал Тысячи Масок','Гробница Великана','Канализация Алхимика',
'Чернильный монастырь','Логово Мантикоры','Крепость Бурь','Подземный Колизей','Сады Ядов','Колодец Душ','Костяной дворец','Проклятая библиотека','Кузница Големов','Пределы Мороза',
'Осквернённая часовня','Лабиринт Минотавра','Гнездо Гарпий','Пещеры Эха','Замок Вампира','Шахты Кобольдов','Усыпальница Оракула','Храм Грозы','Бастион Хаоса','Зеркальные чертоги',
'Пустынный некрополь','Подземный порт','Сердце Вулкана','Ледяной разлом','Собор Падших','Тоннели Чумы','Арена Древних','Крепость Воронов','Зал Последней Клятвы','Тронный зал Бездны'
];
const DIFFICULTIES = [
  {key:'normal',name:'Обычная',icon:'🟢',weight:40,base:55,reward:1},
  {key:'dangerous',name:'Опасная',icon:'🔵',weight:30,base:45,reward:1.25},
  {key:'heroic',name:'Героическая',icon:'🟣',weight:18,base:35,reward:1.6},
  {key:'epic',name:'Эпическая',icon:'🟠',weight:9,base:25,reward:2.1},
  {key:'legendary',name:'Легендарная',icon:'🔴',weight:3,base:15,reward:3}
];

function nowMoscowParts(date=new Date()) { const f=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}); return Object.fromEntries(f.formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)])); }
function currentWindow(date=new Date()) { const p=nowMoscowParts(date); const mins=p.hour*60+p.minute; return WINDOWS.find(w=>mins>=w.startH*60+w.startM && mins<=w.closeH*60+w.closeM)||null; }
function canStartNow(){ return false; }
function windowLabel(w){return w?.key==='day'?'🌞 запись 11:00–12:00 МСК':'🌙 запись 18:00–19:00 МСК';}
function windowContext(date=new Date()){const w=currentWindow(date);if(!w)return null;const p=nowMoscowParts(date);const day=`${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;return {window:w,key:`${day}:${w.key}`,day};}
function weightedPick(items){let r=Math.random()*items.reduce((s,x)=>s+x.weight,0);for(const x of items){r-=x.weight;if(r<=0)return x;}return items[0];}
function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
function fmtTs(ms,style='R'){return `<t:${Math.floor(ms/1000)}:${style}>`;}

function ensureSchema(){ db.exec(`
CREATE TABLE IF NOT EXISTS dungeon_config(guild_id TEXT PRIMARY KEY,channel_id TEXT,hub_message_id TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS dungeon_groups(id INTEGER PRIMARY KEY AUTOINCREMENT,guild_id TEXT NOT NULL,leader_id TEXT NOT NULL,name TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'forming',dungeon_name TEXT,difficulty_key TEXT,difficulty_name TEXT,difficulty_icon TEXT,base_chance REAL DEFAULT 0,success_chance REAL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,started_at TEXT,ends_at TEXT,resolved_at TEXT,success INTEGER,result_json TEXT);
CREATE TABLE IF NOT EXISTS dungeon_members(group_id INTEGER NOT NULL,user_id TEXT NOT NULL,class_key TEXT NOT NULL,hero_snapshot_json TEXT,joined_at TEXT DEFAULT CURRENT_TIMESTAMP,reward_claimed INTEGER DEFAULT 0,PRIMARY KEY(group_id,user_id));
CREATE TABLE IF NOT EXISTS dungeon_valuable_luck(user_id TEXT PRIMARY KEY,penalty REAL NOT NULL DEFAULT 0,last_valuable_at TEXT,updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS dungeon_window_spawns(guild_id TEXT NOT NULL,window_key TEXT NOT NULL,dungeon_name TEXT NOT NULL,difficulty_key TEXT NOT NULL,difficulty_name TEXT NOT NULL,difficulty_icon TEXT NOT NULL,base_chance REAL NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(guild_id,window_key));
CREATE TABLE IF NOT EXISTS dungeon_window_entries(guild_id TEXT NOT NULL,window_key TEXT NOT NULL,user_id TEXT NOT NULL,group_id INTEGER NOT NULL,entered_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(guild_id,window_key,user_id));
CREATE TABLE IF NOT EXISTS dungeon_reward_claims(guild_id TEXT NOT NULL,window_key TEXT NOT NULL,user_id TEXT NOT NULL,claimed_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(guild_id,window_key,user_id));
CREATE TABLE IF NOT EXISTS dungeon_help_xp_claims(guild_id TEXT NOT NULL,window_key TEXT NOT NULL,user_id TEXT NOT NULL,group_id INTEGER NOT NULL,class_xp INTEGER NOT NULL DEFAULT 0,claimed_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(guild_id,window_key,user_id,group_id));
CREATE INDEX IF NOT EXISTS idx_dungeon_help_xp_window_user ON dungeon_help_xp_claims(guild_id,window_key,user_id);
CREATE INDEX IF NOT EXISTS idx_dungeon_groups_status ON dungeon_groups(guild_id,status);
CREATE INDEX IF NOT EXISTS idx_dungeon_entries_group ON dungeon_window_entries(group_id);
CREATE TABLE IF NOT EXISTS dungeon_queue_entries(guild_id TEXT NOT NULL,window_key TEXT NOT NULL,user_id TEXT NOT NULL,class_key TEXT NOT NULL,role_pref TEXT NOT NULL,power INTEGER NOT NULL DEFAULT 0,joined_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(guild_id,window_key,user_id));
CREATE TABLE IF NOT EXISTS dungeon_window_processing(guild_id TEXT NOT NULL,window_key TEXT NOT NULL,processed_at TEXT DEFAULT CURRENT_TIMESTAMP,groups_created INTEGER NOT NULL DEFAULT 0,reserve_count INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild_id,window_key));
CREATE INDEX IF NOT EXISTS idx_dungeon_queue_window ON dungeon_queue_entries(guild_id,window_key,joined_at);
`);
 const cols=db.prepare('PRAGMA table_info(dungeon_groups)').all().map(x=>x.name);
 if(!cols.includes('window_key'))db.exec('ALTER TABLE dungeon_groups ADD COLUMN window_key TEXT');
}
ensureSchema();

function getConfig(guildId){return db.prepare('SELECT * FROM dungeon_config WHERE guild_id=?').get(guildId)||null;}
function setConfig(guildId,channelId,hubMessageId=null){db.prepare(`INSERT INTO dungeon_config(guild_id,channel_id,hub_message_id) VALUES(?,?,?) ON CONFLICT(guild_id) DO UPDATE SET channel_id=excluded.channel_id,hub_message_id=COALESCE(excluded.hub_message_id,dungeon_config.hub_message_id),updated_at=CURRENT_TIMESTAMP`).run(guildId,channelId,hubMessageId);}
function getGroup(id){return db.prepare('SELECT * FROM dungeon_groups WHERE id=?').get(id);}
function members(id){return db.prepare('SELECT * FROM dungeon_members WHERE group_id=? ORDER BY joined_at').all(id);}
function userActiveGroup(guildId,userId){return db.prepare(`SELECT g.* FROM dungeon_groups g JOIN dungeon_members m ON m.group_id=g.id WHERE g.guild_id=? AND m.user_id=? AND g.status IN ('forming','active') ORDER BY g.id DESC LIMIT 1`).get(guildId,userId);}
function getWindowSpawn(guildId,date=new Date()){
 const ctx=windowContext(date);if(!ctx)return null;
 let spawn=db.prepare('SELECT * FROM dungeon_window_spawns WHERE guild_id=? AND window_key=?').get(guildId,ctx.key);
 if(!spawn){
  const diff=weightedPick(DIFFICULTIES),dungeon=DUNGEONS[Math.floor(Math.random()*DUNGEONS.length)];
  db.prepare('INSERT OR IGNORE INTO dungeon_window_spawns(guild_id,window_key,dungeon_name,difficulty_key,difficulty_name,difficulty_icon,base_chance) VALUES(?,?,?,?,?,?,?)').run(guildId,ctx.key,dungeon,diff.key,diff.name,diff.icon,diff.base);
  spawn=db.prepare('SELECT * FROM dungeon_window_spawns WHERE guild_id=? AND window_key=?').get(guildId,ctx.key);
 }
 return {...spawn,window:ctx.window};
}
function usedWindow(guildId,userId,windowKey){return Boolean(db.prepare('SELECT 1 FROM dungeon_window_entries WHERE guild_id=? AND window_key=? AND user_id=?').get(guildId,windowKey,userId));}

function dungeonLoadout(userId,classKey){
 const hero=getHero(userId),key=normalizeClassKey(classKey||hero?.class_key);
 const effective=getEffectiveHero(hero,{classKey:key});
 const equipment=getEquipmentBonuses(userId,key)||{};
 const derived=effective?.derivedStats||{};
 const equipmentScore=Number(equipment.strength||0)+Number(equipment.defense||0)+Number(equipment.dexterity||0)+Number(equipment.intelligence||0)+Number(equipment.wisdom||0)+Number(equipment.vitality||0)+Number(equipment.luck||0);
 return {hero,effective,equipment,derived,equipmentScore};
}
function classPower(userId,classKey){ const p=getClassProgress(userId,classKey)||{level:1}; const l=dungeonLoadout(userId,classKey); const stats=l.effective||l.hero||{}; const raw=40+Number(l.hero?.level||1)*5+Number(p.level||1)*9+(Number(stats.strength||0)+Number(stats.defense||0)+Number(stats.dexterity||0)+Number(stats.intelligence||0)+Number(stats.wisdom||0)+Number(stats.vitality||0)+Number(stats.luck||0))*0.55+Math.min(12,Number(l.equipment.expedition_success||0)*0.7); return Math.round(raw); }
function analyze(groupId){ const g=getGroup(groupId); const ms=members(groupId); const diff=DIFFICULTIES.find(d=>d.key===g?.difficulty_key)||DIFFICULTIES[0]; const enriched=ms.map(m=>({...m,class_key:normalizeClassKey(m.class_key),power:classPower(m.user_id,m.class_key),level:Number(getClassProgress(m.user_id,m.class_key)?.level||1)})); const n=enriched.length; const tanks=enriched.filter(x=>TANKS.has(x.class_key)).length, heals=enriched.filter(x=>HEALERS.has(x.class_key)).length, controls=enriched.filter(x=>CONTROL.has(x.class_key)).length; const avgPower=n?enriched.reduce((s,x)=>s+x.power,0)/n:0; const avgGear=n?enriched.reduce((sum,x)=>sum+dungeonLoadout(x.user_id,x.class_key).equipmentScore,0)/n:0; let bonus=0; const lines=[]; const add=(label,v)=>{bonus+=v;lines.push(`${v>=0?'✅':'❌'} ${label}: ${v>=0?'+':''}${v}%`)};
 // Характеристики помогают, но больше не разгоняют шанс почти до гарантии.
 add(`Сила героев (${Math.round(avgPower)})`,clamp(Math.round((avgPower-120)/45),-4,4));
 add(`Надетая экипировка, артефакты и спутники (${Math.round(avgGear)} очк.)`,clamp(Math.round(avgGear/18),0,8));
 if(tanks>=1)add('Есть танк',5);else add('Нет танка',-8);
 if(heals>=1)add('Есть лекарь',5);else add('Нет лекаря',-8);
 if(controls>=1)add('Есть контроль / поддержка',2);
 if(n===2)add('Малый отряд (2 героя)',-20);
 else if(n===3)add('Малый отряд (3 героя)',-10);
 else if(n===5)add(`Собранный отряд (${n}/${MAX_PLAYERS})`,2);
 else if(n>=6)add(`Полная группа (${n}/${MAX_PLAYERS})`,3);
 // Максимальный положительный бонус — 20%: даже идеальная группа сохраняет риск.
 const positiveCap=20;
 if(bonus>positiveCap)bonus=positiveCap;
 const chance=clamp(Math.round(diff.base+bonus),5,diff.base+positiveCap); return {chance,base:diff.base,bonus,lines,tanks,heals,controls,avgPower:Math.round(avgPower),avgGear:Math.round(avgGear),members:enriched,difficulty:diff}; }

function queueEntry(guildId,userId,date=new Date()){const ctx=windowContext(date);if(!ctx)return null;return db.prepare('SELECT * FROM dungeon_queue_entries WHERE guild_id=? AND window_key=? AND user_id=?').get(guildId,ctx.key,userId)||null;}
function queueCount(guildId,date=new Date()){const ctx=windowContext(date);if(!ctx)return 0;return Number(db.prepare('SELECT COUNT(*) AS c FROM dungeon_queue_entries WHERE guild_id=? AND window_key=?').get(guildId,ctx.key)?.c||0);}
function roleForClass(key){key=normalizeClassKey(key);if(TANKS.has(key))return 'tank';if(HEALERS.has(key))return 'healer';if(CONTROL.has(key))return 'support';return 'dps';}
const ROLE_LABELS={tank:'🛡️ Танк',healer:'💚 Лекарь',dps:'⚔️ Урон',support:'🌀 Поддержка'};
function hubEmbed(guildId,imageUrl){
 const w=currentWindow(),spawn=w?getWindowSpawn(guildId):null,count=queueCount(guildId);
 const status=w?`🟢 **Запись открыта**\n${windowLabel(w)}\nДо распределения: **${w.key==='day'?'12:00':'19:00'} МСК**`:'🔒 **Запись закрыта**\nСледующее окно: 11:00–12:00 или 18:00–19:00 МСК';
 return new EmbedBuilder().setColor(w?0x7c3aed:0x312e81).setTitle('🏰 Подземелья Game Syndicate').setDescription(`${status}\n\n${spawn?`${spawn.difficulty_icon} **${spawn.dungeon_name}**\nСложность: **${spawn.difficulty_name}**\n`:''}\n👥 В очереди: **${count}**\n\nИгроки записываются независимо. В конце окна бот прежде всего формирует отряды по **4–6 человек**, балансируя танков, лекарей, поддержку, урон и общую силу. Отряд из 2–3 героев создаётся только когда полноценную группу собрать невозможно. Выбирать спутников вручную нельзя.`).addFields(
 {name:'⚙️ Как проходит запись',value:'Нажмите **«Записаться»**, затем выберите желаемую роль. Бот использует ваш текущий класс и проверяет, подходит ли он роли.',inline:false},
 {name:'🧩 Распределение',value:'Приоритет — полноценные группы с танком и лекарем. Затем выравнивается сила. При неоднозначности состав перемешивается случайно.',inline:false},
 {name:'⚠️ Малые отряды',value:'Приоритет всегда у групп 4–6. Если записалось только 2–3 игрока либо при распределении неизбежно остаётся тройка, бот всё равно запускает их, но с пониженным шансом прохождения.',inline:false}
 ).setImage(imageUrl).setFooter({text:'Общая очередь • автоматические группы • без ручного выбора игроков'});
}
function hubRows(){const open=Boolean(currentWindow());return [new ActionRowBuilder().addComponents(
 new ButtonBuilder().setCustomId('dng_queue_join').setLabel('Записаться').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(!open),
 new ButtonBuilder().setCustomId('dng_queue_my').setLabel('Моя запись').setEmoji('👤').setStyle(ButtonStyle.Primary).setDisabled(!open),
 new ButtonBuilder().setCustomId('dng_queue_leave').setLabel('Отменить запись').setEmoji('🚪').setStyle(ButtonStyle.Danger).setDisabled(!open),
 new ButtonBuilder().setCustomId('dng_active').setLabel('Активные рейды').setEmoji('🗺️').setStyle(ButtonStyle.Secondary)
),new ActionRowBuilder().addComponents(
 new ButtonBuilder().setCustomId('dng_history_open').setLabel('История').setEmoji('📜').setStyle(ButtonStyle.Secondary),
 new ButtonBuilder().setCustomId('dng_rules').setLabel('Правила').setEmoji('📖').setStyle(ButtonStyle.Secondary),
 new ButtonBuilder().setCustomId('dng_rewards').setLabel('Награды').setEmoji('🎁').setStyle(ButtonStyle.Secondary)
)];}

async function ensureHub(client,guildId=null){
 const guilds=guildId?[client.guilds.cache.get(guildId)].filter(Boolean):[...client.guilds.cache.values()];
 for(const guild of guilds){
  const cfg=getConfig(guild.id);
  if(!cfg?.channel_id)continue;
  const ch=await guild.channels.fetch(cfg.channel_id).catch(()=>null);
  if(!ch?.isTextBased())continue;
  let msg=cfg.hub_message_id?await ch.messages.fetch(cfg.hub_message_id).catch(()=>null):null;
  const image=dungeonHubImage();
  const existingImage=msg?.attachments?.find?.(a=>a.name===image.name);
  const payload={embeds:[hubEmbed(guild.id,existingImage?.url||`attachment://${image.name}`)],components:hubRows()};
  if(!existingImage)payload.files=[new AttachmentBuilder(image.path,{name:image.name})];
  if(msg)await msg.edit(payload).catch(e=>console.error('[Dungeon] hub edit',e));
  else {msg=await ch.send(payload);setConfig(guild.id,ch.id,msg.id);}
 }
}

async function setupChannel(interaction){ if(!interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) return interaction.reply({content:'Нужно право «Управление каналами».',ephemeral:true}); let ch=interaction.options.getChannel('channel'); if(!ch){ch=await interaction.guild.channels.create({name:'🏰｜данжи',type:ChannelType.GuildText,reason:'Хаб групповых данжей Game Syndicate'});} setConfig(interaction.guildId,ch.id,null); await interaction.reply({content:`✅ Канал данжей: ${ch}`,ephemeral:true}); await ensureHub(interaction.client,interaction.guildId); }

function groupEmbed(groupId, live=true){const g=getGroup(groupId),a=analyze(groupId),ms=a.members; const state=g.status==='forming'?'🟡 Собирается':g.status==='active'?'🟢 В данже':g.success===1?'✅ Пройден':'🔴 Провален'; const desc=[`**Статус:** ${state}`,`**Лидер:** <@${g.leader_id}>`,`**Подземелье:** ${g.dungeon_name||'будет выбрано при старте'}`,`**Сложность:** ${g.difficulty_icon||'🎲'} ${g.difficulty_name||'случайная'}`,g.status==='active'?`**Завершение:** ${fmtTs(Date.parse(g.ends_at))}`:`**Участников:** ${ms.length} / ${MAX_PLAYERS} (минимум ${MIN_PLAYERS})`,`**Шанс прохождения:** ${a.chance}%`,'',...ms.slice(0,20).map((m,i)=>`${i+1}. <@${m.user_id}> — **${CLASS_LABELS[m.class_key]||m.class_key}**, ур. ${m.level} • сила ${m.power}`)]; return new EmbedBuilder().setColor(g.status==='active'?0x22c55e:0xf59e0b).setTitle(`🏰 Группа #${g.id} — ${g.name}`).setDescription(desc.join('\n')).setFooter({text:live&&g.status==='forming'?'Процент обновляется при смене героя, класса и экипировки.':'Процент зафиксирован на момент старта.'});}
function groupRows(g,userId){const inGroup=members(g.id).some(m=>m.user_id===userId); const rows=[]; if(g.status==='forming'){rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`dng_join:${g.id}`).setLabel(inGroup?'Вы уже в группе':'Присоединиться').setEmoji('➕').setStyle(ButtonStyle.Success).setDisabled(inGroup),new ButtonBuilder().setCustomId(`dng_class:${g.id}`).setLabel('Выбрать класс').setEmoji('🧙').setStyle(ButtonStyle.Primary).setDisabled(!inGroup),new ButtonBuilder().setCustomId(`dng_analyze:${g.id}`).setLabel('Анализ группы').setEmoji('📊').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId(`dng_leave:${g.id}`).setLabel('Покинуть').setEmoji('🚪').setStyle(ButtonStyle.Danger).setDisabled(!inGroup))); if(g.leader_id===userId)rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`dng_start:${g.id}`).setLabel('Начать рейд').setEmoji('▶️').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`dng_disband:${g.id}`).setLabel('Распустить').setEmoji('🗑️').setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId(`dng_refresh:${g.id}`).setLabel('Обновить').setEmoji('🔄').setStyle(ButtonStyle.Secondary)));} return rows;}

async function ephemeral(interaction,payload){const p={...payload,ephemeral:true}; return interaction.replied||interaction.deferred?interaction.followUp(p):interaction.reply(p);}

function cleanupClosedFormingGroups(guildId=null){
 if(currentWindow()) return 0;
 const groups=guildId?db.prepare("SELECT id FROM dungeon_groups WHERE guild_id=? AND status='forming'").all(guildId):db.prepare("SELECT id FROM dungeon_groups WHERE status='forming'").all();
 if(!groups.length)return 0;
 const tx=db.transaction(()=>{for(const g of groups){db.prepare('DELETE FROM dungeon_members WHERE group_id=?').run(g.id);db.prepare("UPDATE dungeon_groups SET status='cancelled',resolved_at=CURRENT_TIMESTAMP WHERE id=? AND status='forming'").run(g.id);}});tx();return groups.length;
}
async function disband(interaction,id){const g=getGroup(id);if(!g||g.status!=='forming')return ephemeral(interaction,{content:'Эта группа уже недоступна.'});if(g.leader_id!==interaction.user.id)return ephemeral(interaction,{content:'Распустить группу может только её создатель.'});const tx=db.transaction(()=>{db.prepare('DELETE FROM dungeon_members WHERE group_id=?').run(id);db.prepare("UPDATE dungeon_groups SET status='cancelled',resolved_at=CURRENT_TIMESTAMP WHERE id=?").run(id);});tx();await interaction.update({content:'🗑️ Группа распущена. Все участники освобождены.',embeds:[],components:[]});return ensureHub(interaction.client,interaction.guildId);}

async function createGroup(interaction){
 const spawn=getWindowSpawn(interaction.guildId);if(!spawn)return ephemeral(interaction,{content:'Окно данжей сейчас закрыто.'});
 if(userActiveGroup(interaction.guildId,interaction.user.id))return ephemeral(interaction,{content:'Ваш герой уже находится в другой группе или данже.'});
 const hero=getHero(interaction.user.id);if(!hero)return ephemeral(interaction,{content:'Сначала создайте героя в Гильдии.'});
 const expedition=db.prepare("SELECT 1 FROM hero_expeditions WHERE user_id=? AND status='active' LIMIT 1").get(interaction.user.id);if(expedition||hero.status==='expedition')return ephemeral(interaction,{content:'❌ Герой находится в экспедиции и не может создавать группу подземелья.'});if(hero.status!=='ready')return ephemeral(interaction,{content:`❌ Герой сейчас занят: **${hero.status}**.`});
 const r=db.prepare(`INSERT INTO dungeon_groups(guild_id,leader_id,name,dungeon_name,difficulty_key,difficulty_name,difficulty_icon,base_chance,window_key) VALUES(?,?,?,?,?,?,?,?,?)`).run(interaction.guildId,interaction.user.id,`Отряд ${interaction.user.displayName||interaction.user.username}`,spawn.dungeon_name,spawn.difficulty_key,spawn.difficulty_name,spawn.difficulty_icon,spawn.base_chance,spawn.window_key);
 const classKey=normalizeClassKey(hero.class_key);db.prepare('INSERT INTO dungeon_members(group_id,user_id,class_key,hero_snapshot_json) VALUES(?,?,?,?)').run(r.lastInsertRowid,interaction.user.id,classKey,JSON.stringify(buildHeroSnapshot(interaction.user.id)||{}));
 const g=getGroup(r.lastInsertRowid);await interaction.reply({embeds:[groupEmbed(g.id)],components:groupRows(g,interaction.user.id),ephemeral:true});await ensureHub(interaction.client,interaction.guildId);
}
async function listGroups(interaction,statuses=['forming']){cleanupClosedFormingGroups(interaction.guildId);const qs=statuses.map(()=>'?').join(',');const rows=db.prepare(`SELECT * FROM dungeon_groups WHERE guild_id=? AND status IN (${qs}) ORDER BY id DESC LIMIT 15`).all(interaction.guildId,...statuses); if(!rows.length)return ephemeral(interaction,{content:'Подходящих групп сейчас нет.'}); const text=rows.map(g=>{const c=members(g.id).length;const a=analyze(g.id);return `**#${g.id} ${g.name}** — ${g.status==='active'?'🟢 идёт':'🟡 сбор'}\n${g.difficulty_icon} ${g.dungeon_name} • 👥 ${c} • 📊 ${g.status==='active'?Math.round(g.success_chance):a.chance}%${g.status==='active'?` • ⏳ ${fmtTs(Date.parse(g.ends_at))}`:''}`}).join('\n\n'); const opts=rows.map(g=>({label:`#${g.id} ${g.name}`.slice(0,100),description:`${g.dungeon_name} • ${members(g.id).length} участников`.slice(0,100),value:String(g.id)})); return ephemeral(interaction,{embeds:[new EmbedBuilder().setColor(0x6d28d9).setTitle(statuses.includes('active')?'🗺️ Активные рейды':'🔎 Группы, которые собираются').setDescription(text)],components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('dng_open_group').setPlaceholder('Открыть группу').addOptions(opts))]});}
async function openGroup(interaction,id){const g=getGroup(id);if(!g)return ephemeral(interaction,{content:'Группа не найдена.'});return interaction.update({embeds:[groupEmbed(id,g.status==='forming')],components:groupRows(g,interaction.user.id)});}
async function join(interaction,id){
 const g=getGroup(id);if(!g||g.status!=='forming')return ephemeral(interaction,{content:'Эта группа уже недоступна.'});
 if(members(id).length>=MAX_PLAYERS)return ephemeral(interaction,{content:`В этой группе уже максимум участников: **${MAX_PLAYERS}**.`});
 const ctx=windowContext();if(!ctx||g.window_key!==ctx.key)return ephemeral(interaction,{content:'Окно этой группы уже завершилось. Создайте новую группу в актуальное окно.'});
 
 if(userActiveGroup(interaction.guildId,interaction.user.id))return ephemeral(interaction,{content:'Вы уже состоите в активной группе.'});
 const hero=getHero(interaction.user.id);if(!hero)return ephemeral(interaction,{content:'Сначала создайте героя.'});const expedition=db.prepare("SELECT 1 FROM hero_expeditions WHERE user_id=? AND status='active' LIMIT 1").get(interaction.user.id);if(expedition||hero.status==='expedition')return ephemeral(interaction,{content:'❌ Герой находится в экспедиции и не может вступить в группу подземелья.'});if(hero.status!=='ready')return ephemeral(interaction,{content:`❌ Герой сейчас занят: **${hero.status}**.`});
 db.prepare('INSERT OR IGNORE INTO dungeon_members(group_id,user_id,class_key,hero_snapshot_json) VALUES(?,?,?,?)').run(id,interaction.user.id,normalizeClassKey(hero.class_key),JSON.stringify(buildHeroSnapshot(interaction.user.id)||{}));const ng=getGroup(id);return interaction.update({embeds:[groupEmbed(id)],components:groupRows(ng,interaction.user.id)});
}
async function classMenu(interaction,id){const all=Object.entries(CLASS_LABELS).slice(0,25).map(([value,label])=>({label,value}));return ephemeral(interaction,{content:'Выберите класс для этого рейда. Уровень и экипировка будут взяты из общего прогресса героя.',components:[new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`dng_set_class:${id}`).setPlaceholder('Класс героя').addOptions(all))]});}
async function setClass(interaction,id,key){const g=getGroup(id);if(!g||g.status!=='forming')return interaction.update({content:'Группа уже стартовала.',components:[]});const row=db.prepare('SELECT 1 FROM dungeon_members WHERE group_id=? AND user_id=?').get(id,interaction.user.id);if(!row)return interaction.update({content:'Вы не состоите в этой группе.',components:[]});db.prepare('UPDATE dungeon_members SET class_key=?,hero_snapshot_json=? WHERE group_id=? AND user_id=?').run(normalizeClassKey(key),JSON.stringify(buildHeroSnapshot(interaction.user.id)||{}),id,interaction.user.id);return interaction.update({content:`✅ Выбран класс: **${CLASS_LABELS[normalizeClassKey(key)]||key}**. Шанс группы пересчитан.`,components:[]});}
async function analyzeView(interaction,id){const a=analyze(id);return ephemeral(interaction,{embeds:[new EmbedBuilder().setColor(0x2563eb).setTitle(`📊 Анализ группы #${id}`).setDescription(`**Базовый шанс:** ${a.base}%\n${a.lines.join('\n')}\n\n**Итоговый шанс:** **${a.chance}%**\n\n🛡 Танков: ${a.tanks} • 💚 Лекарей: ${a.heals} • 🌀 Контроль: ${a.controls}\n⚔ Средняя сила: ${a.avgPower}`)]});}
async function leave(interaction,id){const g=getGroup(id);if(!g||g.status!=='forming')return ephemeral(interaction,{content:'Покинуть уже начавшийся рейд нельзя.'});db.prepare('DELETE FROM dungeon_members WHERE group_id=? AND user_id=?').run(id,interaction.user.id);const left=members(id);if(!left.length)db.prepare("UPDATE dungeon_groups SET status='cancelled' WHERE id=?").run(id);else if(g.leader_id===interaction.user.id)db.prepare('UPDATE dungeon_groups SET leader_id=? WHERE id=?').run(left[0].user_id,id);return interaction.update({content:'Вы покинули группу.',embeds:[],components:[]});}
async function start(interaction,id){
 const g=getGroup(id);if(!g||g.status!=='forming'||g.leader_id!==interaction.user.id)return ephemeral(interaction,{content:'Начать рейд может только лидер.'});if(!canStartNow())return ephemeral(interaction,{content:'Время старта истекло. Новый рейд можно запустить только до 12:09 или 19:09 МСК.'});
 const ctx=windowContext();if(!ctx||g.window_key!==ctx.key)return ephemeral(interaction,{content:'Эта группа создана для прошлого окна данжей. Создайте новую группу.'});
 const ms=members(id);if(ms.length<MIN_PLAYERS)return ephemeral(interaction,{content:`Нужно минимум ${MIN_PLAYERS} участника. Сейчас: ${ms.length}.`});if(ms.length>MAX_PLAYERS)return ephemeral(interaction,{content:`В один поход можно взять максимум ${MAX_PLAYERS} героев. Сейчас: ${ms.length}.`});
 const busy=ms.filter(m=>{const h=getHero(m.user_id);const expedition=db.prepare("SELECT 1 FROM hero_expeditions WHERE user_id=? AND status='active' LIMIT 1").get(m.user_id);return !h||h.status!=='ready'||Boolean(expedition);});if(busy.length)return ephemeral(interaction,{content:`❌ Рейд не запущен. Эти герои заняты или находятся в экспедиции:
${busy.map(m=>`• <@${m.user_id}>`).join('\n')}

Пусть они завершат активность или покинут группу.`});
 const a=analyze(id),now=Date.now(),end=now+RAID_DURATION_MS;const tx=db.transaction(()=>{
  for(const m of ms)db.prepare('INSERT OR REPLACE INTO dungeon_window_entries(guild_id,window_key,user_id,group_id,entered_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)').run(interaction.guildId,g.window_key,m.user_id,id);
  const changedGroup=db.prepare("UPDATE dungeon_groups SET status='active',success_chance=?,started_at=?,ends_at=? WHERE id=? AND status='forming'").run(a.chance,new Date(now).toISOString(),new Date(end).toISOString(),id);if(!changedGroup.changes)throw new Error('group-changed');
  for(const m of ms){const changed=db.prepare("UPDATE heroes SET status='dungeon',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND status='ready'").run(m.user_id);if(!changed.changes)throw new Error(`busy:${m.user_id}`);}
 });try{tx();}catch(error){return ephemeral(interaction,{content:'❌ Не удалось запустить рейд: состояние одного из героев изменилось. Обновите группу и повторите запуск.'});}await interaction.update({embeds:[groupEmbed(id,false)],components:[]});await ensureHub(interaction.client,interaction.guildId);
}

function ensureDungeonPlayer(userId){
 db.prepare(`INSERT OR IGNORE INTO players(user_id,username,card_dust) VALUES(?,?,0)`).run(String(userId),`Dungeon ${userId}`);
}
function valuableCountFor(diff,partySize){
 const ranges={normal:[0,1],dangerous:[1,1],heroic:[2,3],epic:[2,4],legendary:[3,5]};
 const [min,max]=ranges[diff.key]||[0,1];
 return Math.min(partySize,min+Math.floor(Math.random()*(max-min+1)));
}
function rarityPoolFor(diff){
 const pools={normal:['common','rare'],dangerous:['rare','epic'],heroic:['rare','epic'],epic:['epic','legendary'],legendary:['epic','legendary','mythic']};
 return pools[diff.key]||['rare'];
}
function chooseDungeonItem(diff){
 const rarities=rarityPoolFor(diff);
 const placeholders=rarities.map(()=>'?').join(',');
 let item=db.prepare(`SELECT item_key,name,rarity,item_type,slot,description,bonuses_json,lore FROM hero_items WHERE is_consumable=0 AND item_type NOT IN ('material','mount') AND rarity IN (${placeholders}) ORDER BY RANDOM() LIMIT 1`).get(...rarities);
 if(!item)item=db.prepare("SELECT item_key,name,rarity,item_type,slot,description,bonuses_json,lore FROM hero_items WHERE is_consumable=0 AND item_type NOT IN ('material','mount') ORDER BY RANDOM() LIMIT 1").get();
 return item||null;
}
function pickValuableWinners(ms,count){
 const pool=[...ms]; const out=[];
 while(pool.length&&out.length<count){
  const weights=pool.map(m=>{const row=db.prepare('SELECT penalty FROM dungeon_valuable_luck WHERE user_id=?').get(m.user_id);const l=dungeonLoadout(m.user_id,m.class_key);const rare=Math.min(40,Math.max(0,Number(l.derived.rareFindPercent||0)));return Math.max(.15,(1-Number(row?.penalty||0))*(1+rare/100));});
  let roll=Math.random()*weights.reduce((a,b)=>a+b,0),idx=0;
  for(;idx<weights.length;idx++){roll-=weights[idx];if(roll<=0)break;}
  const [winner]=pool.splice(Math.min(idx,pool.length-1),1);out.push(winner);
 }
 return new Set(out.map(x=>String(x.user_id)));
}
function updateValuableLuck(userId,won){
 if(won) db.prepare(`INSERT INTO dungeon_valuable_luck(user_id,penalty,last_valuable_at) VALUES(?,0.55,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET penalty=0.55,last_valuable_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP`).run(userId);
 else db.prepare(`INSERT INTO dungeon_valuable_luck(user_id,penalty) VALUES(?,0) ON CONFLICT(user_id) DO UPDATE SET penalty=MAX(0,dungeon_valuable_luck.penalty-0.10),updated_at=CURRENT_TIMESTAMP`).run(userId);
}
async function resolveGroup(client,g){
 const ms=members(g.id),diff=DIFFICULTIES.find(d=>d.key===g.difficulty_key)||DIFFICULTIES[0];
 const fixedChance=Math.max(0,Math.min(100,Number(g.success_chance||0)));
 // Целочисленный криптографический бросок 0.0000–99.9999 исключает ошибки
 // округления и сохраняется в истории для проверки владельцем.
 const successRoll=crypto.randomInt(0,1_000_000)/10_000;
 const success=successRoll<fixedChance, rewards=[];
 console.log(`[Dungeon] #${g.id} chance=${fixedChance.toFixed(2)} roll=${successRoll.toFixed(4)} success=${success}`);
 const winnerIds=success?pickValuableWinners(ms,valuableCountFor(diff,ms.length)):new Set();
 const tx=db.transaction(()=>{
  for(const m of ms){
   ensureDungeonPlayer(m.user_id);
   const rewardWindowKey = g.window_key || `${g.guild_id}:${g.difficulty_key}`;
   const alreadyRewarded = Boolean(db.prepare('SELECT 1 FROM dungeon_reward_claims WHERE guild_id=? AND window_key=? AND user_id=?').get(g.guild_id,rewardWindowKey,m.user_id));
   const canReward = !alreadyRewarded;
   const loadout=dungeonLoadout(m.user_id,m.class_key);
   const rewardMult=1+Math.min(20,Math.max(0,Number(loadout.derived.rewardPercent||0)))/100;
   const dust=canReward ? Math.round(((success?120:30)*diff.reward+Math.random()*(success?80:20))*rewardMult) : 0;
   if(canReward) addCardDust(m.user_id,dust,`Награда данжа #${g.id}: ${g.dungeon_name}`);
   const fullClassXp=Math.round((success?90:25)*diff.reward);
   const helpCount=alreadyRewarded ? Number(db.prepare('SELECT COUNT(*) AS count FROM dungeon_help_xp_claims WHERE guild_id=? AND window_key=? AND user_id=?').get(g.guild_id,rewardWindowKey,m.user_id)?.count||0) : 0;
   const canReceiveHelpXp=alreadyRewarded && helpCount<3;
   const classXp=canReward ? fullClassXp : (canReceiveHelpXp ? Math.max(1,Math.round(fullClassXp*0.25)) : 0);
   if(classXp>0) grantClassXp(m.user_id,m.class_key,classXp,{completed:canReward&&success});
   if(canReceiveHelpXp && classXp>0) db.prepare('INSERT OR IGNORE INTO dungeon_help_xp_claims(guild_id,window_key,user_id,group_id,class_xp) VALUES(?,?,?,?,?)').run(g.guild_id,rewardWindowKey,m.user_id,g.id,classXp);
   let valuableName=null,valuableKey=null,valuableItem=null;
   const won=canReward && winnerIds.has(String(m.user_id));
   if(won){
    const item=chooseDungeonItem(diff);
    if(item){
     db.prepare(`INSERT INTO hero_inventory(user_id,item_key,quantity,acquired_from) VALUES(?,?,1,?) ON CONFLICT(user_id,item_key) DO UPDATE SET quantity=quantity+1`).run(m.user_id,item.item_key,`dungeon:${g.id}`);
     db.prepare(`INSERT OR IGNORE INTO hero_item_collection(user_id,item_key,first_acquired_from) VALUES(?,?,?)`).run(m.user_id,item.item_key,`dungeon:${g.id}`);
     valuableName=item.name; valuableKey=item.item_key; valuableItem={itemKey:item.item_key,name:item.name,rarity:item.rarity,itemType:item.item_type,slot:item.slot,description:item.description,bonusesJson:item.bonuses_json,lore:item.lore};
    }
   }
   updateValuableLuck(m.user_id,Boolean(valuableName));
   rewards.push({userId:m.user_id,classKey:m.class_key,dust,classXp,valuable:valuableName,valuableKey,valuableItem,repeatParticipation:!canReward,helpXpAwarded:canReceiveHelpXp&&classXp>0,helpRunsUsed:canReceiveHelpXp?helpCount+1:helpCount,helpRunsLimit:3});
   if(success && canReward) db.prepare('INSERT OR IGNORE INTO dungeon_reward_claims(guild_id,window_key,user_id) VALUES(?,?,?)').run(g.guild_id,rewardWindowKey,m.user_id);
   db.prepare("UPDATE heroes SET status='ready',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND status='dungeon'").run(m.user_id);
  }
  db.prepare("UPDATE dungeon_groups SET status='resolved',resolved_at=CURRENT_TIMESTAMP,success=?,result_json=? WHERE id=?").run(success?1:0,JSON.stringify({version:4,dungeon:g.dungeon_name,difficulty:diff.key,chance:fixedChance,roll:Math.round(successRoll*10000)/10000,rewards}),g.id);
 });
 tx();
 // Результат сохраняется в истории хаба. Подробный отчёт больше не публикуется в общий канал.
 await ensureHub(client,g.guild_id);
 await checkAchievementsForUsers(client, g.guild_id, ms.map(m => m.user_id));
}
async function tick(client){await processScheduledWindows(client);cleanupClosedFormingGroups();const due=db.prepare("SELECT * FROM dungeon_groups WHERE status='active' AND ends_at<=?").all(new Date().toISOString());for(const g of due)await resolveGroup(client,g).catch(e=>console.error('[Dungeon] resolve',g.id,e));await ensureHub(client).catch(()=>{});}
function startScheduler(client){if(globalThis.__gsDungeonTimer)return;globalThis.__gsDungeonTimer=setInterval(()=>tick(client),60_000);setTimeout(()=>tick(client),10_000);console.log('🏰 Group Dungeon scheduler started');}


const DUNGEON_RARITY_ICONS={common:'⚪',rare:'🔵',epic:'🟣',legendary:'🟠',mythic:'🔴',exclusive:'💠',holographic:'🌈'};
const DUNGEON_SLOT_LABELS={ring:'Кольцо',weapon:'Оружие',main_hand:'Оружие',off_hand:'Щит / левая рука',shield:'Щит',ranged:'Дальнее оружие',helmet:'Шлем',head:'Шлем',chest:'Нагрудник',pants:'Штаны',boots:'Сапоги',belt:'Пояс',amulet:'Амулет',backpack:'Рюкзак',mount:'Маунт'};
function safeJson(value,fallback={}){try{return value?JSON.parse(value):fallback;}catch{return fallback;}}
function formatDungeonBonuses(raw){const bonuses=typeof raw==='string'?safeJson(raw,{}):(raw||{});const labels={strength:'Сила',defense:'Защита',dexterity:'Ловкость',intelligence:'Интеллект',wisdom:'Мудрость',vitality:'Выносливость',luck:'Удача',hp:'HP',max_hp:'HP',damage:'Урон',crit_chance:'Шанс крита',rare_drop_chance:'Шанс редкой добычи',rare_drop:'Шанс редкой добычи'};const rows=[];for(const [key,value] of Object.entries(bonuses)){const n=Number(value);if(!Number.isFinite(n)||n===0)continue;rows.push(`${labels[key]||key}: ${n>0?'+':''}${n}${String(key).includes('chance')||String(key).includes('drop')?'%':''}`);}return rows.length?rows.join(', '):'без дополнительных характеристик';}
function resolvedDungeonRows(guildId){return db.prepare("SELECT * FROM dungeon_groups WHERE guild_id=? AND status='resolved' ORDER BY COALESCE(resolved_at,created_at) DESC,id DESC").all(guildId);}
function getDungeonHistoryData(group){const result=safeJson(group.result_json,{rewards:[]});const rewards=Array.isArray(result.rewards)?result.rewards:[];return {result,rewards};}
function enrichDungeonReward(reward){if(reward.valuableItem)return reward;let item=null;if(reward.valuableKey)item=db.prepare('SELECT item_key,name,rarity,item_type,slot,description,bonuses_json,lore FROM hero_items WHERE item_key=?').get(reward.valuableKey);return {...reward,valuableItem:item?{itemKey:item.item_key,name:item.name,rarity:item.rarity,itemType:item.item_type,slot:item.slot,description:item.description,bonusesJson:item.bonuses_json,lore:item.lore}:null};}
function dungeonHistoryEmbed(group,page,total){const {rewards}=getDungeonHistoryData(group);const success=Number(group.success)===1;const lines=rewards.map((raw,index)=>{const r=enrichDungeonReward(raw);const cls=CLASS_LABELS[normalizeClassKey(r.classKey)]||r.classKey||'класс не записан';let line=`**${index+1}. <@${r.userId}>** — ${cls}\n🪙 ${Number(r.dust||0)} Dust • ✨ ${Number(r.heroXp||0)} XP героя • 📚 ${Number(r.classXp||0)} опыта класса`;if(Array.isArray(r.materials)&&r.materials.length)line+=`\n📦 ${r.materials.map(m=>`${m.icon||'📦'} ${m.name||m.key} ×${m.quantity}`).join(', ')}`;const item=r.valuableItem;if(item){const rarity=String(item.rarity||'common').toLowerCase();line+=`\n${DUNGEON_RARITY_ICONS[rarity]||'⚪'} **${item.name||r.valuable||r.valuableKey}** · ${rarity}`;if(item.slot)line+=` · ${DUNGEON_SLOT_LABELS[item.slot]||item.slot}`;if(item.description)line+=`\n_${String(item.description).slice(0,260)}_`;line+=`\n⚙️ ${formatDungeonBonuses(item.bonusesJson)}`;}else line+='\n📦 Ценный предмет не выпал.';return line;});const when=group.resolved_at?`<t:${Math.floor(Date.parse(group.resolved_at)/1000)}:f>`:'дата не записана';return new EmbedBuilder().setColor(success?0x16a34a:0xdc2626).setTitle(`📜 Данж #${group.id} — ${success?'пройден':'провален'}`).setDescription(`**${group.difficulty_icon||'🎲'} ${group.dungeon_name}**\nСложность: **${group.difficulty_name||group.difficulty_key||'неизвестна'}**\nШанс группы: **${Math.round(Number(group.success_chance||0))}%**\nЗавершён: ${when}\n\n${lines.join('\n\n')||'Подробные награды для этого старого рейда не сохранились.'}`).setFooter({text:`История подземелий • запись ${page+1} из ${total}`});}
function dungeonHistoryComponents(page,total){return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`dng_history_page:${Math.max(0,page-1)}`).setEmoji('⬅️').setLabel('Назад').setStyle(ButtonStyle.Secondary).setDisabled(page<=0),new ButtonBuilder().setCustomId(`dng_history_page:${Math.min(total-1,page+1)}`).setEmoji('➡️').setLabel('Далее').setStyle(ButtonStyle.Secondary).setDisabled(page>=total-1))];}
async function dungeonHistory(interaction,page=0){const rows=resolvedDungeonRows(interaction.guildId);if(!rows.length)return ephemeral(interaction,{content:'📜 История завершённых подземелий пока пуста.'});const safePage=clamp(Number(page)||0,0,rows.length-1);const payload={embeds:[dungeonHistoryEmbed(rows[safePage],safePage,rows.length)],components:dungeonHistoryComponents(safePage,rows.length)};if((interaction.customId||'').startsWith('dng_history_page:'))return interaction.update(payload);return ephemeral(interaction,payload);}

async function rules(interaction){return ephemeral(interaction,{embeds:[new EmbedBuilder().setColor(0x7c3aed).setTitle('📖 Как работают групповые данжи').setDescription('🌞 Запись: **11:00–12:00 МСК**, распределение в **12:00**.\n🌙 Запись: **18:00–19:00 МСК**, распределение в **19:00**.\n\nКаждый рейд длится **50 минут**. В каждом временном окне для всех появляется одно общее подземелье одной редкости, но проходить его могут несколько независимых групп. Каждый человек может участвовать несколько раз в одном окне. Полная награда выдаётся только за первое успешное прохождение; после этого можно помогать другим группам. За первые **3 повторных похода** в том же окне выдаётся **25% опыта выбранного класса**, без Dust и предметов. Минимум — **4 героя**, максимум — **6 героев**. Составы формирует бот: ручного выбора спутников и лидеров больше нет.\n\nШанс зависит от уровня героя и класса, экипировки, силы состава, наличия танка, лекаря и контроля. До старта процент пересчитывается автоматически. После старта он фиксируется.\n\nВсе получают награду. Редкую добычу получают лишь некоторые. После ценной награды личный шанс временно снижается, но никогда не становится нулевым.') ]});}
async function rewards(interaction){return ephemeral(interaction,{embeds:[new EmbedBuilder().setColor(0xf59e0b).setTitle('🎁 Награды данжей').setDescription('**Первое успешное прохождение за окно:**\n• GS Dust\n• полный опыт выбранного класса\n• шанс на найденную экипировку\n\n**Повторная помощь:**\n• 25% обычного опыта класса за первые 3 повторных похода\n• без Dust и предметов\n• начиная с 4-й помощи — без наград\n\nЧем выше сложность, тем больше обычная награда и шанс ценного предмета. При поражении до получения основной награды выдаются небольшие утешительные Dust и опыт, а право на полную награду сохраняется.') ]});}


function roleMenuPayload(){return {embeds:[new EmbedBuilder().setColor(0x7c3aed).setTitle('Выберите роль для распределения').setDescription('Выберите роль, которую способен выполнять ваш **текущий класс**. Несовместимую роль бот не примет.')],components:[new ActionRowBuilder().addComponents(
 new ButtonBuilder().setCustomId('dng_queue_role:tank').setLabel('Танк').setEmoji('🛡️').setStyle(ButtonStyle.Primary),
 new ButtonBuilder().setCustomId('dng_queue_role:healer').setLabel('Лекарь').setEmoji('💚').setStyle(ButtonStyle.Success),
 new ButtonBuilder().setCustomId('dng_queue_role:dps').setLabel('Урон').setEmoji('⚔️').setStyle(ButtonStyle.Danger),
 new ButtonBuilder().setCustomId('dng_queue_role:support').setLabel('Поддержка').setEmoji('🌀').setStyle(ButtonStyle.Secondary)
)]};}
async function queueJoin(interaction){const ctx=windowContext();if(!ctx)return ephemeral(interaction,{content:'Запись сейчас закрыта. Утреннее окно: 11:00–12:00, вечернее: 18:00–19:00 МСК.'});const hero=getHero(interaction.user.id);if(!hero)return ephemeral(interaction,{content:'Сначала создайте героя в Гильдии.'});if(hero.status!=='ready')return ephemeral(interaction,{content:`Герой сейчас занят: **${hero.status}**.`});const expedition=db.prepare("SELECT 1 FROM hero_expeditions WHERE user_id=? AND status='active' LIMIT 1").get(interaction.user.id);if(expedition)return ephemeral(interaction,{content:'Герой находится в экспедиции.'});return ephemeral(interaction,roleMenuPayload());}
async function queueSetRole(interaction,role){const ctx=windowContext();if(!ctx)return ephemeral(interaction,{content:'Запись уже закрыта.'});const hero=getHero(interaction.user.id);if(!hero||hero.status!=='ready')return ephemeral(interaction,{content:'Герой недоступен для записи.'});const cls=normalizeClassKey(hero.class_key),actual=roleForClass(cls);if(role!==actual)return interaction.update({content:`Класс **${CLASS_LABELS[cls]||cls}** относится к роли **${ROLE_LABELS[actual]}**. Выберите её либо смените активный класс в профиле.`,embeds:[],components:[]});const power=classPower(interaction.user.id,cls);db.prepare(`INSERT INTO dungeon_queue_entries(guild_id,window_key,user_id,class_key,role_pref,power) VALUES(?,?,?,?,?,?) ON CONFLICT(guild_id,window_key,user_id) DO UPDATE SET class_key=excluded.class_key,role_pref=excluded.role_pref,power=excluded.power,joined_at=CURRENT_TIMESTAMP`).run(interaction.guildId,ctx.key,interaction.user.id,cls,role,power);await interaction.update({content:`✅ Вы записаны как **${ROLE_LABELS[role]}** — **${CLASS_LABELS[cls]||cls}**. В ${ctx.window.key==='day'?'12:00':'19:00'} МСК бот автоматически распределит участников.`,embeds:[],components:[]});return ensureHub(interaction.client,interaction.guildId);}
async function queueMy(interaction){const row=queueEntry(interaction.guildId,interaction.user.id);if(!row)return ephemeral(interaction,{content:'Вы пока не записаны в текущее окно.'});return ephemeral(interaction,{content:`✅ Ваша запись активна.\nРоль: **${ROLE_LABELS[row.role_pref]}**\nКласс: **${CLASS_LABELS[row.class_key]||row.class_key}**\nСила при записи: **${row.power}**`});}
async function queueLeave(interaction){const ctx=windowContext();if(!ctx)return ephemeral(interaction,{content:'Запись уже закрыта.'});const r=db.prepare('DELETE FROM dungeon_queue_entries WHERE guild_id=? AND window_key=? AND user_id=?').run(interaction.guildId,ctx.key,interaction.user.id);await ephemeral(interaction,{content:r.changes?'Запись отменена.':'У вас не было записи в это окно.'});return ensureHub(interaction.client,interaction.guildId);}
function windowContextForProcessing(date=new Date()){const p=nowMoscowParts(date);const w=WINDOWS.find(x=>p.hour===x.processH&&p.minute>=x.processM&&p.minute<=x.processM+2);if(!w)return null;const day=`${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`;return {window:w,key:`${day}:${w.key}`,day};}
function balancedSizes(n){
 if(n<2)return [];
 if(n<=3)return [n];
 // Единственное количество от 4 и выше, которое нельзя полностью разбить на группы 4–6 — семь.
 // Поэтому создаём полноценную четвёрку и редкий резервный малый отряд из трёх.
 if(n===7)return [4,3];
 let groups=Math.floor(n/4);
 while(groups>0&&n>groups*6)groups++;
 while(groups>0&&n<groups*4)groups--;
 if(groups<=0)return [];
 const sizes=Array(groups).fill(Math.floor(n/groups));
 let rem=n-sizes.reduce((a,b)=>a+b,0);
 for(let i=0;rem>0;i=(i+1)%groups){if(sizes[i]<6){sizes[i]++;rem--;}}
 return sizes;
}
function distributeQueue(rows,sizes){const groups=sizes.map(()=>[]);const roleOrder=['tank','healer','support','dps'];const buckets=Object.fromEntries(roleOrder.map(r=>[r,rows.filter(x=>x.role_pref===r).sort((a,b)=>b.power-a.power||String(a.joined_at).localeCompare(String(b.joined_at)))]));for(const role of roleOrder){let i=0;while(buckets[role].length){const candidates=groups.map((g,idx)=>({idx,size:g.length,power:g.reduce((s,x)=>s+Number(x.power||0),0),roleCount:g.filter(x=>x.role_pref===role).length})).filter(x=>x.size<sizes[x.idx]).sort((a,b)=>a.roleCount-b.roleCount||a.power-b.power||a.size-b.size);if(!candidates.length)break;groups[candidates[0].idx].push(buckets[role].shift());i++;}}return groups;}
async function processDungeonWindow(client,guild,ctx){if(db.prepare('SELECT 1 FROM dungeon_window_processing WHERE guild_id=? AND window_key=?').get(guild.id,ctx.key))return;const rows=db.prepare('SELECT * FROM dungeon_queue_entries WHERE guild_id=? AND window_key=? ORDER BY joined_at').all(guild.id,ctx.key);const sizes=balancedSizes(rows.length);const selected=rows.slice(0,sizes.reduce((a,b)=>a+b,0));const reserve=rows.slice(selected.length);const groups=distributeQueue(selected,sizes);let spawn=db.prepare('SELECT * FROM dungeon_window_spawns WHERE guild_id=? AND window_key=?').get(guild.id,ctx.key);if(!spawn){const diff=weightedPick(DIFFICULTIES),dungeon=DUNGEONS[Math.floor(Math.random()*DUNGEONS.length)];db.prepare('INSERT OR IGNORE INTO dungeon_window_spawns(guild_id,window_key,dungeon_name,difficulty_key,difficulty_name,difficulty_icon,base_chance) VALUES(?,?,?,?,?,?,?)').run(guild.id,ctx.key,dungeon,diff.key,diff.name,diff.icon,diff.base);spawn=db.prepare('SELECT * FROM dungeon_window_spawns WHERE guild_id=? AND window_key=?').get(guild.id,ctx.key);}const now=Date.now(),end=now+RAID_DURATION_MS;const created=[];const tx=db.transaction(()=>{for(let i=0;i<groups.length;i++){const membersList=groups[i];if(membersList.length<MIN_PLAYERS)continue;const leader=membersList[0];const r=db.prepare(`INSERT INTO dungeon_groups(guild_id,leader_id,name,status,dungeon_name,difficulty_key,difficulty_name,difficulty_icon,base_chance,window_key) VALUES(?,?,?,'forming',?,?,?,?,?,?)`).run(guild.id,leader.user_id,`Автоотряд ${i+1}`,spawn.dungeon_name,spawn.difficulty_key,spawn.difficulty_name,spawn.difficulty_icon,spawn.base_chance,ctx.key);for(const m of membersList)db.prepare('INSERT INTO dungeon_members(group_id,user_id,class_key,hero_snapshot_json) VALUES(?,?,?,?)').run(r.lastInsertRowid,m.user_id,m.class_key,JSON.stringify(buildHeroSnapshot(m.user_id)||{}));const a=analyze(r.lastInsertRowid);db.prepare("UPDATE dungeon_groups SET status='active',success_chance=?,started_at=?,ends_at=? WHERE id=?").run(a.chance,new Date(now).toISOString(),new Date(end).toISOString(),r.lastInsertRowid);for(const m of membersList){db.prepare('INSERT OR REPLACE INTO dungeon_window_entries(guild_id,window_key,user_id,group_id,entered_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP)').run(guild.id,ctx.key,m.user_id,r.lastInsertRowid);db.prepare("UPDATE heroes SET status='dungeon',updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND status='ready'").run(m.user_id);}created.push({id:r.lastInsertRowid,members:membersList,chance:a.chance});}db.prepare('INSERT INTO dungeon_window_processing(guild_id,window_key,groups_created,reserve_count) VALUES(?,?,?,?)').run(guild.id,ctx.key,created.length,reserve.length);});tx();const cfg=getConfig(guild.id),ch=cfg?.channel_id?await guild.channels.fetch(cfg.channel_id).catch(()=>null):null;if(ch?.isTextBased()){const lines=created.map((g,i)=>`**Отряд ${i+1}** — шанс ${g.chance}%\n${g.members.map(m=>`${ROLE_LABELS[m.role_pref]} <@${m.user_id}>`).join('\n')}`).join('\n\n');await ch.send({embeds:[new EmbedBuilder().setColor(created.length?0x22c55e:0xf59e0b).setTitle(`🏰 Распределение завершено — ${spawn.dungeon_name}`).setDescription(created.length?`${spawn.difficulty_icon} **${spawn.difficulty_name}**\nПоходы завершатся примерно ${fmtTs(end)}.\n\n${lines}${reserve.length?`\n\n⚠️ **Резерв:** ${reserve.map(x=>`<@${x.user_id}>`).join(', ')} — не удалось включить в отряд даже из 2 героев.`:''}`:`Записалось **${rows.length}** игроков — для запуска требуется хотя бы 2 героя.`)]});}await ensureHub(client,guild.id);}
async function processScheduledWindows(client){const ctx=windowContextForProcessing();if(!ctx)return;for(const guild of client.guilds.cache.values())await processDungeonWindow(client,guild,ctx).catch(e=>console.error('[Dungeon] auto distribution',guild.id,e));}
async function handle(interaction){const id=interaction.customId;if(id==='dng_queue_join')return queueJoin(interaction);if(id==='dng_queue_my')return queueMy(interaction);if(id==='dng_queue_leave')return queueLeave(interaction);if(id.startsWith('dng_queue_role:'))return queueSetRole(interaction,id.split(':')[1]);if(id==='dng_history_open')return dungeonHistory(interaction,0);if(id.startsWith('dng_history_page:'))return dungeonHistory(interaction,Number(id.split(':')[1]||0));if(id==='dng_create')return createGroup(interaction);if(id==='dng_find')return listGroups(interaction,['forming']);if(id==='dng_active')return listGroups(interaction,['active']);if(id==='dng_my'){const g=userActiveGroup(interaction.guildId,interaction.user.id);return g?ephemeral(interaction,{embeds:[groupEmbed(g.id,g.status==='forming')],components:groupRows(g,interaction.user.id)}):ephemeral(interaction,{content:'Вы сейчас не состоите в группе.'});}if(id==='dng_rules')return rules(interaction);if(id==='dng_rewards')return rewards(interaction);if(id==='dng_open_group')return openGroup(interaction,Number(interaction.values[0]));const [action,raw]=id.split(':');const gid=Number(raw);if(action==='dng_join')return join(interaction,gid);if(action==='dng_class')return classMenu(interaction,gid);if(action==='dng_set_class')return setClass(interaction,gid,interaction.values[0]);if(action==='dng_analyze')return analyzeView(interaction,gid);if(action==='dng_leave')return leave(interaction,gid);if(action==='dng_disband')return disband(interaction,gid);if(action==='dng_start')return start(interaction,gid);if(action==='dng_refresh')return interaction.update({embeds:[groupEmbed(gid)],components:groupRows(getGroup(gid),interaction.user.id)});}

module.exports={startScheduler,ensureHub,setupChannel,handle,hubEmbed,analyze};
