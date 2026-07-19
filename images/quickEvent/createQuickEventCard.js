const { createCanvas, loadImage } = require('canvas');

const TYPE_META = {
  unscramble: { title: 'СОБЕРИ СЛОВО', accent: '#b879ff' },
  math: { title: 'РЕШИ ПРИМЕР', accent: '#58b9ff' },
  color: { title: 'ОПРЕДЕЛИ ЦВЕТ', accent: '#ff6fae' },
  typing: { title: 'ПЕРЕПЕЧАТАЙ ФРАЗУ', accent: '#70e6d0' },
  odd: { title: 'НАЙДИ ЛИШНЕЕ', accent: '#ffb45f' },
  memory: { title: 'ЗАПОМНИ ПОСЛЕДОВАТЕЛЬНОСТЬ', accent: '#9f7cff' },
  finish: { title: 'ЗАКОНЧИ СЛОВО', accent: '#65d6ff' },
  rarity: { title: 'УГАДАЙ РЕДКОСТЬ КАРТЫ', accent: '#ff6f7f' },
  avatar: { title: 'УГАДАЙ УЧАСТНИКА', accent: '#8ce66b' },
  reaction: { title: 'ТЕСТ НА РЕАКЦИЮ', accent: '#ffd15e' },
  sequence: { title: 'ПРОДОЛЖИ РЯД', accent: '#6ed4ff' },
  reverse: { title: 'РАЗВЕРНИ СЛОВО', accent: '#c58cff' },
  emoji_riddle: { title: 'ЭМОДЗИ-ЗАГАДКА', accent: '#ff9f6e' },
  true_false: { title: 'ВЕРНО ИЛИ НЕТ', accent: '#72e6b1' },
  treasure_chest: { title: 'ТАИНСТВЕННЫЙ СУНДУК', accent: '#43e38d' },
  lucky_roll: { title: 'LUCKY ROLL', accent: '#63f3ff' },
  world_boss: { title: 'МИРОВОЙ БОСС', accent: '#ff5d73' },
};

function rounded(ctx,x,y,w,h,r){ctx.beginPath();ctx.roundRect(x,y,w,h,r);}
function background(ctx,w,h,accent){
  const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#08050f');g.addColorStop(.55,'#190b32');g.addColorStop(1,'#06030b');
  ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  for(let i=0;i<80;i++){ctx.globalAlpha=.12+Math.random()*.22;ctx.fillStyle=i%4?accent:'#fff';ctx.beginPath();ctx.arc(Math.random()*w,Math.random()*h,Math.random()*2+1,0,Math.PI*2);ctx.fill();}
  ctx.globalAlpha=1;
}
function wrap(ctx,text,maxWidth){const words=String(text).split(' '),lines=[];let line='';for(const word of words){const t=line?`${line} ${word}`:word;if(ctx.measureText(t).width>maxWidth&&line){lines.push(line);line=word;}else line=t;}if(line)lines.push(line);return lines;}
function glowText(ctx,text,x,y,size,accent,align='left'){
  ctx.save();ctx.font=`700 ${size}px Arial`;ctx.textAlign=align;ctx.fillStyle='#fff';ctx.shadowColor=accent;ctx.shadowBlur=18;ctx.fillText(text,x,y);ctx.restore();
}
async function drawMedia(ctx, media, x,y,w,h, pixelated=false, silhouette=false){
  if(!media) return false;
  try{
    const img=await loadImage(media);
    ctx.save();rounded(ctx,x,y,w,h,24);ctx.clip();
    if(pixelated){
      const small=createCanvas(28,28),s=small.getContext('2d');s.drawImage(img,0,0,28,28);ctx.imageSmoothingEnabled=false;ctx.drawImage(small,x,y,w,h);
    } else ctx.drawImage(img,x,y,w,h);
    if(silhouette){ctx.globalCompositeOperation='source-atop';ctx.fillStyle='rgba(3,2,8,.78)';ctx.fillRect(x,y,w,h);ctx.globalCompositeOperation='source-over';}
    ctx.restore();return true;
  }catch{return false;}
}
async function createQuickEventCard(event, phase='active'){
  const w=1400,h=760,c=createCanvas(w,h),ctx=c.getContext('2d');
  const meta=TYPE_META[event.type]||TYPE_META.math;
  const tier=event.tier||'normal';
  const accent=tier==='jackpot'?'#63f3ff':tier==='golden'?'#ffd15e':meta.accent;
  background(ctx,w,h,accent);
  ctx.strokeStyle=accent;ctx.lineWidth=3;ctx.shadowColor=accent;ctx.shadowBlur=24;rounded(ctx,45,45,w-90,h-90,32);ctx.stroke();ctx.shadowBlur=0;
  const eventTitle=tier==='jackpot'?'GS JACKPOT EVENT':tier==='golden'?'GS GOLDEN EVENT':'GS QUICK EVENT';
  glowText(ctx,eventTitle,85,120,34,accent);
  ctx.fillStyle=accent;ctx.font='700 22px Arial';ctx.fillText(`${meta.title} • ${String(event.difficulty||'medium').toUpperCase()}`,85,165);
  rounded(ctx,85,205,w-170,390,28);ctx.fillStyle='rgba(20,10,38,.84)';ctx.fill();ctx.strokeStyle='rgba(184,121,255,.42)';ctx.stroke();

  if(event.media){
    const ok=await drawMedia(ctx,event.media,510,235,380,300,event.type==='avatar',event.type==='rarity');
    if(!ok){ctx.fillStyle='#2a1646';ctx.fillRect(510,235,380,300);}
  } else if(event.type==='color'){
    ctx.textAlign='center';ctx.font='900 86px Arial';ctx.fillStyle=event.colorHex||'#58b9ff';ctx.shadowColor=event.colorHex||accent;ctx.shadowBlur=22;ctx.fillText(event.display,700,410);ctx.shadowBlur=0;
  } else if(event.type==='memory' && phase==='show'){
    ctx.textAlign='center';ctx.font='900 72px Arial';ctx.fillStyle='#fff';ctx.fillText(event.display,700,410);
  } else if(event.type==='reaction' && phase==='ready'){
    glowText(ctx,'ПРИГОТОВЬТЕСЬ...',700,410,66,accent,'center');
  } else if(event.type==='reaction' && phase==='go'){
    glowText(ctx,'ЖМИ!',700,425,110,accent,'center');
  } else {
    ctx.font='700 48px Arial';ctx.fillStyle='#fff';ctx.textAlign='center';
    const cardPrompt=event.type==='emoji_riddle'
      ?'ЭМОДЗИ ПОКАЗАНЫ В СООБЩЕНИИ DISCORD'
      :(event.prompt||event.display||'');
    const lines=wrap(ctx,cardPrompt,1050);let yy=330-(lines.length-1)*30;for(const line of lines){ctx.fillText(line,700,yy);yy+=68;}
    if(event.options?.length){ctx.font='600 30px Arial';ctx.fillStyle='#cbbbe0';ctx.fillText(event.options.join('    •    '),700,520);}
  }
  ctx.textAlign='left';ctx.fillStyle='#bcb0d0';ctx.font='24px Arial';
  const footer=phase==='show'?'Запоминайте — изображение исчезнет через несколько секунд':phase==='ready'?'Не отвечайте до сигнала':event.type==='reaction'?'Первый, кто напишет «жми», побеждает':event.type==='treasure_chest'?'Первый нажавший забирает награду':event.type==='lucky_roll'?'Победитель выбирается случайно среди активных участников':event.type==='world_boss'?'Атакуйте вместе • одна атака в минуту':'Первый правильный ответ получает награду • до 3 уникальных попыток';
  ctx.fillText(footer,85,640);
  ctx.fillStyle=accent;ctx.font='700 23px Arial';
  const rewardHint=tier==='jackpot'?'JACKPOT: DUST • BASE PACK • PREMIUM PACK':tier==='golden'?'GOLDEN: ПОВЫШЕННЫЙ DUST • УЛУЧШЕННЫЙ ПАК':'НАГРАДА: GS DUST ИЛИ ПАК';
  ctx.fillText(rewardHint,85,685);
  return c.toBuffer('image/png');
}
async function createQuickEventWinnerCard(data){
  const w=1400,h=760,c=createCanvas(w,h),ctx=c.getContext('2d');const meta=TYPE_META[data.type]||TYPE_META.math;const tier=data.tier||data.reward?.tier||'normal';const accent=tier==='jackpot'?'#63f3ff':tier==='golden'?'#ffd15e':meta.accent;
  background(ctx,w,h,accent);ctx.strokeStyle='#ffd978';ctx.lineWidth=4;ctx.shadowColor='#ffd978';ctx.shadowBlur=28;rounded(ctx,45,45,w-90,h-90,32);ctx.stroke();ctx.shadowBlur=0;
  const winnerTitle=tier==='jackpot'?'JACKPOT EVENT ЗАВЕРШЁН':tier==='golden'?'GOLDEN EVENT ЗАВЕРШЁН':'QUICK EVENT ЗАВЕРШЁН';
  glowText(ctx,winnerTitle,700,125,42,tier==='jackpot'?'#63f3ff':'#ffd978','center');ctx.fillStyle=accent;ctx.font='700 23px Arial';ctx.textAlign='center';ctx.fillText(meta.title,700,175);
  rounded(ctx,150,235,1100,330,28);ctx.fillStyle='rgba(20,10,38,.88)';ctx.fill();ctx.strokeStyle='rgba(255,217,120,.55)';ctx.stroke();
  glowText(ctx,data.winnerName,700,345,58,accent,'center');ctx.fillStyle='#bcb0d0';ctx.font='24px Arial';ctx.fillText('ПЕРВЫЙ ПРАВИЛЬНЫЙ ОТВЕТ',700,395);
  glowText(ctx,data.reward.label,700,490,48,'#ffd978','center');ctx.fillStyle='#bcb0d0';ctx.font='22px Arial';ctx.fillText(data.reward.details||'',700,535);
  ctx.fillStyle=accent;ctx.font='700 22px Arial';ctx.fillText('Следующее событие появится случайно',700,660);
  return c.toBuffer('image/png');
}
module.exports={createQuickEventCard,createQuickEventWinnerCard};
