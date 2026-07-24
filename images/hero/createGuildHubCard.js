const { createCanvas } = require('canvas');
const { drawUiIcon } = require('../ui/drawUiIcon');

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth, startSize, minSize = 15, weight = 'normal') {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${weight} ${size}px Arial`;
    if (ctx.measureText(text).width <= maxWidth) return size;
    size -= 1;
  }
  return minSize;
}

function panel(ctx, x, y, w, h, title, subtitle, icon, accent) {
  rr(ctx, x, y, w, h, 26);
  const cardGrad = ctx.createLinearGradient(x, y, x + w, y + h);
  cardGrad.addColorStop(0, 'rgba(16, 6, 31, .96)');
  cardGrad.addColorStop(1, 'rgba(7, 2, 16, .94)');
  ctx.fillStyle = cardGrad;
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2.2;
  ctx.stroke();

  // Colored icon tile, matching the visual language of GS HUB.
  rr(ctx, x + 20, y + 20, 54, 54, 16);
  ctx.fillStyle = `${accent}24`;
  ctx.fill();
  ctx.strokeStyle = `${accent}70`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  drawUiIcon(ctx, icon, x + 31, y + 30, 32, accent);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 29px Arial';
  ctx.fillText(title, x + 88, y + 50);

  const subtitleX = x + 26;
  const subtitleMax = w - 52;
  const subtitleSize = fitText(ctx, subtitle, subtitleMax, 20, 15, 'normal');
  ctx.font = `${subtitleSize}px Arial`;
  ctx.fillStyle = '#c4b5fd';
  ctx.fillText(subtitle, subtitleX, y + 91);

  // Small decorative accent line.
  rr(ctx, x + 24, y + h - 13, Math.min(82, w - 48), 3, 2);
  ctx.fillStyle = accent;
  ctx.fill();
}

async function createGuildHubCard() {
  const c = createCanvas(1500, 900);
  const ctx = c.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, 1500, 900);
  bg.addColorStop(0, '#030006');
  bg.addColorStop(.48, '#26103f');
  bg.addColorStop(1, '#08000f');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1500, 900);

  ctx.globalAlpha = .075;
  ctx.fillStyle = '#d8b4fe';
  ctx.font = 'bold 420px Arial';
  ctx.fillText('GS', 870, 520);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = '#a855f7';
  ctx.lineWidth = 5;
  rr(ctx, 28, 28, 1444, 844, 36);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 66px Arial';
  ctx.fillText('ГИЛЬДИЯ ГЕРОЕВ', 76, 120);
  ctx.fillStyle = '#c084fc';
  ctx.font = 'bold 25px Arial';
  ctx.fillText('СОЗДАЙ ГЕРОЯ • РАЗВИВАЙСЯ • ОТПРАВЛЯЙСЯ В ПРИКЛЮЧЕНИЯ', 80, 164);

  rr(ctx, 74, 206, 1352, 126, 28);
  const heroGrad = ctx.createLinearGradient(74, 206, 1426, 332);
  heroGrad.addColorStop(0, 'rgba(91,33,182,.9)');
  heroGrad.addColorStop(.55, 'rgba(76,29,149,.7)');
  heroGrad.addColorStop(1, 'rgba(40,10,68,.82)');
  ctx.fillStyle = heroGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(216,180,254,.82)';
  ctx.lineWidth = 2;
  ctx.stroke();

  rr(ctx, 103, 224, 54, 54, 16);
  ctx.fillStyle = 'rgba(255,255,255,.1)';
  ctx.fill();
  drawUiIcon(ctx, 'hero', 114, 235, 32, '#ffffff');

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 37px Arial';
  ctx.fillText('ТВОЯ ИСТОРИЯ НАЧИНАЕТСЯ ЗДЕСЬ', 174, 260);
  ctx.fillStyle = '#ddd6fe';
  ctx.font = '23px Arial';
  ctx.fillText('Выбери класс, происхождение и имя. Один участник — один постоянный герой.', 116, 302);

  panel(ctx, 74, 382, 318, 132, 'ПРОФИЛЬ', 'Уровень, XP и параметры', 'profile', '#f59e0b');
  panel(ctx, 420, 382, 318, 132, 'ИНВЕНТАРЬ', 'Предметы и экипировка', 'inventory', '#a855f7');
  panel(ctx, 766, 382, 318, 132, 'КУЗНЕЦ', 'Крафт и улучшения', 'hammer', '#ef4444');
  panel(ctx, 1112, 382, 314, 132, 'АЛХИМИК', 'Зелья и усиления', 'alchemy', '#22c55e');

  panel(ctx, 74, 548, 424, 132, 'ПИТОМЦЫ', 'Спутники из экспедиций', 'paw', '#38bdf8');
  panel(ctx, 538, 548, 424, 132, 'АРТЕФАКТЫ', 'Редкие реликвии и бонусы', 'artifact', '#c084fc');
  panel(ctx, 1002, 548, 424, 132, 'КОДЕКС', 'Классы, правила и открытия', 'book', '#fbbf24');

  rr(ctx, 74, 724, 1352, 94, 24);
  const expGrad = ctx.createLinearGradient(74, 724, 1426, 818);
  expGrad.addColorStop(0, 'rgba(15, 23, 42, .96)');
  expGrad.addColorStop(1, 'rgba(28, 8, 48, .94)');
  ctx.fillStyle = expGrad;
  ctx.fill();
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 2;
  ctx.stroke();

  rr(ctx, 98, 742, 48, 48, 14);
  ctx.fillStyle = 'rgba(59,130,246,.16)';
  ctx.fill();
  drawUiIcon(ctx, 'compass', 107, 751, 30, '#60a5fa');

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px Arial';
  ctx.fillText('ЭКСПЕДИЦИИ', 160, 765);
  ctx.fillStyle = '#c4b5fd';
  ctx.font = '20px Arial';
  ctx.fillText('4 часа в пути • ежедневные локации • герой в походе не участвует в World Boss', 112, 798);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#8b5cf6';
  ctx.font = 'bold 19px Arial';
  ctx.fillText('GAME SYNDICATE • HERO GUILD V16.0.2', 1392, 852);
  ctx.textAlign = 'left';

  return c.toBuffer('image/png');
}

module.exports = { createGuildHubCard };
