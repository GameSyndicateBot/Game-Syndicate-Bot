const ICONS = {
  '★':'star','☆':'star','■':'square','□':'square','⬜':'square','●':'dot','⚫':'dot',
  '◉':'voice','◎':'target','◇':'diamond','◆':'diamond','▣':'server','▤':'history',
  '▥':'cards','▦':'shop','▲':'streak','☾':'moon','⚡':'bolt','❤':'heart','♥':'heart',
  '✓':'check','✕':'close','×':'close','♻':'recycle','✦':'sparkle','✥':'navigation',
  '⏱':'clock','◷':'clock','♛':'crown','♣':'luck','⚪':'circle','⌂':'home',
  '↔':'trade','↻':'history','▶':'play'
};

function getFontSize(ctx) {
  const m = String(ctx.font || '').match(/(\d+(?:\.\d+)?)px/);
  return m ? Number(m[1]) : 24;
}

function drawVectorIcon(ctx, type, cx, cy, size, color = '#fff') {
  const s=size, x=cx-s/2, y=cy-s/2, lw=Math.max(1.5,s*.08);
  ctx.save(); ctx.strokeStyle=color; ctx.fillStyle=color; ctx.lineWidth=lw; ctx.lineCap='round'; ctx.lineJoin='round';
  const circle=(r,fill=false)=>{ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);fill?ctx.fill():ctx.stroke();};
  switch(type){
    case 'star': ctx.beginPath(); for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?s*.2:s*.46,px=cx+Math.cos(a)*r,py=cy+Math.sin(a)*r;i?ctx.lineTo(px,py):ctx.moveTo(px,py)} ctx.closePath();ctx.stroke();break;
    case 'square': ctx.beginPath();ctx.roundRect(x+s*.12,y+s*.12,s*.76,s*.76,s*.14);ctx.stroke();break;
    case 'dot': circle(s*.22,true);break;
    case 'circle': circle(s*.32);break;
    case 'voice': circle(s*.18);ctx.beginPath();ctx.moveTo(cx-s*.34,cy);ctx.quadraticCurveTo(cx,cy+s*.42,cx+s*.34,cy);ctx.stroke();break;
    case 'target': circle(s*.34);circle(s*.1,true);break;
    case 'diamond': ctx.beginPath();ctx.moveTo(cx,y+s*.08);ctx.lineTo(x+s*.9,cy);ctx.lineTo(cx,y+s*.92);ctx.lineTo(x+s*.1,cy);ctx.closePath();ctx.stroke();break;
    case 'server': for(let i=0;i<3;i++){const yy=y+s*(.12+i*.28);ctx.beginPath();ctx.roundRect(x+s*.12,yy,s*.76,s*.2,s*.05);ctx.stroke();ctx.beginPath();ctx.arc(x+s*.24,yy+s*.1,s*.025,0,Math.PI*2);ctx.fill()}break;
    case 'history': circle(s*.32);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx,cy-s*.18);ctx.lineTo(cx+s*.14,cy);ctx.stroke();break;
    case 'cards': ctx.beginPath();ctx.roundRect(x+s*.24,y+s*.1,s*.58,s*.76,s*.08);ctx.stroke();ctx.beginPath();ctx.roundRect(x+s*.08,y+s*.2,s*.58,s*.68,s*.08);ctx.stroke();break;
    case 'shop': ctx.beginPath();ctx.moveTo(x+s*.12,y+s*.34);ctx.lineTo(x+s*.2,y+s*.12);ctx.lineTo(x+s*.8,y+s*.12);ctx.lineTo(x+s*.88,y+s*.34);ctx.stroke();ctx.strokeRect(x+s*.18,y+s*.34,s*.64,s*.48);break;
    case 'streak': ctx.beginPath();ctx.moveTo(cx,y+s*.08);ctx.lineTo(x+s*.88,y+s*.84);ctx.lineTo(x+s*.12,y+s*.84);ctx.closePath();ctx.stroke();break;
    case 'moon': ctx.beginPath();ctx.arc(cx,cy,s*.34,Math.PI*.3,Math.PI*1.7);ctx.quadraticCurveTo(cx+s*.08,cy,cx+s*.2,cy-s*.28);ctx.stroke();break;
    case 'bolt': ctx.beginPath();ctx.moveTo(cx+s*.08,y+s*.05);ctx.lineTo(x+s*.28,cy);ctx.lineTo(cx-s*.02,cy);ctx.lineTo(cx-s*.08,y+s*.95);ctx.lineTo(x+s*.74,cy);ctx.lineTo(cx+s*.02,cy);ctx.closePath();ctx.stroke();break;
    case 'heart': ctx.beginPath();ctx.moveTo(cx,y+s*.84);ctx.bezierCurveTo(x,cy,x+s*.08,y+s*.12,cx,y+s*.34);ctx.bezierCurveTo(x+s*.92,y+s*.12,x+s,cy,cx,y+s*.84);ctx.stroke();break;
    case 'check': circle(s*.36);ctx.beginPath();ctx.moveTo(x+s*.27,cy);ctx.lineTo(x+s*.44,y+s*.67);ctx.lineTo(x+s*.76,y+s*.3);ctx.stroke();break;
    case 'close': circle(s*.36);ctx.beginPath();ctx.moveTo(x+s*.3,y+s*.3);ctx.lineTo(x+s*.7,y+s*.7);ctx.moveTo(x+s*.7,y+s*.3);ctx.lineTo(x+s*.3,y+s*.7);ctx.stroke();break;
    case 'recycle': for(let i=0;i<3;i++){const a=-Math.PI/2+i*Math.PI*2/3,b=a+Math.PI*.7;ctx.beginPath();ctx.arc(cx,cy,s*.28,a,b);ctx.stroke()}break;
    case 'sparkle': ctx.beginPath();ctx.moveTo(cx,y+s*.06);ctx.lineTo(cx+s*.1,cy-s*.1);ctx.lineTo(x+s*.94,cy);ctx.lineTo(cx+s*.1,cy+s*.1);ctx.lineTo(cx,y+s*.94);ctx.lineTo(cx-s*.1,cy+s*.1);ctx.lineTo(x+s*.06,cy);ctx.lineTo(cx-s*.1,cy-s*.1);ctx.closePath();ctx.stroke();break;
    case 'navigation': ctx.beginPath();ctx.moveTo(cx,y+s*.08);ctx.lineTo(x+s*.84,y+s*.84);ctx.lineTo(cx+s*.05,y+s*.65);ctx.lineTo(x+s*.2,y+s*.52);ctx.closePath();ctx.stroke();break;
    case 'clock': circle(s*.34);ctx.beginPath();ctx.moveTo(cx,cy);ctx.lineTo(cx,cy-s*.2);ctx.moveTo(cx,cy);ctx.lineTo(cx+s*.18,cy+s*.08);ctx.stroke();break;
    case 'crown': ctx.beginPath();ctx.moveTo(x+s*.12,y+s*.72);ctx.lineTo(x+s*.12,y+s*.34);ctx.lineTo(x+s*.32,y+s*.55);ctx.lineTo(cx,y+s*.2);ctx.lineTo(x+s*.68,y+s*.55);ctx.lineTo(x+s*.88,y+s*.34);ctx.lineTo(x+s*.88,y+s*.72);ctx.closePath();ctx.stroke();break;
    case 'luck': for(const [dx,dy] of [[-.13,-.13],[.13,-.13],[-.13,.13],[.13,.13]]){ctx.beginPath();ctx.arc(cx+s*dx,cy+s*dy,s*.12,0,Math.PI*2);ctx.stroke()}break;
    case 'home': ctx.beginPath();ctx.moveTo(x+s*.08,cy);ctx.lineTo(cx,y+s*.08);ctx.lineTo(x+s*.92,cy);ctx.moveTo(x+s*.2,cy);ctx.lineTo(x+s*.2,y+s*.88);ctx.lineTo(x+s*.8,y+s*.88);ctx.lineTo(x+s*.8,cy);ctx.stroke();break;
    case 'trade': ctx.beginPath();ctx.moveTo(x+s*.12,y+s*.34);ctx.lineTo(x+s*.8,y+s*.34);ctx.lineTo(x+s*.64,y+s*.2);ctx.moveTo(x+s*.8,y+s*.34);ctx.lineTo(x+s*.64,y+s*.48);ctx.moveTo(x+s*.88,y+s*.66);ctx.lineTo(x+s*.2,y+s*.66);ctx.lineTo(x+s*.36,y+s*.52);ctx.moveTo(x+s*.2,y+s*.66);ctx.lineTo(x+s*.36,y+s*.8);ctx.stroke();break;
    case 'play': ctx.beginPath();ctx.moveTo(x+s*.28,y+s*.16);ctx.lineTo(x+s*.8,cy);ctx.lineTo(x+s*.28,y+s*.84);ctx.closePath();ctx.stroke();break;
    default: circle(s*.3);
  }
  ctx.restore();
}

function installIconText(ctx){
  if(!ctx || ctx.__gsIconTextInstalled) return ctx;
  ctx.__gsIconTextInstalled=true;
  const fill=ctx.fillText.bind(ctx), measure=ctx.measureText.bind(ctx);
  ctx.fillText=function(text,x,y,maxWidth){
    const value=String(text??'');
    if(![...value].some(ch=>ICONS[ch])) return maxWidth===undefined?fill(value,x,y):fill(value,x,y,maxWidth);
    const fs=getFontSize(ctx), iconSize=Math.max(12,fs*.72), gap=Math.max(4,fs*.14), parts=[]; let buf='';
    for(const ch of value){if(ICONS[ch]){if(buf){parts.push({text:buf});buf=''}parts.push({icon:ICONS[ch]})}else buf+=ch} if(buf)parts.push({text:buf});
    const widths=parts.map(p=>p.icon?iconSize+gap:measure(p.text).width); let total=widths.reduce((a,b)=>a+b,0); if(parts.at(-1)?.icon)total-=gap;
    let cur=x; if(ctx.textAlign==='center')cur-=total/2; else if(ctx.textAlign==='right'||ctx.textAlign==='end')cur-=total;
    const color=typeof ctx.fillStyle==='string'?ctx.fillStyle:'#fff';
    for(let i=0;i<parts.length;i++){const p=parts[i]; if(p.icon){drawVectorIcon(ctx,p.icon,cur+iconSize/2,y-fs*.34,iconSize,color);cur+=widths[i]}else{const a=ctx.textAlign;ctx.textAlign='left';fill(p.text,cur,y);ctx.textAlign=a;cur+=widths[i]}}
  };
  return ctx;
}
module.exports={installIconText,drawVectorIcon};
