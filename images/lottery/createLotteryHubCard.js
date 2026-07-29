const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const BASE = path.join(__dirname, 'lottery-hub-base.png');

function fitText(ctx, text, maxWidth, startSize=25, minSize=14) {
  let size=startSize;
  while(size>minSize){ctx.font=`600 ${size}px Arial`; if(ctx.measureText(text).width<=maxWidth) break; size--;}
  return size;
}
function panel(ctx,x,y,w,h){ctx.save();ctx.fillStyle='rgba(7,6,18,0.96)';ctx.strokeStyle='rgba(177,120,31,0.65)';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(x,y,w,h,8);ctx.fill();ctx.stroke();ctx.restore();}

async function createLotteryHubCard({ prizePool, tickets }) {
  const base = await loadImage(BASE);
  const canvas = createCanvas(base.width, base.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(base,0,0);

  // Динамический фонд поверх статического значения на шаблоне.
  panel(ctx,75,438,420,120);
  ctx.textAlign='center'; ctx.textBaseline='middle';
  ctx.fillStyle='#f2c55c'; ctx.shadowColor='rgba(151,64,255,.75)'; ctx.shadowBlur=10;
  ctx.font='700 66px Georgia'; ctx.fillText(Number(prizePool||3000).toLocaleString('ru-RU'),285,480);
  ctx.shadowBlur=0; ctx.font='700 27px Georgia'; ctx.fillText('ПЫЛИ',285,535);

  // Динамическое число участников.
  panel(ctx,215,823,205,102);
  ctx.fillStyle='#b987ff'; ctx.font='700 56px Georgia'; ctx.fillText(String(tickets.length),317,866);
  ctx.fillStyle='#d6c7e8'; ctx.font='20px Arial'; ctx.fillText('ЧЕЛОВЕК',317,908);

  // До 30 серверных display name в заранее подготовленные строки.
  const shown=tickets.slice(0,30);
  const leftX=654, rightX=1030, maxW=265;
  const startY=444, step=36.5;
  ctx.textAlign='left'; ctx.textBaseline='middle';
  shown.forEach((ticket,i)=>{
    const col=i<15?0:1; const row=i%15;
    const x=col===0?leftX:rightX; const y=startY+row*step;
    const name=String(ticket.display_name||'Участник').replace(/[\r\n]/g,' ').slice(0,40);
    const size=fitText(ctx,name,maxW,22,13);
    ctx.font=`600 ${size}px Arial`; ctx.fillStyle='#e6ddf5';
    ctx.shadowColor='rgba(95,40,180,.65)';ctx.shadowBlur=4;ctx.fillText(name,x,y);ctx.shadowBlur=0;
  });

  return canvas.toBuffer('image/png');
}
module.exports={createLotteryHubCard};
