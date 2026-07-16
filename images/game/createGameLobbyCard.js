'use strict';
const { createCanvas } = require('canvas');
const WIDTH=1200, HEIGHT=620;
function rr(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function fit(ctx,value,max,start,min=18){const t=String(value||'—');for(let s=start;s>=min;s--){ctx.font=`700 ${s}px Arial`;if(ctx.measureText(t).width<=max)return{text:t,size:s};}let v=t;ctx.font=`700 ${min}px Arial`;while(v.length>1&&ctx.measureText(`${v}…`).width>max)v=v.slice(0,-1);return{text:`${v}…`,size:min};}
function field(ctx,x,y,w,label,value,accent){ctx.fillStyle='#aeb0c7';ctx.font='700 19px Arial';ctx.fillText(label.toUpperCase(),x,y);const f=fit(ctx,value,w,34,20);ctx.fillStyle='#f7f5ff';ctx.font=`700 ${f.size}px Arial`;ctx.fillText(f.text,x,y+43);ctx.fillStyle=accent;ctx.fillRect(x,y+57,Math.min(w,88),3);}
async function createGameLobbyCard({game,map,code,creatorName,createdAt=Date.now(),closesAt,status='open'}){
 const c=createCanvas(WIDTH,HEIGHT),ctx=c.getContext('2d');
 const bg=ctx.createLinearGradient(0,0,WIDTH,HEIGHT);bg.addColorStop(0,'#090811');bg.addColorStop(.5,'#171226');bg.addColorStop(1,'#08070e');ctx.fillStyle=bg;ctx.fillRect(0,0,WIDTH,HEIGHT);
 const glow=ctx.createRadialGradient(180,100,0,180,100,380);glow.addColorStop(0,'rgba(126,87,255,.34)');glow.addColorStop(1,'rgba(126,87,255,0)');ctx.fillStyle=glow;ctx.fillRect(0,0,760,520);
 rr(ctx,24,24,WIDTH-48,HEIGHT-48,32);ctx.fillStyle='rgba(14,12,25,.94)';ctx.fill();ctx.strokeStyle='rgba(151,116,255,.7)';ctx.lineWidth=2;ctx.stroke();
 ctx.fillStyle='#8c68ff';ctx.font='900 24px Arial';ctx.fillText('GAME SYNDICATE',70,80);
 ctx.fillStyle='#fff';ctx.font='900 52px Arial';ctx.fillText('GS GAME LOBBY',70,140);
 const open=status==='open', sc=open?'#4ce69b':'#ff687f', st=open?'ЛОББИ ОТКРЫТО':'ЛОББИ ЗАКРЫТО';
 rr(ctx,855,64,270,58,29);ctx.fillStyle=open?'rgba(56,224,144,.12)':'rgba(255,91,116,.12)';ctx.fill();ctx.strokeStyle=sc;ctx.stroke();ctx.fillStyle=sc;ctx.font='900 19px Arial';ctx.textAlign='center';ctx.fillText(st,990,101);ctx.textAlign='left';
 rr(ctx,65,185,1070,275,26);ctx.fillStyle='rgba(87,63,153,.12)';ctx.fill();ctx.strokeStyle='rgba(151,116,255,.32)';ctx.stroke();
 field(ctx,105,235,440,'Игра',game,'#9b7cff');field(ctx,625,235,440,'Карта / режим',map,'#63e8ff');
 ctx.fillStyle='#aeb0c7';ctx.font='700 19px Arial';ctx.fillText('КОД ЛОББИ',105,365);
 rr(ctx,105,384,960,58,15);ctx.fillStyle='rgba(3,3,9,.78)';ctx.fill();ctx.strokeStyle='rgba(99,232,255,.56)';ctx.lineWidth=2;ctx.stroke();
 const cf=fit(ctx,code,900,33,22);ctx.fillStyle='#63e8ff';ctx.font=`900 ${cf.size}px monospace`;ctx.textAlign='center';ctx.fillText(cf.text,585,423);ctx.textAlign='left';
 const fmt=(ts,opt)=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',...opt}).format(new Date(ts));
 const created=fmt(createdAt,{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
 const closed=fmt(open?closesAt:closesAt,{hour:'2-digit',minute:'2-digit'});
 ctx.fillStyle='#8d8fa8';ctx.font='700 17px Arial';ctx.fillText('СОЗДАЛ',76,510);ctx.fillText('СОЗДАНО',455,510);ctx.fillText(open?'АВТОЗАКРЫТИЕ':'ЗАКРЫТО',790,510);
 const cr=fit(ctx,creatorName,300,27,18);ctx.fillStyle='#f4f1ff';ctx.font=`700 ${cr.size}px Arial`;ctx.fillText(cr.text,76,548);ctx.font='700 25px Arial';ctx.fillText(created,455,548);ctx.fillStyle=sc;ctx.fillText(closed,790,548);
 ctx.fillStyle='#6d6f87';ctx.font='700 15px Arial';ctx.textAlign='right';ctx.fillText('GS ENGINE • GAME LOBBY',1125,582);
 return c.toBuffer('image/png');
}
module.exports={createGameLobbyCard};
