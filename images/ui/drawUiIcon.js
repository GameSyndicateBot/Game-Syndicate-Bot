'use strict';

function stroke(ctx, color, width = 3) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function drawUiIcon(ctx, type, x, y, size, color = '#d8b4fe') {
  const s = size;
  const cx = x + s / 2;
  const cy = y + s / 2;
  ctx.save();
  ctx.fillStyle = color;
  stroke(ctx, color, Math.max(2, s * 0.08));

  switch (type) {
    case 'hero':
      ctx.beginPath(); ctx.arc(cx, y + s * .28, s * .16, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + s * .2, y + s * .82); ctx.quadraticCurveTo(cx, y + s * .5, x + s * .8, y + s * .82); ctx.stroke();
      break;
    case 'profile':
      ctx.beginPath(); ctx.arc(cx, y + s * .28, s * .14, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(x + s * .18, y + s * .5, s * .64, s * .34, s * .1); ctx.stroke();
      break;
    case 'inventory':
      ctx.beginPath(); ctx.roundRect(x + s * .18, y + s * .28, s * .64, s * .58, s * .1); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, y + s * .28, s * .18, Math.PI, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + s * .18, y + s * .48); ctx.lineTo(x + s * .82, y + s * .48); ctx.stroke();
      break;
    case 'hammer':
      ctx.beginPath(); ctx.moveTo(x + s * .28, y + s * .22); ctx.lineTo(x + s * .66, y + s * .6); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(x + s * .52, y + s * .12, s * .28, s * .22, s * .05); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + s * .2, y + s * .82); ctx.lineTo(x + s * .56, y + s * .46); ctx.stroke();
      break;
    case 'alchemy':
      ctx.beginPath(); ctx.moveTo(x + s * .4, y + s * .12); ctx.lineTo(x + s * .6, y + s * .12); ctx.lineTo(x + s * .6, y + s * .38); ctx.quadraticCurveTo(x + s * .85, y + s * .72, cx, y + s * .86); ctx.quadraticCurveTo(x + s * .15, y + s * .72, x + s * .4, y + s * .38); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + s * .28, y + s * .62); ctx.lineTo(x + s * .72, y + s * .62); ctx.stroke();
      break;
    case 'paw':
      [[.3,.35,.1],[.5,.25,.1],[.7,.35,.1]].forEach(([px,py,r])=>{ctx.beginPath();ctx.arc(x+s*px,y+s*py,s*r,0,Math.PI*2);ctx.fill();});
      ctx.beginPath(); ctx.ellipse(cx, y + s * .66, s * .24, s * .19, 0, 0, Math.PI * 2); ctx.fill();
      break;
    case 'artifact':
      ctx.beginPath(); ctx.moveTo(cx, y + s * .1); ctx.lineTo(x + s * .82, cy); ctx.lineTo(cx, y + s * .9); ctx.lineTo(x + s * .18, cy); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, y + s * .1); ctx.lineTo(cx, y + s * .9); ctx.moveTo(x + s * .18, cy); ctx.lineTo(x + s * .82, cy); ctx.stroke();
      break;
    case 'book':
      ctx.beginPath(); ctx.moveTo(cx, y + s * .25); ctx.quadraticCurveTo(x + s * .25, y + s * .12, x + s * .16, y + s * .3); ctx.lineTo(x + s * .16, y + s * .78); ctx.quadraticCurveTo(x + s * .34, y + s * .66, cx, y + s * .82); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, y + s * .25); ctx.quadraticCurveTo(x + s * .75, y + s * .12, x + s * .84, y + s * .3); ctx.lineTo(x + s * .84, y + s * .78); ctx.quadraticCurveTo(x + s * .66, y + s * .66, cx, y + s * .82); ctx.stroke();
      break;
    case 'compass':
      ctx.beginPath(); ctx.arc(cx, cy, s * .38, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + s * .62, y + s * .28); ctx.lineTo(x + s * .46, y + s * .58); ctx.lineTo(x + s * .38, y + s * .72); ctx.lineTo(x + s * .54, y + s * .42); ctx.closePath(); ctx.fill();
      break;
    case 'heart':
      ctx.beginPath(); ctx.moveTo(cx, y + s * .82); ctx.bezierCurveTo(x + s * .1, y + s * .55, x + s * .12, y + s * .2, cx, y + s * .38); ctx.bezierCurveTo(x + s * .88, y + s * .2, x + s * .9, y + s * .55, cx, y + s * .82); ctx.fill();
      break;
    case 'flame':
      ctx.beginPath(); ctx.moveTo(cx, y + s * .9); ctx.bezierCurveTo(x + s * .18,y+s*.68,x+s*.34,y+s*.42,x+s*.45,y+s*.18); ctx.bezierCurveTo(x+s*.72,y+s*.42,x+s*.9,y+s*.63,cx,y+s*.9); ctx.fill();
      break;
    case 'skull':
      ctx.beginPath(); ctx.arc(cx, y + s * .42, s * .28, Math.PI, 0); ctx.lineTo(x+s*.78,y+s*.56); ctx.quadraticCurveTo(cx,y+s*.82,x+s*.22,y+s*.56); ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.arc(x+s*.4,y+s*.45,s*.05,0,Math.PI*2); ctx.arc(x+s*.6,y+s*.45,s*.05,0,Math.PI*2); ctx.fill();
      break;
    case 'swords':
      ctx.beginPath(); ctx.moveTo(x+s*.2,y+s*.18); ctx.lineTo(x+s*.76,y+s*.74); ctx.moveTo(x+s*.8,y+s*.18); ctx.lineTo(x+s*.24,y+s*.74); ctx.stroke();
      break;
    case 'shield':
      ctx.beginPath(); ctx.moveTo(cx,y+s*.12); ctx.lineTo(x+s*.78,y+s*.25); ctx.lineTo(x+s*.72,y+s*.62); ctx.quadraticCurveTo(cx,y+s*.88,x+s*.28,y+s*.62); ctx.lineTo(x+s*.22,y+s*.25); ctx.closePath(); ctx.stroke();
      break;
    case 'lock':
      ctx.beginPath(); ctx.arc(cx,y+s*.4,s*.2,Math.PI,0); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(x+s*.25,y+s*.4,s*.5,s*.4,s*.07); ctx.stroke();
      break;
    case 'mana':
      ctx.beginPath(); ctx.moveTo(cx,y+s*.1); ctx.lineTo(x+s*.8,cy); ctx.lineTo(cx,y+s*.9); ctx.lineTo(x+s*.2,cy); ctx.closePath(); ctx.fill();
      break;
    case 'energy':
      ctx.beginPath(); ctx.moveTo(x+s*.58,y+s*.08); ctx.lineTo(x+s*.28,y+s*.54); ctx.lineTo(x+s*.5,y+s*.54); ctx.lineTo(x+s*.4,y+s*.92); ctx.lineTo(x+s*.74,y+s*.43); ctx.lineTo(x+s*.52,y+s*.43); ctx.closePath(); ctx.fill();
      break;
    case 'ult':
      ctx.beginPath(); ctx.arc(cx,cy,s*.36,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx,cy,s*.13,0,Math.PI*2); ctx.fill();
      break;
    case 'minion':
      ctx.beginPath(); ctx.arc(cx,cy,s*.34,0,Math.PI*2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+s*.3,y+s*.18);ctx.lineTo(x+s*.16,y+s*.04);ctx.moveTo(x+s*.7,y+s*.18);ctx.lineTo(x+s*.84,y+s*.04);ctx.stroke();
      ctx.beginPath(); ctx.arc(x+s*.4,y+s*.46,s*.04,0,Math.PI*2);ctx.arc(x+s*.6,y+s*.46,s*.04,0,Math.PI*2);ctx.fill();
      break;
    default:
      ctx.beginPath(); ctx.arc(cx, cy, s * .32, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
}

module.exports = { drawUiIcon };
