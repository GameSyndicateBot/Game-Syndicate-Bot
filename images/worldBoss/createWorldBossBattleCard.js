'use strict';

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const { CLASSES } = require('../../services/worldBoss/config');
const { drawUiIcon } = require('../ui/drawUiIcon');

const W = 1600;
const H = 900;
const CARD_DIR = path.join(__dirname, '../../assets/cards/boss_pack');

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function rounded(ctx, x, y, w, h, r = 18) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
function panel(ctx, x, y, w, h, alpha = 0.78) {
  ctx.save();
  rounded(ctx, x, y, w, h, 22);
  ctx.fillStyle = `rgba(12, 8, 24, ${alpha})`;
  ctx.fill();
  ctx.strokeStyle = 'rgba(171, 105, 255, .48)';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}
function bar(ctx, x, y, w, h, value, max, fill, label) {
  rounded(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = 'rgba(255,255,255,.10)'; ctx.fill();
  const pct = max > 0 ? clamp(value / max, 0, 1) : 0;
  if (pct > 0) { rounded(ctx, x, y, Math.max(h, w * pct), h, h / 2); ctx.fillStyle = fill; ctx.fill(); }
  ctx.fillStyle = '#fff'; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2 + 1);
}
function cropDraw(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale, sh = h / scale;
  const sx = (img.width - sw) / 2, sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}
function cardFile(cardId, type) {
  const no = String(Number(cardId) % 2000).padStart(3, '0');
  const base = path.join(CARD_DIR, `${no}_${type}`);
  for (const ext of ['.jpg', '.png', '.jpeg', '.webp']) {
    const file = `${base}${ext}`;
    if (fs.existsSync(file)) return file;
  }
  return `${base}.jpg`;
}
async function safeImage(file) { try { if (fs.existsSync(file)) return await loadImage(file); } catch {} return null; }
function text(ctx, value, x, y, size = 24, color = '#fff', weight = 'normal', align = 'left') {
  ctx.font = `${weight} ${size}px sans-serif`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillText(String(value), x, y);
}
function ellipsize(ctx, value, maxWidth) {
  let s = String(value); if (ctx.measureText(s).width <= maxWidth) return s;
  while (s.length > 2 && ctx.measureText(`${s}…`).width > maxWidth) s = s.slice(0, -1);
  return `${s}…`;
}
function effectLine(e) {
  const out = [];
  if (e.shield) out.push(`Щит ${e.shield}`);
  if (e.skillCd) out.push(`Навык КД ${e.skillCd}`);
  if (e.ultCd) out.push(`Ульта КД ${e.ultCd}`);
  if (e.skillSilencedTurns) out.push(`Навык заблокирован ${e.skillSilencedTurns}`);
  if (e.ultSilencedTurns) out.push(`Ульта заблокирована ${e.ultSilencedTurns}`);
  return out.join(' • ') || 'Эффектов нет';
}
function stripEmoji(value) {
  return String(value)
    .replace(/[\u{1F000}-\u{1FAFF}]/gu, '')
    .replace(/[\u2600-\u27BF]/g, '')
    .replace(/[\uFE0E\uFE0F]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

async function createWorldBossBattleCard({ battle, players, state, effectsByUser = {}, currentUserId = null }) {
  const canvas = createCanvas(W, H); const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#08050f'); bg.addColorStop(.52, '#21103a'); bg.addColorStop(1, '#06050b'); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 26; i++) { ctx.fillStyle = `rgba(150,80,255,${0.018 + (i % 5) * .006})`; ctx.beginPath(); ctx.arc((i * 197) % W, (i * 113) % H, 20 + (i % 6) * 18, 0, Math.PI * 2); ctx.fill(); }

  // Header
  text(ctx, 'GAME SYNDICATE • WORLD BOSS', 38, 46, 22, '#c9a8ff', 'bold');
  text(ctx, `Раунд ${battle.round_no || 0}`, 1320, 46, 22, '#fff', 'bold');
  text(ctx, battle.turn_deadline ? `Ход до ${new Date(Number(battle.turn_deadline)).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}` : 'Ожидание', 1560, 46, 18, '#c7c2d0', 'normal', 'right');

  // Boss panel
  panel(ctx, 28, 68, 430, 804, .88);
  const bossImg = await safeImage(cardFile(battle.boss_card_id, 'boss'));
  if (bossImg) { ctx.save(); rounded(ctx, 48, 90, 390, 455, 18); ctx.clip(); cropDraw(ctx, bossImg, 48, 90, 390, 455); ctx.restore(); }
  else { ctx.fillStyle = '#29163d'; rounded(ctx, 48, 90, 390, 455, 18); ctx.fill(); text(ctx, 'BOSS', 243, 325, 58, '#b995ff', 'bold', 'center'); }
  text(ctx, battle.boss_name, 243, 585, 31, '#fff', 'bold', 'center');
  bar(ctx, 58, 610, 370, 34, battle.boss_hp, battle.boss_max_hp, '#c7354b', `${battle.boss_hp} / ${battle.boss_max_hp} HP`);
  drawUiIcon(ctx, 'flame', 62, 661, 25, '#f59e0b');
  bar(ctx, 92, 660, 336, 29, Number(state.rage || 0), 100, '#d77b23', `Ярость ${Number(state.rage || 0)} / 100`);
  drawUiIcon(ctx, 'minion', 64, 709, 24, '#d8bdff');
  text(ctx, `Миньонов: ${(state.minions || []).length}`, 96, 732, 22, '#eee', 'bold');
  drawUiIcon(ctx, 'swords', 64, 747, 24, '#d8bdff');
  text(ctx, `Статус: ${battle.status === 'active' ? 'бой идёт' : battle.status}`, 96, 770, 21, '#d6c9e8');
  const enemyNames = (state.minions || []).slice(0, 3).map(m => `${m.name} ${m.hp}/${m.maxHp}`).join(' • ');
  text(ctx, ellipsize(ctx, enemyNames || 'Миньоны не призваны', 350), 65, 818, 17, '#bdb4c8');

  // Team grid
  panel(ctx, 478, 68, 700, 804, .73);
  text(ctx, 'КОМАНДА', 510, 110, 25, '#d8bdff', 'bold');
  const maxShown = 14; const shown = players.slice(0, maxShown);
  const cols = 2; const itemW = 316; const itemH = shown.length > 10 ? 94 : 132;
  const rowStep = shown.length > 10 ? 101 : 142;
  for (let i = 0; i < shown.length; i++) {
    const p = shown[i], c = CLASSES[p.class_key] || { name: 'Без класса', role: 'support' }, e = effectsByUser[p.user_id] || {};
    const col = i % cols, row = Math.floor(i / cols), x = 505 + col * 337, y = 132 + row * rowStep;
    ctx.save(); rounded(ctx, x, y, itemW, itemH, 16); ctx.fillStyle = p.user_id === currentUserId ? 'rgba(123,67,190,.56)' : p.status === 'dead' ? 'rgba(48,45,54,.72)' : 'rgba(23,17,35,.82)'; ctx.fill(); ctx.strokeStyle = p.user_id === currentUserId ? '#d4a8ff' : 'rgba(255,255,255,.12)'; ctx.lineWidth = p.user_id === currentUserId ? 3 : 1; ctx.stroke(); ctx.restore();
    const compact = itemH < 120;
    text(ctx, p.user_id === currentUserId ? '▶' : (p.status === 'dead' ? 'X' : '●'), x + 12, y + (compact ? 21 : 27), compact ? 15 : 18, p.user_id === currentUserId ? '#e7c8ff' : p.status === 'dead' ? '#aaa' : '#6ee7a7', 'bold');
    text(ctx, ellipsize(ctx, p.hero_name || p.displayName || p.username || `Игрок ${i + 1}`, compact ? 145 : 165), x + 36, y + (compact ? 22 : 28), compact ? 16 : 20, '#fff', 'bold');
    text(ctx, `${c.name} • ур.${p.hero_level || 1}`, x + itemW - 12, y + (compact ? 22 : 28), compact ? 14 : 17, '#cdb7de', 'normal', 'right');
    bar(ctx, x + 12, y + (compact ? 33 : 44), itemW - 24, compact ? 18 : 23, p.hp, p.max_hp, '#3fbf72', `${p.hp}/${p.max_hp} HP`);
    const rt = c.resourceType || 'energy';
    const mainValue = rt === 'mana' ? Number(p.mana || 0) : Number(p.energy || 0);
    const mainLabel = rt === 'rage' ? 'ярости' : rt === 'mana' ? 'маны' : 'энергии';
    bar(ctx, x + 12, y + (compact ? 56 : 75), itemW - 24, compact ? 15 : 18, mainValue, 100, '#6f72db', `${mainValue}/100 ${mainLabel}`);
    const ultValue = ['assassin','archer'].includes(p.class_key) ? Number(p.energy || 0) : Number(p.ult_charge || 0);
    const ultReady = ultValue >= 100;
    text(ctx, `${ultReady ? '🟣' : '⚫'} ${ultReady ? 'Ульта готова' : `Ульта ${ultValue}/100`}`, x + itemW - 12, y + (compact ? 87 : 117), compact ? 12 : 14, ultReady ? '#e9c6ff' : '#b8afc2', 'bold', 'right');
    text(ctx, ellipsize(ctx, effectLine(e), compact ? 145 : 170), x + 12, y + (compact ? 87 : 117), compact ? 12 : 14, '#c8c0d2');
  }
  if (players.length > maxShown) text(ctx, `+ ещё ${players.length - maxShown} участников`, 825, 850, 17, '#aaa', 'normal', 'center');

  // Right rail
  panel(ctx, 1198, 68, 374, 804, .82);
  text(ctx, 'ОЧЕРЕДЬ ХОДОВ', 1225, 110, 23, '#d8bdff', 'bold');
  const alive = players.filter(p => p.status === 'alive');
  alive.slice(0, 7).forEach((p, i) => {
    const c = CLASSES[p.class_key] || { name: '—' };
    const mark = p.user_id === currentUserId ? '▶' : `${i + 1}.`;
    text(ctx, mark, 1225, 149 + i * 38, 18, p.user_id === currentUserId ? '#e4bdff' : '#aaa', 'bold');
    text(ctx, ellipsize(ctx, `${p.hero_name || p.displayName || p.username || 'Игрок'} — ${c.name}`, 280), 1260, 149 + i * 38, 17, '#fff');
  });
  text(ctx, 'ЖУРНАЛ БОЯ', 1225, 448, 23, '#d8bdff', 'bold');
  const logs = (state.log || []).slice(-8).reverse();
  let ly = 482;
  for (const line of logs) {
    const clean = stripEmoji(String(line).replace(/<@!?\d+>/g, 'Игрок').replace(/\*\*/g, ''));
    const words = clean.split(/\s+/); let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      ctx.font = '16px sans-serif';
      if (ctx.measureText(candidate).width > 315 && current) { text(ctx, current, 1225, ly, 16, '#d0cad5'); ly += 22; current = word; }
      else current = candidate;
      if (ly > 830) break;
    }
    if (current && ly <= 830) { text(ctx, `• ${current}`, 1225, ly, 16, '#d0cad5'); ly += 27; }
    if (ly > 830) break;
  }
  const legendY = 882;
  const legend = [
    ['heart', 'HP', '#ef476f'], ['mana', 'Мана', '#7c83ff'], ['energy', 'Энергия', '#f7c948'], ['flame', 'Ярость', '#f59e0b'], ['ult', 'Ульта: ⚫ / 🟣 готова', '#d8b4fe']
  ];
  let lx = 520;
  for (const [icon, label, color] of legend) { drawUiIcon(ctx, icon, lx, legendY - 17, 18, color); text(ctx, label, lx + 25, legendY, 16, '#c8bfd1', 'bold'); lx += label === 'Энергия' ? 150 : 115; }
  return canvas.toBuffer('image/png');
}

module.exports = { createWorldBossBattleCard, cardFile };
