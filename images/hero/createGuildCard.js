const { createCanvas, loadImage } = require('canvas');
const { HERO_CLASSES, xpForNextLevel } = require('../../systems/hero/heroData');
function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.closePath();}
function panel(ctx,x,y,w,h){rr(ctx,x,y,w,h,24);ctx.fillStyle='rgba(13,5,28,.88)';ctx.fill();ctx.strokeStyle='rgba(168,85,247,.8)';ctx.lineWidth=2;ctx.stroke();}
async function createGuildCard(hero,user,active,nextBoss){
 const c=createCanvas(1500,860),ctx=c.getContext('2d'); const g=ctx.createLinearGradient(0,0,1500,860);g.addColorStop(0,'#050008');g.addColorStop(.5,'#24103d');g.addColorStop(1,'#09000f');ctx.fillStyle=g;ctx.fillRect(0,0,1500,860);
 ctx.globalAlpha=.08;ctx.fillStyle='#d8b4fe';ctx.font='bold 380px Arial';ctx.fillText('GS',880,445);ctx.globalAlpha=1;
 ctx.strokeStyle='#a855f7';ctx.lineWidth=5;rr(ctx,28,28,1444,804,36);ctx.stroke();
 ctx.fillStyle='#fff';ctx.font='bold 62px Arial';ctx.fillText('ГИЛЬДИЯ ГЕРОЕВ',75,120);ctx.fillStyle='#c084fc';ctx.font='bold 25px Arial';ctx.fillText('ЭКСПЕДИЦИИ • АЛХИМИЯ • WORLD BOSS',78,162);
 let avatar=null;try{avatar=await loadImage(user.displayAvatarURL({extension:'png',size:512}));}catch(_){}
 if(avatar){ctx.save();ctx.beginPath();ctx.arc(210,340,112,0,Math.PI*2);ctx.clip();ctx.drawImage(avatar,98,228,224,224);ctx.restore();ctx.strokeStyle='#c084fc';ctx.lineWidth=7;ctx.beginPath();ctx.arc(210,340,118,0,Math.PI*2);ctx.stroke();}
 panel(ctx,365,220,1040,265);ctx.fillStyle='#fff';ctx.font='bold 48px Arial';ctx.fillText(hero.name.toUpperCase(),410,285);const cls=HERO_CLASSES[hero.class_key];ctx.fillStyle='#c084fc';ctx.font='bold 28px Arial';ctx.fillText(`${cls.icon} ${cls.name} • Уровень ${hero.level}`,410,335);
 const req=xpForNextLevel(hero.level),p=Math.min(1,hero.xp/req);rr(ctx,410,375,900,30,15);ctx.fillStyle='#180827';ctx.fill();if(p>0){rr(ctx,410,375,Math.max(30,900*p),30,15);const x=ctx.createLinearGradient(410,0,1310,0);x.addColorStop(0,'#6d28d9');x.addColorStop(1,'#e879f9');ctx.fillStyle=x;ctx.fill();}ctx.fillStyle='#fff';ctx.font='bold 18px Arial';ctx.textAlign='center';ctx.fillText(`${hero.xp} / ${req} XP`,860,397);ctx.textAlign='left';
 ctx.fillStyle='#ddd6fe';ctx.font='bold 23px Arial';ctx.fillText(`Статус: ${active ? '🧭 В экспедиции' : hero.status==='wounded' ? '🩹 Восстанавливается' : '✅ Готов'}`,410,452);
 panel(ctx,75,545,410,205);panel(ctx,545,545,410,205);panel(ctx,1015,545,390,205);
 ctx.fillStyle='#fff';ctx.font='bold 31px Arial';ctx.fillText('🧭 ЭКСПЕДИЦИИ',110,605);ctx.fillText('🧪 АЛХИМИЯ',580,605);ctx.fillText('👹 WORLD BOSS',1050,605);
 ctx.fillStyle='#c4b5fd';ctx.font='22px Arial';ctx.fillText(active?'Герой вернётся к назначенному времени.':'3 локации меняются ежедневно.',110,650);ctx.fillText('Зелья, свитки и бомбы',580,650);ctx.fillText('Каждый день в 15:00 и 21:00',1050,650);ctx.fillText('Длительность похода: 4 часа.',110,688);ctx.fillText('усиливают походы и рейды.',580,688);ctx.fillText('по московскому времени.',1050,688);
 ctx.fillStyle='#a78bfa';ctx.font='bold 20px Arial';ctx.fillText(`Следующий босс: ${nextBoss.toLocaleString('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})} МСК`,1050,726);
 return c.toBuffer('image/png');
}
module.exports={createGuildCard};
