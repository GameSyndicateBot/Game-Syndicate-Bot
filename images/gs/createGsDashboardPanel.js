const { createCanvas, loadImage } = require('canvas');
const colors = require('../ui/colors');
const { drawBackground, drawFrame, drawPanel, drawProgressBar, roundRect } = require('../ui/draw');

const WIDTH = 1600;
const HEIGHT = 900;

function fitText(ctx, text, maxWidth, fontSize, minSize = 16) {
    const value = String(text ?? '');
    let size = fontSize;
    while (size > minSize) {
        ctx.font = `bold ${size}px Arial`;
        if (ctx.measureText(value).width <= maxWidth) return { text: value, size };
        size -= 2;
    }
    ctx.font = `bold ${size}px Arial`;
    let clipped = value;
    while (clipped.length > 2 && ctx.measureText(`${clipped}…`).width > maxWidth) clipped = clipped.slice(0, -1);
    return { text: clipped.length < value.length ? `${clipped}…` : clipped, size };
}

function getRank(level) {
    if (level >= 35) return 'Легенда';
    if (level >= 20) return 'Чемпион';
    if (level >= 10) return 'Воин';
    if (level >= 5) return 'Искатель';
    return 'Новичок';
}

function line(ctx, x1, y1, x2, y2) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

function drawIcon(ctx, type, cx, cy, size, accent) {
    ctx.save();
    ctx.strokeStyle = accent;
    ctx.fillStyle = accent;
    ctx.lineWidth = Math.max(3, size * 0.065);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = accent;
    ctx.shadowBlur = 14;
    const s = size;

    if (type === 'profile') {
        ctx.beginPath(); ctx.arc(cx, cy - s * .18, s * .18, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy + s * .28, s * .34, Math.PI, 0); ctx.stroke();
    } else if (type === 'cards') {
        roundRect(ctx, cx - s*.28, cy - s*.30, s*.42, s*.55, s*.05); ctx.stroke();
        roundRect(ctx, cx - s*.08, cy - s*.18, s*.42, s*.55, s*.05); ctx.stroke();
    } else if (type === 'trophy') {
        roundRect(ctx, cx-s*.18, cy-s*.30, s*.36, s*.32, s*.05); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx-s*.22, cy-s*.16, s*.16, -Math.PI/2, Math.PI/2); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx+s*.22, cy-s*.16, s*.16, Math.PI/2, Math.PI*1.5); ctx.stroke();
        line(ctx,cx,cy+s*.02,cx,cy+s*.25); line(ctx,cx-s*.18,cy+s*.28,cx+s*.18,cy+s*.28);
    } else if (type === 'leaderboard') {
        ctx.strokeRect(cx-s*.30,cy, s*.17,s*.28); ctx.strokeRect(cx-s*.08,cy-s*.22,s*.17,s*.50); ctx.strokeRect(cx+s*.14,cy-s*.08,s*.17,s*.36);
    } else if (type === 'pack') {
        roundRect(ctx,cx-s*.30,cy-s*.18,s*.60,s*.44,s*.06);ctx.stroke();
        line(ctx,cx-s*.34,cy-s*.18,cx+s*.34,cy-s*.18); line(ctx,cx,cy-s*.28,cx,cy+s*.26);
    } else if (type === 'dust') {
        ctx.beginPath(); ctx.moveTo(cx,cy-s*.34);ctx.lineTo(cx+s*.28,cy);ctx.lineTo(cx,cy+s*.34);ctx.lineTo(cx-s*.28,cy);ctx.closePath();ctx.stroke();
        line(ctx,cx-s*.28,cy,cx+s*.28,cy);
    } else if (type === 'shop') {
        roundRect(ctx,cx-s*.28,cy-s*.08,s*.56,s*.36,s*.04);ctx.stroke();
        line(ctx,cx-s*.34,cy-s*.08,cx-s*.25,cy-s*.30);line(ctx,cx-s*.25,cy-s*.30,cx+s*.25,cy-s*.30);line(ctx,cx+s*.25,cy-s*.30,cx+s*.34,cy-s*.08);
        line(ctx,cx,cy+s*.28,cx,cy+s*.02);
    } else if (type === 'daily') {
        roundRect(ctx,cx-s*.30,cy-s*.27,s*.60,s*.55,s*.05);ctx.stroke();
        line(ctx,cx-s*.30,cy-s*.10,cx+s*.30,cy-s*.10); line(ctx,cx-s*.14,cy-s*.34,cx-s*.14,cy-s*.20); line(ctx,cx+s*.14,cy-s*.34,cx+s*.14,cy-s*.20);
        line(ctx,cx-s*.14,cy+s*.05,cx-s*.03,cy+s*.16);line(ctx,cx-s*.03,cy+s*.16,cx+s*.17,cy-s*.02);
    } else if (type === 'streak') {
        ctx.beginPath();ctx.moveTo(cx,cy+s*.33);ctx.bezierCurveTo(cx-s*.30,cy+s*.15,cx-s*.20,cy-s*.12,cx,cy-s*.34);ctx.bezierCurveTo(cx+s*.07,cy-s*.10,cx+s*.32,cy, cx+s*.20,cy+s*.22);ctx.bezierCurveTo(cx+s*.12,cy+s*.34,cx,cy+s*.33,cx,cy+s*.33);ctx.stroke();
    } else if (type === 'forecast') {
        ctx.beginPath();ctx.arc(cx,cy-s*.05,s*.25,0,Math.PI*2);ctx.stroke();
        ctx.beginPath();ctx.arc(cx-s*.08,cy-s*.10,s*.05,0,Math.PI*2);ctx.fill();
        line(ctx,cx-s*.22,cy+s*.25,cx+s*.22,cy+s*.25);line(ctx,cx-s*.14,cy+s*.25,cx-s*.22,cy+s*.36);line(ctx,cx+s*.14,cy+s*.25,cx+s*.22,cy+s*.36);
    } else if (type === 'trade') {
        line(ctx,cx-s*.30,cy-s*.13,cx+s*.20,cy-s*.13); line(ctx,cx+s*.20,cy-s*.13,cx+s*.08,cy-s*.25); line(ctx,cx+s*.20,cy-s*.13,cx+s*.08,cy-s*.01);
        line(ctx,cx+s*.30,cy+s*.13,cx-s*.20,cy+s*.13); line(ctx,cx-s*.20,cy+s*.13,cx-s*.08,cy+s*.01); line(ctx,cx-s*.20,cy+s*.13,cx-s*.08,cy+s*.25);
    } else if (type === 'auction') {
        roundRect(ctx,cx-s*.24,cy-s*.25,s*.33,s*.18,s*.03);ctx.stroke();
        line(ctx,cx-s*.08,cy-s*.07,cx+s*.24,cy+s*.25); line(ctx,cx+s*.12,cy+s*.13,cx+s*.25,cy); line(ctx,cx+s*.02,cy+s*.23,cx+s*.15,cy+s*.10);
        line(ctx,cx-s*.28,cy+s*.30,cx+s*.28,cy+s*.30);
    }
    ctx.restore();
}

async function drawAvatar(ctx, user, x, y, size) {
    const url = typeof user.displayAvatarURL === 'function'
        ? user.displayAvatarURL({ extension: 'png', size: 256 })
        : null;
    ctx.save();
    ctx.beginPath();ctx.arc(x+size/2,y+size/2,size/2,0,Math.PI*2);ctx.clip();
    ctx.fillStyle='rgba(139,92,246,.25)';ctx.fillRect(x,y,size,size);
    if (url) {
        try { const image = await loadImage(url); ctx.drawImage(image,x,y,size,size); } catch (_) {}
    }
    ctx.restore();
    ctx.strokeStyle=colors.purpleLight;ctx.lineWidth=5;ctx.shadowColor=colors.purple;ctx.shadowBlur=18;
    ctx.beginPath();ctx.arc(x+size/2,y+size/2,size/2+2,0,Math.PI*2);ctx.stroke();ctx.shadowBlur=0;
}

function drawTile(ctx, x, y, w, h, item) {
    const grad = ctx.createLinearGradient(x,y,x+w,y+h);
    grad.addColorStop(0,'rgba(30,11,55,.90)');grad.addColorStop(1,'rgba(7,2,16,.92)');
    drawPanel(ctx,x,y,w,h,{fill:grad,stroke:`${item.accent}88`,radius:24,lineWidth:2});
    ctx.fillStyle=`${item.accent}18`;roundRect(ctx,x+18,y+18,72,72,18);ctx.fill();
    drawIcon(ctx,item.icon,x+54,y+54,46,item.accent);
    ctx.fillStyle=colors.white;const t=fitText(ctx,item.title,w-126,25,18);ctx.font=`bold ${t.size}px Arial`;ctx.fillText(t.text,x+108,y+45);
    ctx.fillStyle=colors.muted;const s=fitText(ctx,item.subtitle,w-126,18,14);ctx.font=`bold ${s.size}px Arial`;ctx.fillText(s.text,x+108,y+73);
    if (item.value) {ctx.fillStyle=item.accent;ctx.font='bold 20px Arial';ctx.textAlign='right';ctx.fillText(item.value,x+w-22,y+h-18);ctx.textAlign='left';}
}

async function createGsDashboardPanel(user, data = {}) {
    const player=data.player??{}; const level=player.level??1; const xp=player.xp??0; const requiredXP=data.requiredXP??150;
    const dust=data.dust??0; const cardStats=data.cardStats??{unique:0,available:0,total:0}; const achievements=data.achievements??0; const totalAchievements=data.totalAchievements??0;
    const rank=getRank(level); const name=user.gsDisplayName||user.globalName||user.username;
    const canvas=createCanvas(WIDTH,HEIGHT); const ctx=canvas.getContext('2d');
    drawBackground(ctx,WIDTH,HEIGHT,'HUB'); drawFrame(ctx,WIDTH,HEIGHT);

    ctx.fillStyle=colors.white;ctx.font='bold 50px Arial';ctx.fillText('GS HUB',96,112);
    ctx.fillStyle=colors.violet;ctx.font='bold 24px Arial';ctx.fillText('GAME SYNDICATE  /  COMMAND CENTER',98,151);
    ctx.fillStyle=colors.purpleLight;ctx.font='bold 42px Arial';ctx.textAlign='right';ctx.fillText('GS',1505,116);ctx.textAlign='left';

    drawPanel(ctx,90,180,1420,180,{fill:'rgba(2,0,10,.68)',stroke:'rgba(192,132,252,.5)',radius:30});
    await drawAvatar(ctx,user,120,205,125);
    const safe=fitText(ctx,name,370,40,24);ctx.fillStyle=colors.white;ctx.font=`bold ${safe.size}px Arial`;ctx.fillText(safe.text,275,245);
    ctx.fillStyle=colors.purpleLight;ctx.font='bold 23px Arial';ctx.fillText(`${rank}  •  LEVEL ${level}`,275,282);
    ctx.fillStyle=colors.muted;ctx.font='bold 18px Arial';ctx.fillText('ТВОЙ ПРОГРЕСС',275,322);
    drawProgressBar(ctx,455,300,570,22,xp,requiredXP,colors.gold);
    ctx.fillStyle=colors.white;ctx.font='bold 20px Arial';ctx.textAlign='right';ctx.fillText(`${xp} / ${requiredXP} XP`,1025,284);ctx.textAlign='left';

    const mini = [
        ['GS DUST', dust, colors.gold],
        ['КАРТЫ', `${cardStats.unique}/${cardStats.available}`, colors.violet],
        [
            'ДОСТИЖЕНИЯ',
            totalAchievements
                ? `${achievements}/${totalAchievements}`
                : achievements,
            colors.orange,
        ],
    ];

    mini.forEach((item, index) => {
        const boxX = 1050 + index * 146;
        const boxY = 215;
        const boxW = 134;
        const boxH = 110;

        drawPanel(ctx, boxX, boxY, boxW, boxH, {
            fill: 'rgba(139,92,246,.11)',
            stroke: `${item[2]}77`,
            radius: 20,
        });

        const label = fitText(
            ctx,
            item[0],
            boxW - 26,
            15,
            11
        );

        ctx.fillStyle = colors.muted;
        ctx.font = `bold ${label.size}px Arial`;
        ctx.fillText(label.text, boxX + 13, boxY + 29);

        const value = fitText(
            ctx,
            String(item[1]),
            boxW - 26,
            29,
            20
        );

        ctx.fillStyle = item[2];
        ctx.font = `bold ${value.size}px Arial`;
        ctx.fillText(value.text, boxX + 13, boxY + 71);
    });

    const tiles=[
        {icon:'profile',title:'Профиль',subtitle:'уровень и статистика',accent:'#FBBF24',value:`Lv.${level}`},
        {icon:'cards',title:'Коллекция',subtitle:'альбом карточек',accent:'#A855F7',value:`${cardStats.unique}/${cardStats.available}`},
        {icon:'trophy',title:'Достижения',subtitle:'прогресс и награды',accent:'#F59E0B',value:totalAchievements?`${achievements}/${totalAchievements}`:''},
        {icon:'leaderboard',title:'Топы',subtitle:'рейтинги сервера',accent:'#3B82F6'},
        {icon:'pack',title:'Daily Pack',subtitle:'бесплатный набор',accent:'#22C55E'},
        {icon:'dust',title:'GS Dust',subtitle:'распыление копий',accent:'#C084FC',value:String(dust)},
        {icon:'shop',title:'Card Shop',subtitle:'карты за Dust',accent:'#FBBF24'},
        {icon:'daily',title:'Ежедневки',subtitle:'задания дня',accent:'#22C55E'},
        {icon:'trade',title:'Обмен',subtitle:'сделки между игроками',accent:'#60A5FA'},
        {icon:'auction',title:'Аукцион',subtitle:'покупка и продажа',accent:'#F97316'},
        {icon:'streak',title:'Серии',subtitle:'активность и рекорды',accent:'#EF4444'},
        {icon:'forecast',title:'Прогноз',subtitle:'предсказание дня',accent:'#C084FC'},
    ];
    const startX=90,startY=390,gapX=24,gapY=20,tileW=337,tileH=130;
    tiles.forEach((item,i)=>{const col=i%4,row=Math.floor(i/4);drawTile(ctx,startX+col*(tileW+gapX),startY+row*(tileH+gapY),tileW,tileH,item);});

    ctx.fillStyle = colors.muted;
    ctx.font = 'bold 17px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(
        'GS ENGINE v3  •  GAME SYNDICATE',
        WIDTH / 2,
        840
    );
    ctx.textAlign = 'left';
    return canvas.toBuffer('image/png');
}

module.exports={createGsDashboardPanel};
