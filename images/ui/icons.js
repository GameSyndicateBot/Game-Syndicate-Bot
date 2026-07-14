'use strict';

const ICONS = new Map([
    ['★', 'star'], ['☆', 'star'], ['●', 'dot'], ['○', 'dot'], ['•', 'dot'],
    ['■', 'card'], ['□', 'box'], ['▣', 'calendar'], ['▢', 'box'], ['⬜', 'box'],
    ['✓', 'check'], ['✔', 'check'], ['✕', 'close'], ['✖', 'close'], ['×', 'close'],
    ['❤', 'heart'], ['♥', 'heart'], ['♛', 'crown'], ['♕', 'crown'], ['♔', 'crown'], ['♚', 'crown'],
    ['♻', 'recycle'], ['↔', 'trade'], ['⇄', 'trade'], ['⇆', 'trade'], ['⚡', 'bolt'],
    ['⚙', 'settings'], ['⚔', 'battle'], ['☰', 'menu'], ['⌂', 'home'], ['⏱', 'clock'], ['⌛', 'clock'],
    ['🎤', 'voice'], ['🏆', 'trophy'], ['👑', 'crown'], ['🎁', 'gift'], ['🔥', 'fire'],
    ['💎', 'dust'], ['🛒', 'shop'], ['🔮', 'forecast'], ['📦', 'pack'], ['📅', 'calendar'],
    ['📊', 'chart'], ['🎴', 'card'], ['🤝', 'trade'], ['🔨', 'auction'], ['⚖', 'auction'], ['💬', 'message'],
    ['▥', 'card'], ['▦', 'shop'], ['▤', 'calendar'], ['◎', 'calendar'], ['◉', 'voice'], ['◇', 'forecast'], ['◆', 'event'], ['▲', 'fire'], ['☾', 'special'], ['✦', 'dust'], ['✥', 'menu'], ['▶', 'arrow'], ['♣', 'luck'], ['↻', 'trade'], ['⬆', 'level'],
    ['👍', 'reaction'], ['🏅', 'medal'], ['👤', 'profile'], ['⚫', 'dot'], ['➜', 'arrow'], ['→', 'arrow'],
]);

function strokeSetup(ctx, color, width) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
}

function drawIcon(ctx, name, x, y, size = 28, color = ctx.fillStyle) {
    ctx.save();
    strokeSetup(ctx, color, Math.max(1.8, size * 0.075));
    const s = size;
    const cx = x + s / 2;
    const cy = y + s / 2;
    const p = s * 0.12;

    switch (name) {
        case 'profile':
            ctx.beginPath(); ctx.arc(cx, y + s * 0.31, s * 0.16, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx, y + s * 0.83, s * 0.30, Math.PI, 0); ctx.stroke(); break;
        case 'message':
            ctx.beginPath(); ctx.roundRect(x + p, y + p, s - p * 2, s * 0.58, s * 0.10); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x + s * 0.34, y + s * 0.70); ctx.lineTo(x + s * 0.25, y + s * 0.88); ctx.lineTo(x + s * 0.50, y + s * 0.70); ctx.stroke(); break;
        case 'reaction':
            ctx.beginPath(); ctx.moveTo(x + s * 0.32, y + s * 0.82); ctx.lineTo(x + s * 0.32, y + s * 0.45); ctx.lineTo(x + s * 0.48, y + s * 0.18); ctx.quadraticCurveTo(x + s * 0.60, y + s * 0.08, x + s * 0.62, y + s * 0.25); ctx.lineTo(x + s * 0.59, y + s * 0.41); ctx.lineTo(x + s * 0.82, y + s * 0.41); ctx.quadraticCurveTo(x + s * 0.91, y + s * 0.42, x + s * 0.87, y + s * 0.55); ctx.lineTo(x + s * 0.78, y + s * 0.80); ctx.closePath(); ctx.stroke();
            ctx.strokeRect(x + s * 0.12, y + s * 0.44, s * 0.18, s * 0.39); break;
        case 'heart':
            ctx.beginPath(); ctx.moveTo(cx, y + s * 0.84); ctx.bezierCurveTo(x + s * 0.12, y + s * 0.58, x + s * 0.13, y + s * 0.24, x + s * 0.37, y + s * 0.22); ctx.bezierCurveTo(cx, y + s * 0.21, cx, y + s * 0.33, cx, y + s * 0.33); ctx.bezierCurveTo(cx, y + s * 0.33, x + s * 0.64, y + s * 0.18, x + s * 0.82, y + s * 0.24); ctx.bezierCurveTo(x + s * 0.98, y + s * 0.39, x + s * 0.87, y + s * 0.65, cx, y + s * 0.84); ctx.stroke(); break;
        case 'voice':
            ctx.beginPath(); ctx.roundRect(x + s * 0.36, y + s * 0.10, s * 0.28, s * 0.52, s * 0.14); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x + s * 0.23, y + s * 0.47); ctx.quadraticCurveTo(cx, y + s * 0.80, x + s * 0.77, y + s * 0.47); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx, y + s * 0.72); ctx.lineTo(cx, y + s * 0.90); ctx.moveTo(x + s * 0.35, y + s * 0.90); ctx.lineTo(x + s * 0.65, y + s * 0.90); ctx.stroke(); break;
        case 'trade':
            ctx.beginPath(); ctx.moveTo(x + s * 0.13, y + s * 0.34); ctx.lineTo(x + s * 0.76, y + s * 0.34); ctx.moveTo(x + s * 0.64, y + s * 0.20); ctx.lineTo(x + s * 0.78, y + s * 0.34); ctx.lineTo(x + s * 0.64, y + s * 0.48); ctx.moveTo(x + s * 0.87, y + s * 0.67); ctx.lineTo(x + s * 0.24, y + s * 0.67); ctx.moveTo(x + s * 0.36, y + s * 0.53); ctx.lineTo(x + s * 0.22, y + s * 0.67); ctx.lineTo(x + s * 0.36, y + s * 0.81); ctx.stroke(); break;
        case 'auction':
            ctx.beginPath(); ctx.moveTo(x + s * 0.28, y + s * 0.25); ctx.lineTo(x + s * 0.62, y + s * 0.59); ctx.moveTo(x + s * 0.42, y + s * 0.15); ctx.lineTo(x + s * 0.72, y + s * 0.45); ctx.moveTo(x + s * 0.55, y + s * 0.52); ctx.lineTo(x + s * 0.82, y + s * 0.79); ctx.moveTo(x + s * 0.18, y + s * 0.85); ctx.lineTo(x + s * 0.72, y + s * 0.85); ctx.stroke(); break;
        case 'trophy':
            ctx.beginPath(); ctx.roundRect(x + s * 0.30, y + s * 0.13, s * 0.40, s * 0.42, s * 0.06); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(x + s * 0.30, y + s * 0.22); ctx.quadraticCurveTo(x + s * 0.08, y + s * 0.22, x + s * 0.20, y + s * 0.48); ctx.quadraticCurveTo(x + s * 0.26, y + s * 0.57, x + s * 0.36, y + s * 0.49); ctx.moveTo(x + s * 0.70, y + s * 0.22); ctx.quadraticCurveTo(x + s * 0.92, y + s * 0.22, x + s * 0.80, y + s * 0.48); ctx.quadraticCurveTo(x + s * 0.74, y + s * 0.57, x + s * 0.64, y + s * 0.49); ctx.moveTo(cx, y + s * 0.55); ctx.lineTo(cx, y + s * 0.76); ctx.moveTo(x + s * 0.34, y + s * 0.86); ctx.lineTo(x + s * 0.66, y + s * 0.86); ctx.stroke(); break;
        case 'crown':
            ctx.beginPath(); ctx.moveTo(x + s * 0.12, y + s * 0.72); ctx.lineTo(x + s * 0.20, y + s * 0.30); ctx.lineTo(x + s * 0.40, y + s * 0.52); ctx.lineTo(cx, y + s * 0.18); ctx.lineTo(x + s * 0.60, y + s * 0.52); ctx.lineTo(x + s * 0.80, y + s * 0.30); ctx.lineTo(x + s * 0.88, y + s * 0.72); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + s * 0.18, y + s * 0.82); ctx.lineTo(x + s * 0.82, y + s * 0.82); ctx.stroke(); break;
        case 'star': {
            ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5; const r = i % 2 ? s * 0.19 : s * 0.40; const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); ctx.stroke(); break;
        }
        case 'bolt':
            ctx.beginPath(); ctx.moveTo(x + s * 0.58, y + s * 0.08); ctx.lineTo(x + s * 0.24, y + s * 0.55); ctx.lineTo(x + s * 0.48, y + s * 0.55); ctx.lineTo(x + s * 0.38, y + s * 0.92); ctx.lineTo(x + s * 0.76, y + s * 0.43); ctx.lineTo(x + s * 0.52, y + s * 0.43); ctx.closePath(); ctx.stroke(); break;
        case 'check':
            ctx.beginPath(); ctx.arc(cx, cy, s * 0.39, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + s * 0.28, y + s * 0.52); ctx.lineTo(x + s * 0.44, y + s * 0.68); ctx.lineTo(x + s * 0.74, y + s * 0.34); ctx.stroke(); break;
        case 'close':
            ctx.beginPath(); ctx.arc(cx, cy, s * 0.39, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + s * 0.34, y + s * 0.34); ctx.lineTo(x + s * 0.66, y + s * 0.66); ctx.moveTo(x + s * 0.66, y + s * 0.34); ctx.lineTo(x + s * 0.34, y + s * 0.66); ctx.stroke(); break;
        case 'clock':
            ctx.beginPath(); ctx.arc(cx, cy, s * 0.39, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, y + s * 0.27); ctx.moveTo(cx, cy); ctx.lineTo(x + s * 0.70, y + s * 0.57); ctx.stroke(); break;
        case 'calendar':
            ctx.beginPath(); ctx.roundRect(x + s * 0.14, y + s * 0.20, s * 0.72, s * 0.66, s * 0.07); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + s * 0.14, y + s * 0.38); ctx.lineTo(x + s * 0.86, y + s * 0.38); ctx.moveTo(x + s * 0.32, y + s * 0.10); ctx.lineTo(x + s * 0.32, y + s * 0.28); ctx.moveTo(x + s * 0.68, y + s * 0.10); ctx.lineTo(x + s * 0.68, y + s * 0.28); ctx.stroke(); break;
        case 'gift':
            ctx.strokeRect(x + s * 0.16, y + s * 0.40, s * 0.68, s * 0.46); ctx.strokeRect(x + s * 0.10, y + s * 0.30, s * 0.80, s * 0.16); ctx.beginPath(); ctx.moveTo(cx, y + s * 0.30); ctx.lineTo(cx, y + s * 0.86); ctx.moveTo(cx, y + s * 0.30); ctx.quadraticCurveTo(x + s * 0.27, y + s * 0.02, x + s * 0.22, y + s * 0.28); ctx.moveTo(cx, y + s * 0.30); ctx.quadraticCurveTo(x + s * 0.73, y + s * 0.02, x + s * 0.78, y + s * 0.28); ctx.stroke(); break;
        case 'shop':
            ctx.beginPath(); ctx.moveTo(x + s * 0.12, y + s * 0.20); ctx.lineTo(x + s * 0.24, y + s * 0.20); ctx.lineTo(x + s * 0.34, y + s * 0.66); ctx.lineTo(x + s * 0.78, y + s * 0.66); ctx.lineTo(x + s * 0.88, y + s * 0.34); ctx.lineTo(x + s * 0.29, y + s * 0.34); ctx.stroke(); ctx.beginPath(); ctx.arc(x + s * 0.42, y + s * 0.82, s * 0.06, 0, Math.PI * 2); ctx.arc(x + s * 0.72, y + s * 0.82, s * 0.06, 0, Math.PI * 2); ctx.stroke(); break;
        case 'pack':
            ctx.beginPath(); ctx.roundRect(x + s * 0.13, y + s * 0.27, s * 0.74, s * 0.58, s * 0.08); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + s * 0.13, y + s * 0.43); ctx.lineTo(x + s * 0.87, y + s * 0.43); ctx.moveTo(x + s * 0.35, y + s * 0.27); ctx.quadraticCurveTo(cx, y + s * 0.04, x + s * 0.65, y + s * 0.27); ctx.stroke(); break;
        case 'card':
            ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.12); ctx.strokeRect(-s * 0.25, -s * 0.34, s * 0.50, s * 0.68); ctx.restore(); ctx.save(); ctx.translate(cx + s * 0.12, cy); ctx.rotate(0.12); ctx.strokeRect(-s * 0.25, -s * 0.34, s * 0.50, s * 0.68); ctx.restore(); break;
        case 'dust':
            ctx.beginPath(); ctx.moveTo(cx, y + s * 0.08); ctx.lineTo(x + s * 0.82, cy); ctx.lineTo(cx, y + s * 0.92); ctx.lineTo(x + s * 0.18, cy); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(cx, y + s * 0.08); ctx.lineTo(cx, y + s * 0.92); ctx.moveTo(x + s * 0.18, cy); ctx.lineTo(x + s * 0.82, cy); ctx.stroke(); break;
        case 'fire':
            ctx.beginPath(); ctx.moveTo(cx, y + s * 0.90); ctx.bezierCurveTo(x + s * 0.15, y + s * 0.72, x + s * 0.32, y + s * 0.42, x + s * 0.48, y + s * 0.18); ctx.bezierCurveTo(x + s * 0.54, y + s * 0.42, x + s * 0.72, y + s * 0.44, x + s * 0.70, y + s * 0.16); ctx.bezierCurveTo(x + s * 0.94, y + s * 0.48, x + s * 0.88, y + s * 0.80, cx, y + s * 0.90); ctx.stroke(); break;
        case 'settings':
            ctx.beginPath(); ctx.arc(cx, cy, s * 0.18, 0, Math.PI * 2); ctx.stroke();
            for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * s * 0.28, cy + Math.sin(a) * s * 0.28); ctx.lineTo(cx + Math.cos(a) * s * 0.43, cy + Math.sin(a) * s * 0.43); ctx.stroke(); } break;
        case 'recycle':
            ctx.beginPath(); ctx.arc(cx, cy, s * 0.31, -0.9, 1.25); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + s * 0.77, y + s * 0.58); ctx.lineTo(x + s * 0.82, y + s * 0.78); ctx.lineTo(x + s * 0.62, y + s * 0.72); ctx.stroke(); ctx.beginPath(); ctx.arc(cx, cy, s * 0.31, 2.25, 4.35); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + s * 0.23, y + s * 0.42); ctx.lineTo(x + s * 0.18, y + s * 0.22); ctx.lineTo(x + s * 0.38, y + s * 0.28); ctx.stroke(); break;
        case 'home':
            ctx.beginPath(); ctx.moveTo(x + s * 0.14, y + s * 0.46); ctx.lineTo(cx, y + s * 0.13); ctx.lineTo(x + s * 0.86, y + s * 0.46); ctx.moveTo(x + s * 0.24, y + s * 0.40); ctx.lineTo(x + s * 0.24, y + s * 0.86); ctx.lineTo(x + s * 0.76, y + s * 0.86); ctx.lineTo(x + s * 0.76, y + s * 0.40); ctx.stroke(); break;
        case 'chart':
            ctx.beginPath(); ctx.moveTo(x + s * 0.14, y + s * 0.84); ctx.lineTo(x + s * 0.14, y + s * 0.20); ctx.moveTo(x + s * 0.14, y + s * 0.84); ctx.lineTo(x + s * 0.88, y + s * 0.84); ctx.moveTo(x + s * 0.26, y + s * 0.70); ctx.lineTo(x + s * 0.42, y + s * 0.52); ctx.lineTo(x + s * 0.58, y + s * 0.62); ctx.lineTo(x + s * 0.80, y + s * 0.30); ctx.stroke(); break;
        case 'arrow':
            ctx.beginPath(); ctx.moveTo(x + s * 0.16, cy); ctx.lineTo(x + s * 0.82, cy); ctx.moveTo(x + s * 0.64, y + s * 0.30); ctx.lineTo(x + s * 0.84, cy); ctx.lineTo(x + s * 0.64, y + s * 0.70); ctx.stroke(); break;
        case 'dot':
            ctx.beginPath(); ctx.arc(cx, cy, s * 0.20, 0, Math.PI * 2); ctx.fill(); break;
        case 'box':
            ctx.beginPath(); ctx.roundRect(x + s * 0.18, y + s * 0.18, s * 0.64, s * 0.64, s * 0.08); ctx.stroke(); break;
        case 'medal':
            ctx.beginPath(); ctx.arc(cx, y + s * 0.61, s * 0.24, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(x + s * 0.34, y + s * 0.12); ctx.lineTo(x + s * 0.44, y + s * 0.40); ctx.moveTo(x + s * 0.66, y + s * 0.12); ctx.lineTo(x + s * 0.56, y + s * 0.40); ctx.stroke(); break;
        case 'forecast':
            ctx.beginPath(); ctx.arc(cx, y + s * 0.42, s * 0.28, 0, Math.PI * 2); ctx.stroke();
            ctx.beginPath(); ctx.arc(cx - s * 0.09, y + s * 0.36, s * 0.045, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.moveTo(x + s * 0.24, y + s * 0.78); ctx.lineTo(x + s * 0.76, y + s * 0.78); ctx.moveTo(x + s * 0.34, y + s * 0.78); ctx.lineTo(x + s * 0.27, y + s * 0.90); ctx.moveTo(x + s * 0.66, y + s * 0.78); ctx.lineTo(x + s * 0.73, y + s * 0.90); ctx.stroke(); break;
        case 'event':
            ctx.beginPath(); ctx.moveTo(cx, y + s * 0.10); ctx.lineTo(x + s * 0.62, y + s * 0.37); ctx.lineTo(x + s * 0.90, y + s * 0.42); ctx.lineTo(x + s * 0.68, y + s * 0.62); ctx.lineTo(x + s * 0.74, y + s * 0.90); ctx.lineTo(cx, y + s * 0.75); ctx.lineTo(x + s * 0.26, y + s * 0.90); ctx.lineTo(x + s * 0.32, y + s * 0.62); ctx.lineTo(x + s * 0.10, y + s * 0.42); ctx.lineTo(x + s * 0.38, y + s * 0.37); ctx.closePath(); ctx.stroke(); break;
        case 'special':
            ctx.beginPath(); ctx.arc(cx, cy, s * 0.36, -Math.PI / 2, Math.PI * 1.5); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + s * 0.12, cy - s * 0.08, s * 0.31, -Math.PI / 2, Math.PI * 1.5); ctx.stroke(); break;
        case 'luck':
            ctx.beginPath(); ctx.arc(cx, cy, s * 0.09, 0, Math.PI * 2); ctx.stroke();
            for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * s * 0.20, cy + Math.sin(a) * s * 0.20, s * 0.14, a - Math.PI * 0.45, a + Math.PI * 0.45); ctx.stroke(); } break;
        case 'menu':
            for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x + s * 0.20, y + s * (0.30 + i * 0.20)); ctx.lineTo(x + s * 0.80, y + s * (0.30 + i * 0.20)); ctx.stroke(); } break;
        case 'level':
            ctx.beginPath(); ctx.moveTo(cx, y + s * 0.12); ctx.lineTo(x + s * 0.22, y + s * 0.48); ctx.lineTo(x + s * 0.40, y + s * 0.48); ctx.lineTo(x + s * 0.40, y + s * 0.78); ctx.lineTo(x + s * 0.60, y + s * 0.78); ctx.lineTo(x + s * 0.60, y + s * 0.48); ctx.lineTo(x + s * 0.78, y + s * 0.48); ctx.closePath(); ctx.stroke(); break;
        default:
            ctx.beginPath(); ctx.arc(cx, cy, s * 0.34, 0, Math.PI * 2); ctx.stroke(); break;
    }
    ctx.restore();
}

function splitLeadingIcon(text) {
    const value = String(text ?? '');
    const entries = [...ICONS.keys()].sort((a, b) => b.length - a.length);
    for (const token of entries) {
        if (value.startsWith(token)) return { token, icon: ICONS.get(token), rest: value.slice(token.length).replace(/^\s+/, '') };
    }
    return null;
}

function installIconRenderer(ctx) {
    if (!ctx || ctx.__gsIconRendererInstalled) return ctx;
    ctx.__gsIconRendererInstalled = true;
    const originalFillText = ctx.fillText.bind(ctx);

    ctx.fillText = function patchedFillText(text, x, y, maxWidth) {
        const parsed = splitLeadingIcon(text);
        if (!parsed) return maxWidth === undefined ? originalFillText(text, x, y) : originalFillText(text, x, y, maxWidth);

        const fontPx = Math.max(12, Number.parseFloat(String(ctx.font).match(/([\d.]+)px/)?.[1] ?? 24));
        const size = Math.min(fontPx * 0.92, 54);
        const gap = parsed.rest ? Math.max(7, size * 0.28) : 0;
        const textWidth = parsed.rest ? ctx.measureText(parsed.rest).width : 0;
        const total = size + gap + textWidth;
        let startX = x;
        if (ctx.textAlign === 'center') startX = x - total / 2;
        else if (ctx.textAlign === 'right' || ctx.textAlign === 'end') startX = x - total;

        const iconY = y - size * 0.78;
        drawIcon(ctx, parsed.icon, startX, iconY, size, ctx.fillStyle);
        if (parsed.rest) {
            const oldAlign = ctx.textAlign;
            ctx.textAlign = 'left';
            const textX = startX + size + gap;
            maxWidth === undefined ? originalFillText(parsed.rest, textX, y) : originalFillText(parsed.rest, textX, y, Math.max(1, maxWidth - size - gap));
            ctx.textAlign = oldAlign;
        }
        return undefined;
    };
    return ctx;
}

module.exports = { drawIcon, installIconRenderer, ICONS };
