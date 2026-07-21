
const { applyEffects } = require('./effects');
const classes = require('./classes');
const { spawnMinion } = require('./minions');

function rand(min,max){return Math.floor(Math.random()*(max-min+1))+min;}

class Player{
 constructor(id,cls){
  const data = classes[cls];
  this.userId=id;
  this.class=cls;
  this.hp=data.hp;
  this.maxHp=data.hp;
  this.energy=0;
  this.initiative=rand(1,20);
  this.damageDone=0;
  this.alive=true;
  this.effects=[];
  if(data.passive) data.passive(this);
 }
}

class Boss{
 constructor(players){
  this.name="Багровый Дракон";
  this.hp=5000+players*500;
  this.maxHp=this.hp;
  this.phase=1;
  this.effects=[];
  this.minions=[];
 }

 attack(players){
  const alive=players.filter(p=>p.alive);
  if(!alive.length)return "";

  const target=alive[Math.floor(Math.random()*alive.length)];
  let dmg=rand(60,100);

  if(target.damageReduction) dmg*=1-target.damageReduction;

  target.hp-=Math.floor(dmg);

  if(Math.random()<0.3){
    target.effects.push({type:"burn",value:15,duration:2});
  }

  if(target.hp<=0)target.alive=false;

  return `🐉 Босс ударил <@${target.userId}> на ${Math.floor(dmg)}`;
 }

 summon(players){
  if(this.minions.length<2){
    const m = spawnMinion(players);
    this.minions.push(m);
    return "👾 Босс призвал миньона";
  }
 }

 phaseCheck(){
  if(this.hp<this.maxHp*0.5 && this.phase===1){
    this.phase=2;
    return "💀 Фаза 2!";
  }
 }
}

class BossFight{
 constructor(){
  this.players=[];
  this.turnOrder=[];
  this.turnIndex=0;
  this.boss=null;
  this.log=[];
 }

 addPlayer(id){
  const keys = Object.keys(classes);
  const cls = keys[Math.floor(Math.random()*keys.length)];
  this.players.push(new Player(id,cls));
 }

 start(){
  if(this.players.length<4)return false;

  this.boss=new Boss(this.players.length);

  this.turnOrder=[...this.players].sort((a,b)=>b.initiative-a.initiative);
  return true;
 }

 current(){return this.turnOrder[this.turnIndex];}

 attack(p){
  let dmg=rand(20,40);

  if(p.class==="assassin" && Math.random()<0.3){
    dmg*=2;
    this.log.push("💀 крит!");
  }

  this.boss.hp-=dmg;
  p.energy+=20;
  p.damageDone+=dmg;
  this.log.push(`⚔️ ${dmg}`);
 }

 ability(p){
  if(p.energy<50){this.log.push("❌ энергия");return;}

  if(p.class==="healer"){
    p.hp+=40;
    this.log.push("💚 хил");
  } else {
    this.boss.hp-=80;
    this.log.push("💥 80 урона");
  }

  p.energy-=50;
 }

 ulti(p){
  if(p.energy<100){this.log.push("❌ ульта");return;}

  this.boss.hp-=180;
  p.energy=0;
  p.damageDone+=180;
  this.log.push("🔥 УЛЬТА");
 }

 nextTurn(){
  this.log.push(...applyEffects(this.boss));
  this.players.forEach(pl=>this.log.push(...applyEffects(pl)));

  this.turnIndex++;

  if(this.turnIndex>=this.turnOrder.length){
    this.turnIndex=0;

    this.log.push(this.boss.attack(this.players));

    if(Math.random()<0.4){
      const s=this.boss.summon(this.players);
      if(s) this.log.push(s);
    }

    this.boss.minions.forEach(m=>{
      this.log.push(m.attack(this.players));
    });
  }

  const phase=this.boss.phaseCheck();
  if(phase)this.log.push(phase);
 }

 isFinished(){
  return this.boss.hp<=0 || this.players.filter(p=>p.alive).length===0;
 }

 getMVP(){
  return this.players.sort((a,b)=>b.damageDone-a.damageDone)[0];
 }
}

module.exports={BossFight};
