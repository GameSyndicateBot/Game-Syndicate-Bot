const { createCanvas, loadImage } = require('canvas');
const { HERO_CLASSES, ORIGINS, GENDERS, xpForNextLevel } = require('../../systems/hero/heroData');
function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.closePath();}
function panel(ctx,x,y,w,h){rr(ctx,x,y,w,h,22);ctx.fillStyle='rgba(12,4,24,.82)';ctx.fill();ctx.strokeStyle='#8B5CF6';ctx.lineWidth=2;ctx.stroke();}
function stat(ctx,x,y,w,label,value){panel(ctx,x,y,w,86);ctx.fillStyle='#C084FC';ctx.font='bold 20px Arial';ctx.fillText(label,x+18,y+31);ctx.fillStyle='#fff';ctx.font='bold 34px Arial';ctx.textAlign='right';ctx.fillText(String(value),x+w-18,y+57);ctx.textAlign='left';}
async function createHeroCard(hero,user){
 const c=createCanvas(1500,900),ctx=c.getContext('2d'); const cls=HERO_CLASSES[hero.class_key],org=ORIGINS[hero.origin_key];
 const bg=ctx.createLinearGradient(0,0,1500,900);bg.addColorStop(0,'#030006');bg.addColorStop(.5,'#1A0730');bg.addColorStop(1,'#07000D');ctx.fillStyle=bg;ctx.fillRect(0,0,1500,900);
 ctx.globalAlpha=.07;ctx.fillStyle='#D8B4FE';ctx.font='bold 360px Arial';ctx.fillText('GS',780,420);ctx.globalAlpha=1;
 ctx.strokeStyle='#A855F7';ctx.lineWidth=5;rr(ctx,28,28,1444,844,34);ctx.stroke();
 let avatar=null;try{avatar=await loadImage(user.displayAvatarURL({extension:'png',size:512}));}catch(_){}
 if(avatar){ctx.save();ctx.beginPath();ctx.arc(205,220,125,0,Math.PI*2);ctx.clip();ctx.drawImage(avatar,80,95,250,250);ctx.restore();ctx.strokeStyle='#C084FC';ctx.lineWidth=7;ctx.beginPath();ctx.arc(205,220,130,0,Math.PI*2);ctx.stroke();}
 ctx.fillStyle='#fff';ctx.font='bold 62px Arial';ctx.fillText(hero.name.toUpperCase(),390,150);
 ctx.fillStyle='#C084FC';ctx.font='bold 32px Arial';ctx.fillText(`${cls.icon} ${cls.name}  •  ${org.icon} ${org.name}`,390,210);
 ctx.fillStyle='#A78BFA';ctx.font='bold 22px Arial';ctx.fillText(`${GENDERS[hero.gender]}  •  HERO #${String(hero.hero_number).padStart(5,'0')}  •  ${new Date(hero.created_at+'Z').toLocaleDateString('ru-RU')}`,390,258);
 panel(ctx,390,300,1010,140);ctx.fillStyle='#fff';ctx.font='bold 38px Arial';ctx.fillText(`УРОВЕНЬ ${hero.level}`,425,350);
 const req=xpForNextLevel(hero.level),p=Math.min(1,hero.xp/req);rr(ctx,425,375,930,32,16);ctx.fillStyle='#180827';ctx.fill();if(p>0){rr(ctx,425,375,Math.max(32,930*p),32,16);const g=ctx.createLinearGradient(425,0,1355,0);g.addColorStop(0,'#6D28D9');g.addColorStop(1,'#E879F9');ctx.fillStyle=g;ctx.fill();}ctx.fillStyle='#fff';ctx.font='bold 18px Arial';ctx.textAlign='center';ctx.fillText(`${hero.xp} / ${req} XP`,890,398);ctx.textAlign='left';
 const sx=85,sy=505,w=410,gap=35;stat(ctx,sx,sy,w,'❤️ HP',`${hero.hp}/${hero.max_hp}`);stat(ctx,sx+w+gap,sy,w,'⚔️ СИЛА',hero.strength);stat(ctx,sx+(w+gap)*2,sy,w,'🛡️ ЗАЩИТА',hero.defense);stat(ctx,sx,sy+115,w,'🏃 ЛОВКОСТЬ',hero.dexterity);stat(ctx,sx+w+gap,sy+115,w,'🧠 ИНТЕЛЛЕКТ',hero.intelligence);stat(ctx,sx+(w+gap)*2,sy+115,w,'🍀 УДАЧА',hero.luck);
 panel(ctx,85,760,1330,72);ctx.fillStyle='#C084FC';ctx.font='bold 21px Arial';ctx.fillText(`ПРОИСХОЖДЕНИЕ: ${org.passive}`,115,805);ctx.fillStyle='#8B5CF6';ctx.textAlign='right';ctx.fillText('GS EXPEDITIONS • RPG CORE V15.1',1385,805);ctx.textAlign='left';
 return c.toBuffer('image/png');
}
module.exports={createHeroCard};
