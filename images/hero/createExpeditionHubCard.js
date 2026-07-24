const { createCanvas } = require('canvas');
const { drawUiIcon } = require('../ui/drawUiIcon');

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth, startSize, minSize = 16, weight = 'normal') {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px Arial`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 1;
  }
  return minSize;
}


function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 2) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) {
      line = test;
      continue;
    }

    if (line) lines.push(line);
    line = word;
    if (lines.length >= maxLines - 1) break;
  }

  if (line && lines.length < maxLines) lines.push(line);

  const consumed = lines.join(' ').split(/\s+/).filter(Boolean).length;
  if (consumed < words.length && lines.length) {
    let last = lines.length - 1;
    let candidate = lines[last];
    while (candidate.length > 1 && ctx.measureText(`${candidate}…`).width > maxWidth) {
      candidate = candidate.slice(0, -1);
    }
    lines[last] = `${candidate.trimEnd()}…`;
  }

  lines.forEach((value, index) => ctx.fillText(value, x, y + index * lineHeight));
  return lines.length;
}

function locationPanel(ctx, x, y, w, h, location, accent) {
  rr(ctx, x, y, w, h, 26);
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  grad.addColorStop(0, 'rgba(19, 8, 36, .97)');
  grad.addColorStop(1, 'rgba(7, 2, 17, .95)');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  rr(ctx, x + 22, y + 22, 58, 58, 18);
  ctx.fillStyle = `${accent}26`;
  ctx.fill();
  ctx.strokeStyle = `${accent}72`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  drawUiIcon(ctx, location.difficulty >= 4 ? 'flame' : location.difficulty >= 3 ? 'shield' : 'compass', x + 34, y + 34, 34, accent);

  ctx.fillStyle = '#ffffff';
  const titleSize = fitText(ctx, location.name.toUpperCase(), w - 118, 29, 20, 'bold');
  ctx.font = `bold ${titleSize}px Arial`;
  ctx.fillText(location.name.toUpperCase(), x + 96, y + 57);

  ctx.fillStyle = '#ddd6fe';
  ctx.font = '20px Arial';
  ctx.fillText(`Опасность: ${'●'.repeat(location.difficulty)}${'○'.repeat(5 - location.difficulty)}`, x + 28, y + 111);

  const descSize = fitText(ctx, location.description, w - 56, 17, 14);
  ctx.font = `${descSize}px Arial`;
  ctx.fillStyle = '#a78bfa';
  wrapText(ctx, location.description, x + 28, y + 151, w - 56, 23, 2);

  ctx.fillStyle = accent;
  rr(ctx, x + 28, y + h - 15, 94, 4, 2);
  ctx.fill();
}

async function createExpeditionHubCard({ world, nextBossLabel, locked }) {
  const c = createCanvas(1500, 920);
  const ctx = c.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, 1500, 920);
  bg.addColorStop(0, '#020006');
  bg.addColorStop(.48, '#210d3c');
  bg.addColorStop(1, '#06000c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1500, 920);

  ctx.globalAlpha = .07;
  ctx.fillStyle = '#d8b4fe';
  ctx.font = 'bold 390px Arial';
  ctx.fillText('GS', 900, 520);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = locked ? '#ef4444' : '#8b5cf6';
  ctx.lineWidth = 5;
  rr(ctx, 28, 28, 1444, 864, 36);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 66px Arial';
  ctx.fillText('ЭКСПЕДИЦИИ', 76, 120);
  ctx.fillStyle = '#c084fc';
  ctx.font = 'bold 25px Arial';
  ctx.fillText('ВЫБИРАЙ МАРШРУТ • РИСКУЙ • ВОЗВРАЩАЙСЯ С ДОБЫЧЕЙ', 80, 164);

  rr(ctx, 74, 204, 1352, 130, 28);
  const infoGrad = ctx.createLinearGradient(74, 204, 1426, 334);
  infoGrad.addColorStop(0, locked ? 'rgba(127,29,29,.82)' : 'rgba(76,29,149,.86)');
  infoGrad.addColorStop(1, 'rgba(31,8,51,.88)');
  ctx.fillStyle = infoGrad;
  ctx.fill();
  ctx.strokeStyle = locked ? '#f87171' : '#c084fc';
  ctx.lineWidth = 2;
  ctx.stroke();

  drawUiIcon(ctx, 'compass', 102, 234, 48, '#ffffff');
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 31px Arial';
  ctx.fillText(locked ? 'ЭКСПЕДИЦИИ ВРЕМЕННО ЗАКРЫТЫ' : 'ТРИ МАРШРУТА ДОСТУПНЫ СЕГОДНЯ', 176, 260);
  ctx.fillStyle = '#ede9fe';
  ctx.font = '21px Arial';
  ctx.fillText(locked ? 'До World Boss осталось менее 4 часов — герой не успеет вернуться.' : 'Поход длится 4 часа. Во время экспедиции герой не участвует в World Boss.', 112, 302);

  const accents = ['#22c55e', '#f59e0b', '#a855f7'];
  const locations = world.locations.slice(0, 3);
  locationPanel(ctx, 74, 382, 424, 224, locations[0], accents[0]);
  locationPanel(ctx, 538, 382, 424, 224, locations[1], accents[1]);
  locationPanel(ctx, 1002, 382, 424, 224, locations[2], accents[2]);

  rr(ctx, 74, 650, 662, 142, 25);
  ctx.fillStyle = 'rgba(10, 4, 22, .94)';
  ctx.fill();
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.stroke();
  drawUiIcon(ctx, 'mana', 104, 686, 42, '#38bdf8');
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 27px Arial';
  ctx.fillText(`ПОГОДА: ${world.weather.name.toUpperCase()}`, 166, 707);
  ctx.fillStyle = '#bae6fd';
  const weatherSize = fitText(ctx, world.weather.description, 580, 20, 15);
  ctx.font = `${weatherSize}px Arial`;
  ctx.fillText(world.weather.description, 108, 755);

  rr(ctx, 764, 650, 662, 142, 25);
  ctx.fillStyle = 'rgba(10, 4, 22, .94)';
  ctx.fill();
  ctx.strokeStyle = locked ? '#ef4444' : '#fbbf24';
  ctx.lineWidth = 2;
  ctx.stroke();
  drawUiIcon(ctx, 'skull', 794, 686, 42, locked ? '#f87171' : '#fbbf24');
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 27px Arial';
  ctx.fillText('СЛЕДУЮЩИЙ WORLD BOSS', 856, 707);
  ctx.fillStyle = locked ? '#fecaca' : '#fde68a';
  ctx.font = 'bold 23px Arial';
  ctx.fillText(nextBossLabel, 798, 755);

  ctx.fillStyle = '#8b5cf6';
  ctx.font = 'bold 19px Arial';
  ctx.textAlign = 'right';
  ctx.fillText('GAME SYNDICATE • EXPEDITION HUB V16.1.2', 1392, 858);
  ctx.textAlign = 'left';

  return c.toBuffer('image/png');
}

module.exports = { createExpeditionHubCard };
