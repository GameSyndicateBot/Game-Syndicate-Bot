const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const colors = require('../ui/colors');
const { drawBackground, drawFrame, drawHeader, drawPanel, drawStatBox, drawTag, drawAutoText, roundRect } = require('../ui/draw');
const { installIconRenderer } = require('../ui/icons');
const WIDTH=1600, HEIGHT=900;
const RARITY={common:colors.common,rare:colors.rare,epic:colors.epic,legendary:colors.legendary,mythic:colors.mythic,exclusive:'#22D3EE',holographic:'#F472B6',treasure:colors.gold};
async function createAuctionPanel(data={}){
 const canvas=createCanvas(WIDTH,HEIGHT),ctx=canvas.getContext('2d');
 drawBackground(ctx,WIDTH,HEIGHT,'AUCTION'); drawFrame(ctx,WIDTH,HEIGHT);
 drawHeader(ctx,'◇ АУКЦИОН КАРТОЧЕК',`GAME SYNDICATE • ЛОТ #${data.id??'—'}`,WIDTH);
 const owned=data.owned, accent=owned?(RARITY[owned.rarity]||colors.gold):colors.muted;
 drawStatBox(ctx,90,185,430,120,'ЦЕНА ЛОТА',`${Number(data.price||0).toLocaleString('ru-RU')} DUST`,colors.gold);
 drawStatBox(ctx,585,185,430,120,'СТАТУС',data.statusLabel||'АКТИВЕН',data.statusColor||colors.green,{valueSize:34});
 drawStatBox(ctx,1080,185,430,120,'СРОК',`${data.ttlDays??7} ДНЕЙ`,colors.purpleLight);
 drawPanel(ctx,90,345,1420,405,{fill:'rgba(0,0,0,0.43)',stroke:accent,lineWidth:3,radius:30});
 const x=135,y=385,w=270,h=325; roundRect(ctx,x,y,w,h,24); ctx.save();ctx.clip();
 if(owned?.image){try{const img=await loadImage(path.resolve(process.cwd(),owned.image));const s=Math.max(w/img.width,h/img.height),sw=w/s,sh=h/s;ctx.drawImage(img,(img.width-sw)/2,(img.height-sh)/2,sw,sh,x,y,w,h);}catch(_){ctx.fillStyle=colors.dark;ctx.fillRect(x,y,w,h);}}
 else{ctx.fillStyle=colors.dark;ctx.fillRect(x,y,w,h);} ctx.restore();ctx.strokeStyle=accent;ctx.lineWidth=3;roundRect(ctx,x,y,w,h,24);ctx.stroke();
 ctx.fillStyle=colors.white; drawAutoText(ctx,owned?`${owned.code} • ${owned.name}`:'КАРТОЧКА НЕДОСТУПНА',455,435,980,48,{minSize:28});
 ctx.fillStyle=accent;ctx.font='bold 30px Arial';ctx.fillText(owned?String(owned.rarity).toUpperCase():'UNKNOWN',455,490);
 ctx.fillStyle=colors.muted;ctx.font='bold 24px Arial';ctx.fillText(owned?`Экземпляр #${String(owned.copy_number).padStart(6,'0')}`:'Данные карточки отсутствуют',455,535);
 drawTag(ctx,455,575,data.active?'ДОСТУПНО ДЛЯ ПОКУПКИ':(data.statusLabel||'ЛОТ ЗАКРЫТ'),data.active?colors.green:(data.statusColor||colors.red));
 ctx.fillStyle=colors.text;ctx.font='23px Arial';ctx.fillText('Продавец:',455,665);ctx.fillStyle=colors.white;ctx.font='bold 25px Arial';drawAutoText(ctx,data.sellerName||`ID ${data.sellerId||'—'}`,590,665,800,25,{minSize:18});
 ctx.fillStyle=colors.muted;ctx.font='bold 21px Arial';ctx.textAlign='center';ctx.fillText('Покупка мгновенно передаёт карточку и переводит GS Dust продавцу',WIDTH/2,815);ctx.textAlign='left';
 return canvas.toBuffer('image/png');
}
module.exports={createAuctionPanel};
