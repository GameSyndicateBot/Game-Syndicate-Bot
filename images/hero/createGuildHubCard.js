const { createCanvas } = require('canvas');

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.closePath();
}
function panel(ctx, x, y, w, h, title, subtitle, icon) {
  rr(ctx, x, y, w, h, 26);
  ctx.fillStyle = 'rgba(12, 4, 24, .86)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(168, 85, 247, .72)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 29px Arial';
  ctx.fillText(`${icon} ${title}`, x + 26, y + 49);
  ctx.fillStyle = '#c4b5fd';
  ctx.font = '21px Arial';
  ctx.fillText(subtitle, x + 26, y + 88);
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
  heroGrad.addColorStop(0, 'rgba(91,33,182,.82)');
  heroGrad.addColorStop(1, 'rgba(40,10,68,.78)');
  ctx.fillStyle = heroGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(216,180,254,.7)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 37px Arial';
  ctx.fillText('🧙 ТВОЯ ИСТОРИЯ НАЧИНАЕТСЯ ЗДЕСЬ', 115, 260);
  ctx.fillStyle = '#ddd6fe';
  ctx.font = '23px Arial';
  ctx.fillText('Выбери класс, происхождение и имя. Один участник — один постоянный герой.', 116, 302);

  panel(ctx, 74, 382, 318, 132, 'ПРОФИЛЬ', 'Уровень, XP и характеристики', '👤');
  panel(ctx, 420, 382, 318, 132, 'ИНВЕНТАРЬ', 'Предметы и экипировка', '🎒');
  panel(ctx, 766, 382, 318, 132, 'КУЗНЕЦ', 'Крафт и улучшения', '⚒️');
  panel(ctx, 1112, 382, 314, 132, 'АЛХИМИК', 'Зелья и усиления', '🧪');

  panel(ctx, 74, 548, 424, 132, 'ПИТОМЦЫ', 'Спутники из экспедиций', '🐾');
  panel(ctx, 538, 548, 424, 132, 'АРТЕФАКТЫ', 'Редкие реликвии и бонусы', '💍');
  panel(ctx, 1002, 548, 424, 132, 'КОДЕКС', 'Классы, правила и открытия', '📖');

  rr(ctx, 74, 724, 1352, 94, 24);
  ctx.fillStyle = 'rgba(17, 7, 31, .9)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(139,92,246,.65)';
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px Arial';
  ctx.fillText('🗺️ ЭКСПЕДИЦИИ', 112, 766);
  ctx.fillStyle = '#c4b5fd';
  ctx.font = '21px Arial';
  ctx.fillText('4 часа в пути • ежедневные локации • герой в походе не участвует в World Boss', 112, 798);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#8b5cf6';
  ctx.font = 'bold 19px Arial';
  ctx.fillText('GAME SYNDICATE • HERO GUILD V16.0', 1392, 852);
  ctx.textAlign = 'left';

  return c.toBuffer('image/png');
}

module.exports = { createGuildHubCard };
