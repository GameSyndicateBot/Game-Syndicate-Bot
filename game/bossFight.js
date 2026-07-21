
const { applyEffects } = require('./effects');

function rand(min,max){return Math.floor(Math.random()*(max-min+1))+min;}

class Player{
 constructor(userId,cls){
  this.userId=userId;
  this.class=cls;
  this.hp=120;
  this.maxHp=120;
  this.energy=0;
  this.initiative=rand(1,20);
  this.damageDone=0;
  this.alive=true;
  this.effects=[];
 }
}

class Boss{
 constructor(players){
  this.name="Багровый Дракон";
  this.hp=4000+players*400;
  this.maxHp=this.hp;
  this.phase=1;
  this.effects=[];
 }

 attack(players){
  const alive=players.filter(p=>p.alive);
  if(!alive.length)return "Босс один";

  const target=alive[Math.floor(Math.random()*alive.length)];
  const dmg=rand(50,90);

  target.hp-=dmg;

  if(Math.random()<0.3){
    target.effects.push({type:"burn",value:15,duration:2});
  }

  if(target.hp<=0)target.alive=false;

  return `🐉 Босс ударил <@${target.userId}> на ${dmg}`;
 }

 checkPhase(){
  if(this.hp<this.maxHp*0.5 && this.phase===1){
    this.phase=2;
    return "💀 Босс вошел во 2 фазу!";
  }
  return null;
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
  const classes=["tank","mage","assassin","healer"];
  const cls=classes[Math.floor(Math.random()*classes.length)];
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
  const dmg=rand(20,40);
  this.boss.hp-=dmg;
  p.energy+=20;
  p.damageDone+=dmg;
  this.log.push(`⚔️ <@${p.userId}> ${dmg}`);
 }

 ability(p){
  if(p.energy<50){this.log.push("❌ нет энергии");return;}
  const dmg=rand(60,90);
  this.boss.hp-=dmg;
  p.energy-=50;
  p.damageDone+=dmg;

  if(Math.random()<0.4){
    this.boss.effects.push({type:"poison",value:20,duration:2});
  }

  this.log.push(`💥 ${dmg}`);
 }

 ulti(p){
  if(p.energy<100){this.log.push("❌ нет ульты");return;}
  const dmg=rand(140,200);
  this.boss.hp-=dmg;
  p.energy=0;
  p.damageDone+=dmg;
  this.log.push(`🔥 УЛЬТА ${dmg}`);
 }

 nextTurn(){
  // эффекты
  this.log.push(...applyEffects(this.boss));
  this.players.forEach(pl=>this.log.push(...applyEffects(pl)));

  this.turnIndex++;

  if(this.turnIndex>=this.turnOrder.length){
    this.turnIndex=0;
    this.log.push(this.boss.attack(this.players));
  }

  const phase=this.boss.checkPhase();
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
