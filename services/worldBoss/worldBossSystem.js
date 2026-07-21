'use strict';

const {ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder,MessageFlags}=require('discord.js');
const {db,getOrCreatePlayer,addCardDust}=require('../../database/db');
const {addPack}=require('../../utils/packInventory');
const {CLASSES,MINIONS,BOSSES}=require('./config');

const CHANNEL_ID=process.env.WORLD_BOSS_CHANNEL_ID||'1529226831797158130';
const AUTO_SCHEDULE_ENABLED=String(process.env.WORLD_BOSS_AUTO_SCHEDULE||'false').toLowerCase()==='true';
const REGISTRATION_MS=10*60*1000;
const TURN_MS=60*1000;
const SLOTS=[9,15,21];
let clientRef=null;
let scheduler=null;
const timers=new Map();
let busy=false;

const rand=(a,b)=>Math.floor(Math.random()*(b-a+1))+a;
const pick=a=>a[Math.floor(Math.random()*a.length)];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

function init(){
 db.exec(`
 CREATE TABLE IF NOT EXISTS world_boss_battles(
  id INTEGER PRIMARY KEY AUTOINCREMENT, quick_round_id INTEGER, channel_id TEXT NOT NULL, message_id TEXT,
  boss_card_id INTEGER NOT NULL, boss_name TEXT NOT NULL, boss_hp INTEGER NOT NULL, boss_max_hp INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'registration', round_no INTEGER NOT NULL DEFAULT 0, turn_index INTEGER NOT NULL DEFAULT 0,
  turn_deadline INTEGER, registration_ends_at INTEGER, state_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, ended_at INTEGER
 );
 CREATE TABLE IF NOT EXISTS world_boss_players(
  battle_id INTEGER NOT NULL,user_id TEXT NOT NULL,class_key TEXT,initiative INTEGER DEFAULT 0,hp INTEGER DEFAULT 0,max_hp INTEGER DEFAULT 0,
  energy INTEGER DEFAULT 0,damage_done INTEGER DEFAULT 0,healing_done INTEGER DEFAULT 0,damage_taken INTEGER DEFAULT 0,
  contribution INTEGER DEFAULT 0,status TEXT DEFAULT 'alive',effects_json TEXT DEFAULT '{}',summons_json TEXT DEFAULT '[]',joined_at INTEGER NOT NULL,
  PRIMARY KEY(battle_id,user_id)
 );
 CREATE TABLE IF NOT EXISTS world_boss_schedule(date_key TEXT NOT NULL,slot_hour INTEGER NOT NULL,battle_id INTEGER,created_at INTEGER NOT NULL,PRIMARY KEY(date_key,slot_hour));
 `);
}
function activeBattle(){init();return db.prepare("SELECT * FROM world_boss_battles WHERE status IN ('registration','active') ORDER BY id DESC LIMIT 1").get();}
function battlePlayers(id){return db.prepare('SELECT * FROM world_boss_players WHERE battle_id=? ORDER BY initiative DESC,joined_at ASC').all(id);}
function parse(v,f){try{return JSON.parse(v||'')}catch{return f}}
function saveState(b,state){db.prepare('UPDATE world_boss_battles SET state_json=? WHERE id=?').run(JSON.stringify(state),b.id)}
function moscowParts(ts=Date.now()){
 const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(ts));
 return Object.fromEntries(p.map(x=>[x.type,x.value]));
}
function dateKey(ts=Date.now()){const p=moscowParts(ts);return `${p.year}-${p.month}-${p.day}`}
function roleIcon(role){return role==='tank'?'🛡️':role==='healer'?'💚':role==='dps'?'🔥':'⚙️'}
function hpBar(hp,max,size=16){const q=max?Math.round(clamp(hp/max,0,1)*size):0;return '█'.repeat(q)+'░'.repeat(size-q)}
function buttons(b,me=null){
 if(b.status==='registration')return [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`wb_join_${b.id}`).setLabel('Вступить').setEmoji('⚔️').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId(`wb_leave_${b.id}`).setLabel('Покинуть').setEmoji('🚪').setStyle(ButtonStyle.Secondary)
 )];
 if(b.status!=='active')return [];
 return [new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId(`wb_attack_${b.id}`).setLabel('Атака').setEmoji('🗡️').setStyle(ButtonStyle.Primary),
  new ButtonBuilder().setCustomId(`wb_skill_${b.id}`).setLabel('Способность').setEmoji('🔋').setStyle(ButtonStyle.Success),
  new ButtonBuilder().setCustomId(`wb_ult_${b.id}`).setLabel('Ульта').setEmoji('💥').setStyle(ButtonStyle.Danger),
  new ButtonBuilder().setCustomId(`wb_status_${b.id}`).setLabel('Мой статус').setEmoji('📋').setStyle(ButtonStyle.Secondary)
 )];
}
function buildEmbed(b,players){
 const state=parse(b.state_json,{log:[],minions:[]});
 const alive=players.filter(p=>p.status==='alive');
 const current=b.status==='active'?alive[b.turn_index%Math.max(1,alive.length)]:null;
 const e=new EmbedBuilder().setColor(b.status==='registration'?0x8b5cf6:b.status==='active'?0xdc2626:0x22c55e)
  .setTitle(`👹 Мировой босс — ${b.boss_name}`)
  .setDescription(`❤️ **${b.boss_hp}/${b.boss_max_hp} HP**\n${hpBar(b.boss_hp,b.boss_max_hp,20)}`)
  .addFields({name:'Состояние',value:b.status==='registration'?`Регистрация до <t:${Math.floor(b.registration_ends_at/1000)}:R>\nМинимум: **4** • Участников: **${players.length}**`:`Раунд **${b.round_no}** • Живы **${alive.length}/${players.length}**\nХод: ${current?`<@${current.user_id}> — **${CLASSES[current.class_key]?.name||current.class_key}**`:'—'}${b.turn_deadline?`\nДо автохода: <t:${Math.floor(b.turn_deadline/1000)}:R>`:''}`});
 if(state.minions?.length)e.addFields({name:'👾 Миньоны',value:state.minions.map(m=>`${m.name}: **${m.hp}/${m.maxHp}**`).join('\n').slice(0,1024)});
 if(b.status==='active')e.addFields({name:'Команда',value:players.slice(0,12).map(p=>`${roleIcon(CLASSES[p.class_key]?.role)} <@${p.user_id}> • ${CLASSES[p.class_key]?.name} • ❤️ ${p.hp}/${p.max_hp} • 🔋 ${p.energy}`).join('\n').slice(0,1024)});
 if(state.log?.length)e.addFields({name:'Последние действия',value:state.log.slice(-6).join('\n').slice(0,1024)});
 e.setFooter({text:'Game Syndicate • World Boss Quick Event'});
 return e;
}
async function refresh(id){const b=db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);if(!b||!clientRef)return;const ch=await clientRef.channels.fetch(b.channel_id).catch(()=>null);const msg=ch&&b.message_id?await ch.messages.fetch(b.message_id).catch(()=>null):null;if(msg)await msg.edit({embeds:[buildEmbed(b,battlePlayers(id))],components:buttons(b)}).catch(()=>{});}
function clearTimer(id){const t=timers.get(Number(id));if(t)clearTimeout(t);timers.delete(Number(id))}
function setTimer(id,fn,ms){clearTimer(id);const t=setTimeout(fn,ms);t.unref?.();timers.set(Number(id),t)}
function assignClasses(players){
 const ids=players.map(p=>p.user_id).sort(()=>Math.random()-.5);const tank=pick(Object.keys(CLASSES).filter(k=>CLASSES[k].role==='tank'));const heal=pick(Object.keys(CLASSES).filter(k=>CLASSES[k].role==='healer'));const pool=Object.keys(CLASSES).sort(()=>Math.random()-.5);const out=new Map();out.set(ids[0],tank);out.set(ids[1],heal);let i=0;for(const id of ids.slice(2)){while(pool[i]===tank||pool[i]===heal)i++;out.set(id,pool[i%pool.length]);i++;}return out;
}
function scaledHp(base,n){return Math.round(base*(0.72+0.28*n));}
async function startRegistration(client,{manual=false}={}){
 init();clientRef=client||clientRef;if(busy||activeBattle())return {ok:false,reason:'active'};busy=true;
 try{
  db.prepare("UPDATE quick_event_rounds SET status='expired' WHERE status IN ('active','pending')").run();
  const ch=await clientRef.channels.fetch(CHANNEL_ID).catch(()=>null);if(!ch?.isTextBased())return {ok:false,reason:'channel'};
  const boss=pick(BOSSES);const now=Date.now();const info=db.prepare(`INSERT INTO world_boss_battles(channel_id,boss_card_id,boss_name,boss_hp,boss_max_hp,status,registration_ends_at,state_json,created_at) VALUES(?,?,?,?,?,'registration',?,?,?)`).run(CHANNEL_ID,boss.cardId,boss.name,boss.baseHp,boss.baseHp,now+REGISTRATION_MS,JSON.stringify({boss,minions:[],log:[manual?'🛠️ Босс вызван вручную.':'⏰ Босс появился по расписанию.']}),now);
  const id=Number(info.lastInsertRowid);const b=db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);const msg=await ch.send({content:'## 🌍 GS WORLD BOSS QUICK EVENT',embeds:[buildEmbed(b,[])],components:buttons(b)});db.prepare('UPDATE world_boss_battles SET message_id=? WHERE id=?').run(msg.id,id);
  setTimer(id,()=>beginBattle(id).catch(console.error),REGISTRATION_MS);return {ok:true,id};
 }finally{busy=false}
}
async function beginBattle(id){
 const b=db.prepare("SELECT * FROM world_boss_battles WHERE id=? AND status='registration'").get(id);if(!b)return;const players=battlePlayers(id);
 if(players.length<4){db.prepare("UPDATE world_boss_battles SET status='cancelled',ended_at=? WHERE id=?").run(Date.now(),id);const state=parse(b.state_json,{});state.log=[...(state.log||[]),'❌ Недостаточно участников. Нужно минимум 4.'];saveState(b,state);await refresh(id);return scheduleRegular();}
 const assigned=assignClasses(players);for(const p of players){const key=assigned.get(p.user_id),c=CLASSES[key];db.prepare(`UPDATE world_boss_players SET class_key=?,initiative=?,hp=?,max_hp=?,energy=0,status='alive',effects_json='{}',summons_json='[]' WHERE battle_id=? AND user_id=?`).run(key,rand(1,20),c.maxHp,c.maxHp,id,p.user_id)}
 const boss=BOSSES.find(x=>x.cardId===b.boss_card_id);const hp=scaledHp(boss.baseHp,players.length);db.prepare("UPDATE world_boss_battles SET status='active',boss_hp=?,boss_max_hp=?,round_no=1,turn_index=0,turn_deadline=? WHERE id=?").run(hp,hp,Date.now()+TURN_MS,id);const nb=db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);const st=parse(nb.state_json,{});st.log=[...(st.log||[]),`🎲 Инициатива определена. Бой начался!`];saveState(nb,st);await refresh(id);armTurn(id);
}
function currentPlayer(b){const alive=battlePlayers(b.id).filter(p=>p.status==='alive');return {alive,p:alive.length?alive[b.turn_index%alive.length]:null}}
function armTurn(id){const b=db.prepare("SELECT * FROM world_boss_battles WHERE id=? AND status='active'").get(id);if(!b)return;setTimer(id,()=>autoTurn(id).catch(console.error),Math.max(500,Number(b.turn_deadline)-Date.now()))}
async function autoTurn(id){const b=db.prepare("SELECT * FROM world_boss_battles WHERE id=? AND status='active'").get(id);if(!b)return;const {p}=currentPlayer(b);if(!p)return;await perform(id,p.user_id,'attack',true)}
function effects(p){return parse(p.effects_json,{})}
function updateEffects(id,user,e){db.prepare('UPDATE world_boss_players SET effects_json=? WHERE battle_id=? AND user_id=?').run(JSON.stringify(e),id,user)}
function addLog(b,text){const s=parse(b.state_json,{log:[],minions:[]});s.log=[...(s.log||[]),text].slice(-10);saveState(b,s);return s}
function damageTarget(id,target,amount){const e=effects(target);let d=amount;if(e.guardRounds>0)d=Math.round(d*.5);if(e.tauntRounds>0)d=Math.round(d*.7);if(e.rageTurns>0)d=Math.round(d*1.25);let shield=Number(e.shield||0);if(shield){const used=Math.min(shield,d);shield-=used;d-=used;e.shield=shield;updateEffects(id,target.user_id,e)}const hp=Math.max(0,target.hp-d);db.prepare("UPDATE world_boss_players SET hp=?,damage_taken=damage_taken+?,status=CASE WHEN ?<=0 THEN 'dead' ELSE status END WHERE battle_id=? AND user_id=?").run(hp,d,hp,id,target.user_id);return d}
function hurtEnemy(b,state,amount){let dealt=0;if(state.minions?.length){const m=state.minions.find(x=>x.hp>0);if(m){dealt=Math.min(amount,m.hp);m.hp-=amount;state.minions=state.minions.filter(x=>x.hp>0);saveState(b,state);return {dealt,target:m.name,minion:true}}}dealt=Math.min(amount,b.boss_hp);db.prepare('UPDATE world_boss_battles SET boss_hp=MAX(0,boss_hp-?) WHERE id=?').run(amount,b.id);return {dealt,target:b.boss_name,minion:false}}
async function perform(id,userId,action,auto=false){
 if(busy)return;busy=true;try{let b=db.prepare("SELECT * FROM world_boss_battles WHERE id=? AND status='active'").get(id);if(!b)return {ok:false,reason:'ended'};const {alive,p}=currentPlayer(b);if(!p||p.user_id!==String(userId))return {ok:false,reason:'turn'};const c=CLASSES[p.class_key],e=effects(p);let text='';let energy=p.energy;let state=parse(b.state_json,{log:[],minions:[]});
 if(action==='attack'){
  if(Math.random()*100<c.miss)text=`💨 <@${userId}> (${c.name}) промахивается.`;else{let dmg=rand(...c.damage);if(e.rageTurns>0)dmg=Math.round(dmg*1.4);if(e.doubleNext){dmg*=2;e.doubleNext=false}const r=hurtEnemy(b,state,dmg);db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,userId);text=`🗡️ <@${userId}> наносит **${r.dealt}** → ${r.target}.`;}energy=clamp(energy+(text.includes('промах')?15:20),0,100);
 }else if(action==='skill'){
  if(energy<40)return {ok:false,reason:'energy'};energy-=40;text=useSkill(b,p,c,e,state);
 }else if(action==='ult'){
  if(energy<100)return {ok:false,reason:'energy'};energy=0;text=useUlt(b,p,c,e,state);
 }
 if(e.rageTurns>0)e.rageTurns--;updateEffects(id,userId,e);db.prepare('UPDATE world_boss_players SET energy=? WHERE battle_id=? AND user_id=?').run(energy,id,userId);b=db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);addLog(b,(auto?'⏱️ ':'')+text);if(b.boss_hp<=0)return finish(id,true);await nextTurn(id,alive);return {ok:true,text};
 }finally{busy=false}}
function lowestAlive(id){return battlePlayers(id).filter(x=>x.status==='alive').sort((a,b)=>(a.hp/a.max_hp)-(b.hp/b.max_hp))[0]}
function useSkill(b,p,c,e,state){const id=b.id,u=p.user_id;switch(p.class_key){
 case'warrior':e.interceptRounds=2;return`🛡️ <@${u}> перехватывает 70% одиночного урона на 2 раунда.`;
 case'paladin':{const t=lowestAlive(id),te=effects(t);te.shield=Math.max(Number(te.shield||0),180);updateEffects(id,t.user_id,te);return`✨ <@${u}> накладывает щит **180 HP** на <@${t.user_id}>.`}
 case'guardian':e.guardRounds=2;return`🛡️ <@${u}> снижает входящий урон на 50% на 2 раунда.`;
 case'cleric':{const t=lowestAlive(id),h=rand(30,45),nh=Math.min(t.max_hp,t.hp+h);db.prepare('UPDATE world_boss_players SET hp=?,healing_done=healing_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(nh,nh-t.hp,nh-t.hp,id,u);return`💚 <@${u}> лечит <@${t.user_id}> на **${nh-t.hp}**.`}
 case'priest':{let total=0;for(const t of battlePlayers(id).filter(x=>x.status==='alive')){const h=rand(18,28),nh=Math.min(t.max_hp,t.hp+h);db.prepare('UPDATE world_boss_players SET hp=? WHERE battle_id=? AND user_id=?').run(nh,id,t.user_id);total+=nh-t.hp}db.prepare('UPDATE world_boss_players SET healing_done=healing_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(total,total,id,u);return`💚 <@${u}> лечит группу суммарно на **${total}**.`}
 case'bard':{const t=battlePlayers(id).filter(x=>x.status==='alive').sort((a,z)=>z.damage_done-a.damage_done)[0],te=effects(t);te.damageBuffTurns=3;te.damageBuff=.15;updateEffects(id,t.user_id,te);return`🎵 <@${u}> усиливает урон <@${t.user_id}> на 15% на 3 хода.`}
 case'assassin':{const d=rand(60,80),r=hurtEnemy(b,state,d);db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u);return`🗡️ <@${u}> наносит **${r.dealt}** теневого урона.`}
 case'archer':{let total=0;for(let i=0;i<3;i++)if(Math.random()*100>=c.miss){const r=hurtEnemy(b,state,rand(14,20));total+=r.dealt}db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(total,total,id,u);return`🏹 <@${u}> выпускает 3 стрелы: **${total}** урона.`}
 case'mage':{const r=hurtEnemy(b,state,rand(45,65));db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u);return`🔥 <@${u}> наносит **${r.dealt}** магического урона.`}
 case'berserker':e.rageTurns=2;return`⚙️ <@${u}> входит в ярость: +40% урона и +25% входящего на 2 хода.`;
 case'engineer':state.summons=state.summons||[];state.summons=state.summons.filter(x=>x.owner!==u||x.type!=='turret');state.summons.push({owner:u,type:'turret',name:'Турель',hp:80,maxHp:80,damage:[16,22],rounds:4});saveState(b,state);return`🔧 <@${u}> устанавливает турель на 4 раунда.`;
 case'necromancer':state.summons=state.summons||[];let sk=state.summons.filter(x=>x.owner===u&&x.type==='skeleton');if(sk.length>=2)state.summons.splice(state.summons.indexOf(sk[0]),1);state.summons.push({owner:u,type:'skeleton',name:'Скелет',hp:55,maxHp:55,damage:[13,19],rounds:4});saveState(b,state);return`💀 <@${u}> призывает скелета на 4 раунда.`;
 }return'Способность использована.'}
function useUlt(b,p,c,e,state){const id=b.id,u=p.user_id;switch(p.class_key){
 case'warrior':{const r=hurtEnemy(b,state,200);db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u);return`💥 <@${u}> наносит ультой **${r.dealt}** урона.`}
 case'paladin':for(const t of battlePlayers(id).filter(x=>x.status==='alive')){const te=effects(t);te.shield=Math.max(Number(te.shield||0),t.user_id===u?80:60);te.groupShieldRounds=3;updateEffects(id,t.user_id,te)}return`✨ <@${u}> накрывает всю группу щитами.`;
 case'guardian':e.tauntRounds=2;return`🛡️ <@${u}> провоцирует босса на 2 раунда.`;
 case'cleric':{const t=lowestAlive(id),h=t.max_hp-t.hp;db.prepare('UPDATE world_boss_players SET hp=max_hp WHERE battle_id=? AND user_id=?').run(id,t.user_id);db.prepare('UPDATE world_boss_players SET healing_done=healing_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(h,h,id,u);return`💚 <@${u}> полностью исцеляет <@${t.user_id}>.`}
 case'priest':{const dead=battlePlayers(id).filter(x=>x.status==='dead').sort((a,z)=>z.max_hp-a.max_hp)[0];if(!dead){db.prepare('UPDATE world_boss_players SET energy=100 WHERE battle_id=? AND user_id=?').run(id,u);return`⚠️ Погибших нет — энергия ульты сохранена.`}db.prepare("UPDATE world_boss_players SET status='alive',hp=ROUND(max_hp*0.5),energy=0 WHERE battle_id=? AND user_id=?").run(id,dead.user_id);return`✨ <@${u}> воскрешает <@${dead.user_id}> с 50% HP.`}
 case'bard':for(const t of battlePlayers(id).filter(x=>x.status==='alive')){const te=effects(t);te.groupDamageRounds=2;te.groupDamage=.2;updateEffects(id,t.user_id,te)}return`🎼 <@${u}> усиливает урон всей группы на 20% на 2 раунда.`;
 case'assassin':{const r=hurtEnemy(b,state,rand(120,160));db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u);return`☠️ <@${u}> наносит **${r.dealt}** смертельного урона.`}
 case'archer':{let total=0;let r=hurtEnemy(b,state,rand(85,110));total+=r.dealt;for(const m of state.minions||[])m.hp-=rand(45,65);state.minions=(state.minions||[]).filter(x=>x.hp>0);saveState(b,state);db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(total,total,id,u);return`🏹 <@${u}> обрушивает дождь стрел: **${total}** по главной цели и AoE по миньонам.`}
 case'mage':{const r=hurtEnemy(b,state,rand(140,180));db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(r.dealt,r.dealt,id,u);return`☄️ <@${u}> вызывает метеор: **${r.dealt}** урона.`}
 case'berserker':e.doubleNext=true;return`💥 Следующее атакующее действие <@${u}> нанесёт двойной урон.`;
 case'engineer':state.summons=state.summons||[];state.summons=state.summons.filter(x=>x.owner!==u||x.type!=='golem');state.summons.push({owner:u,type:'golem',name:'Голем',hp:220,maxHp:220,damage:[30,42],rounds:5});saveState(b,state);return`🤖 <@${u}> призывает голема на 5 раундов.`;
 case'necromancer':state.summons=state.summons||[];for(let i=0;i<3;i++)state.summons.push({owner:u,type:'army',name:'Скелет армии',hp:65,maxHp:65,damage:[15,21],rounds:3});saveState(b,state);return`💀 <@${u}> поднимает армию из 3 скелетов.`;
 }return'Ульта использована.'}
async function summonsAct(b){let state=parse(b.state_json,{log:[],minions:[],summons:[]}),totalByOwner={};for(const s of state.summons||[]){if(s.rounds<=0||s.hp<=0)continue;const r=hurtEnemy(b,state,rand(...s.damage));totalByOwner[s.owner]=(totalByOwner[s.owner]||0)+r.dealt;s.rounds--}state.summons=(state.summons||[]).filter(s=>s.rounds>0&&s.hp>0);saveState(b,state);for(const [u,d] of Object.entries(totalByOwner))db.prepare('UPDATE world_boss_players SET damage_done=damage_done+?,contribution=contribution+? WHERE battle_id=? AND user_id=?').run(d,d,b.id,u);if(Object.keys(totalByOwner).length)addLog(b,`⚙️ Призывы наносят суммарно **${Object.values(totalByOwner).reduce((a,z)=>a+z,0)}** урона.`)}
async function nextTurn(id,previousAlive){
 let b=db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);let alive=battlePlayers(id).filter(x=>x.status==='alive');let ni=b.turn_index+1;if(ni>=alive.length){await summonsAct(b);b=db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);if(b.boss_hp<=0)return finish(id,true);await bossTurn(id);b=db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);alive=battlePlayers(id).filter(x=>x.status==='alive');if(!alive.length)return finish(id,false);ni=0;db.prepare('UPDATE world_boss_battles SET round_no=round_no+1 WHERE id=?').run(id)}db.prepare('UPDATE world_boss_battles SET turn_index=?,turn_deadline=? WHERE id=?').run(ni,Date.now()+TURN_MS,id);await refresh(id);armTurn(id)
}
async function bossTurn(id){let b=db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);const boss=BOSSES.find(x=>x.cardId===b.boss_card_id),players=battlePlayers(id).filter(x=>x.status==='alive');if(!players.length)return;let target=players.find(x=>effects(x).tauntRounds>0)||players.find(x=>effects(x).interceptRounds>0)||pick(players);let text;if(Math.random()*100<boss.miss)text=`💨 ${boss.name} промахивается.`;else{const d=damageTarget(id,target,rand(...boss.damage));text=`👹 ${boss.name} наносит <@${target.user_id}> **${d}** урона.`}addLog(b,text);b=db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);let state=parse(b.state_json,{minions:[],log:[]});if(b.round_no%boss.summonEvery===0&&state.minions.length<3){const cfg=MINIONS[pick(boss.minions)];state.minions.push({name:cfg.name,hp:cfg.maxHp,maxHp:cfg.maxHp,damage:cfg.damage,miss:cfg.miss});state.log.push(`👾 Босс призывает: **${cfg.name}**.`)}for(const m of state.minions){const aliveNow=battlePlayers(id).filter(x=>x.status==='alive');if(!aliveNow.length)break;const t=pick(aliveNow);if(Math.random()*100>=m.miss){const d=damageTarget(id,t,rand(...m.damage));state.log.push(`👾 ${m.name} → <@${t.user_id}>: **${d}**.`)}}state.log=state.log.slice(-10);saveState(b,state);for(const p of battlePlayers(id)){const e=effects(p);for(const k of ['guardRounds','tauntRounds','interceptRounds','groupShieldRounds','groupDamageRounds'])if(e[k]>0)e[k]--;updateEffects(id,p.user_id,e)}}
function mvpPack(){const r=Math.random()*100;if(r<5)return'boss';if(r<18)return'elite';if(r<45)return'premium';return'base'}
async function finish(id,win){clearTimer(id);let b=db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);if(!b||!['active','registration'].includes(b.status))return;const ps=battlePlayers(id);db.prepare('UPDATE world_boss_battles SET status=?,ended_at=?,turn_deadline=NULL WHERE id=?').run(win?'won':'lost',Date.now(),id);let lines=[];if(win&&ps.length){const pool=rand(600,1000)+ps.length*80,each=Math.max(40,Math.floor(pool/ps.length));for(const p of ps){addCardDust(p.user_id,each)}const mvp=[...ps].sort((a,z)=>(z.damage_done+z.healing_done)-(a.damage_done+a.healing_done))[0];const pack=mvpPack();addPack(mvp.user_id,pack,1);lines=[`🏆 Победа! Каждый участник получает **${each} GS Dust**.`,`⭐ MVP: <@${mvp.user_id}> — **${mvp.damage_done}** урона, **${mvp.healing_done}** лечения.`,`🎁 MVP получает **${pack.toUpperCase()} Pack**.`]}else lines=['💀 Группа потерпела поражение. Награды не выданы.'];b=db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);const s=parse(b.state_json,{log:[]});s.log=[...lines,...ps.sort((a,z)=>z.damage_done-a.damage_done).slice(0,8).map((p,i)=>`${i+1}. <@${p.user_id}> — ${p.damage_done} урона`)].slice(-10);saveState(b,s);await refresh(id);scheduleRegular()}
function scheduleRegular(){setTimeout(()=>{try{const q=require('../../systems/quickEventSystem');q.postQuickEvent(clientRef).catch(console.error)}catch(e){console.error(e)}},5000).unref?.()}
async function handle(interaction){if(!interaction.isButton()||!interaction.customId.startsWith('wb_'))return false;init();const m=interaction.customId.match(/^wb_(join|leave|attack|skill|ult|status)_(\d+)$/);if(!m)return false;const [,act,idRaw]=m,id=Number(idRaw),b=db.prepare('SELECT * FROM world_boss_battles WHERE id=?').get(id);if(!b){await interaction.reply({content:'Событие не найдено.',flags:MessageFlags.Ephemeral});return true}
 if(act==='join'||act==='leave'){if(b.status!=='registration'){await interaction.reply({content:'Регистрация уже завершена.',flags:MessageFlags.Ephemeral});return true}if(act==='join'){getOrCreatePlayer(interaction.user);db.prepare('INSERT OR IGNORE INTO world_boss_players(battle_id,user_id,joined_at) VALUES(?,?,?)').run(id,interaction.user.id,Date.now());await interaction.reply({content:'✅ Ты вступил в бой.',flags:MessageFlags.Ephemeral})}else{db.prepare('DELETE FROM world_boss_players WHERE battle_id=? AND user_id=?').run(id,interaction.user.id);await interaction.reply({content:'🚪 Ты покинул регистрацию.',flags:MessageFlags.Ephemeral})}await refresh(id);return true}
 const p=db.prepare('SELECT * FROM world_boss_players WHERE battle_id=? AND user_id=?').get(id,interaction.user.id);if(!p){await interaction.reply({content:'Ты не участвуешь в этом бою.',flags:MessageFlags.Ephemeral});return true}if(act==='status'){const c=CLASSES[p.class_key],e=effects(p);await interaction.reply({content:`${roleIcon(c.role)} **${c.name}**\n❤️ ${p.hp}/${p.max_hp}\n🔋 ${p.energy}/100\n🗡️ Урон: ${p.damage_done}\n💚 Лечение: ${p.healing_done}\nЭффекты: \`${JSON.stringify(e)}\``,flags:MessageFlags.Ephemeral});return true}
 const result=await perform(id,interaction.user.id,act);const msg=result?.ok?`✅ ${result.text}`:result?.reason==='turn'?'⏳ Сейчас не твой ход.':result?.reason==='energy'?'🔋 Недостаточно энергии.':'Событие уже завершено.';await interaction.reply({content:msg,flags:MessageFlags.Ephemeral});return true}
function nextSlotDelay(){const now=Date.now();for(let d=0;d<2;d++)for(const h of SLOTS){const base=new Date(now+d*86400000);const parts=moscowParts(base);const utc=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),h-3,0,0);if(utc>now+1000)return utc-now}return 6*3600000}
function schedulerTick(){const p=moscowParts(),h=Number(p.hour),min=Number(p.minute),key=dateKey();if(SLOTS.includes(h)&&min<2){const done=db.prepare('SELECT 1 FROM world_boss_schedule WHERE date_key=? AND slot_hour=?').get(key,h);if(!done){db.prepare('INSERT INTO world_boss_schedule(date_key,slot_hour,created_at) VALUES(?,?,?)').run(key,h,Date.now());startRegistration(clientRef).then(r=>{if(r.ok)db.prepare('UPDATE world_boss_schedule SET battle_id=? WHERE date_key=? AND slot_hour=?').run(r.id,key,h)}).catch(console.error)}}scheduler=setTimeout(schedulerTick,Math.min(nextSlotDelay(),60000));scheduler.unref?.()}
function startScheduler(client){init();clientRef=client;if(scheduler)clearTimeout(scheduler);const a=activeBattle();if(a){if(a.status==='registration')setTimer(a.id,()=>beginBattle(a.id).catch(console.error),Math.max(1000,a.registration_ends_at-Date.now()));else armTurn(a.id);refresh(a.id).catch(()=>{})}if(AUTO_SCHEDULE_ENABLED){schedulerTick();console.log('[WorldBoss] Автозапуск включён: 09:00, 15:00, 21:00 МСК')}else{console.log('[WorldBoss] Тестовый режим: автозапуск отключён, доступен только ручной запуск')}}
module.exports={startScheduler,startRegistration,handle,isActive:()=>Boolean(activeBattle()),beginBattle};
