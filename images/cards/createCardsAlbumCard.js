const { createCanvas } = require('canvas');

const { installIconRenderer } = require('../ui/icons');
const WIDTH = 1200;
const HEIGHT = 900;

const rarityColors = {
    common: '#9CA3AF',
    rare: '#3B82F6',
    epic: '#A855F7',
    legendary: '#F59E0B',
    mythic: '#EF4444',
    exclusive: '#E5E7EB',
    holographic: '#22D3EE',
    treasure: '#FBBF24',
};

const editionColors = {
    standard: '#9CA3AF',
    foil: '#E5E7EB',
    galaxy: '#7C3AED',
    crystal: '#67E8F9',
    signature: '#FBBF24',
    glitch: '#22D3EE',
    gold: '#F59E0B',
};

const rarityNames = {
    common: 'COMMON',
    rare: 'RARE',
    epic: 'EPIC',
    legendary: 'LEGENDARY',
    mythic: 'MYTHIC',
    exclusive: 'EXCLUSIVE',
    holographic: 'HOLOGRAPHIC',
    treasure: 'TREASURE',
};

const editionNames = {
    standard: 'STANDARD',
    foil: 'FOIL',
    galaxy: 'GALAXY',
    crystal: 'CRYSTAL',
    signature: 'SIGNATURE',
    glitch: 'GLITCH',
    gold: 'GOLD',
};

const filterNames = {
    all: 'ВСЕ КАРТЫ',
    common: 'COMMON',
    rare: 'RARE',
    epic: 'EPIC',
    legendary: 'LEGENDARY',
    mythic: 'MITHIC',
    exclusive: 'EXCLUSIVE',
    holographic: 'HOLOGRAPHIC',
};

const rarityFilters = new Set([
    'common',
    'rare',
    'epic',
    'legendary',
    'mythic',
    'exclusive',
    'holographic',
]);

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    ctx.closePath();
}

function formatCopyNumber(number) {
    return `#${String(number).padStart(6, '0')}`;
}

function drawProgressBar(ctx, x, y, w, h, current, total) {
    const progress = total > 0 ? Math.min(current / total, 1) : 0;

    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fillStyle = '#12071F';
    ctx.fill();

    const grad = ctx.createLinearGradient(x, y, x + w, y);
    grad.addColorStop(0, '#6D28D9');
    grad.addColorStop(0.55, '#A855F7');
    grad.addColorStop(1, '#F59E0B');

    roundRect(ctx, x, y, Math.max(h, w * progress), h, h / 2);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(192, 132, 252, 0.75)';
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.stroke();
}

function getBestCardsMap(userCards, filter = 'all') {
    const rarityPower = {
        common: 1,
        rare: 2,
        epic: 3,
        legendary: 4,
        mythic: 5,
        exclusive: 6,
        holographic: 7,
        treasure: 8,
    };

    const editionPower = {
        standard: 1,
        foil: 2,
        galaxy: 3,
        crystal: 4,
        signature: 5,
        glitch: 6,
        gold: 7,
    };

    const map = new Map();

    for (const card of userCards) {
        if (rarityFilters.has(filter) && card.rarity !== filter) continue;
        const current = map.get(Number(card.card_id));

        if (!current) {
            map.set(Number(card.card_id), card);
            continue;
        }

        const currentScore =
            (rarityPower[current.rarity] ?? 0) * 100 +
            (editionPower[current.edition] ?? 0);

        const nextScore =
            (rarityPower[card.rarity] ?? 0) * 100 +
            (editionPower[card.edition] ?? 0);

        if (nextScore > currentScore) {
            map.set(Number(card.card_id), card);
        }
    }

    return map;
}

function fitText(ctx, text, maxWidth, fontSize, fontFamily = 'Arial', weight = 'bold') {
    let size = fontSize;

    while (size >= 14) {
        ctx.font = `${weight} ${size}px ${fontFamily}`;

        if (ctx.measureText(text).width <= maxWidth) {
            return size;
        }

        size -= 1;
    }

    return size;
}

function truncateText(ctx, text, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) return text;

    let result = text;

    while (result.length > 1 && ctx.measureText(`${result}…`).width > maxWidth) {
        result = result.slice(0, -1);
    }

    return `${result}…`;
}

function drawLockedCard(ctx, card, x, y, w, h) {
    roundRect(ctx, x, y, w, h, 18);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.035)';
    ctx.fill();

    ctx.strokeStyle = 'rgba(156, 163, 175, 0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#6B7280';
    ctx.font = 'bold 42px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('■', x + w / 2, y + 58);

    ctx.fillStyle = '#A1A1AA';
    ctx.font = 'bold 22px Arial';
    ctx.fillText(`${card.code}`, x + w / 2, y + 96);

    ctx.fillStyle = '#71717A';
    ctx.font = 'bold 19px Arial';
    ctx.fillText('НЕ ОТКРЫТА', x + w / 2, y + 126);

    ctx.fillStyle = '#52525B';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(card.type === 'role' ? 'РОЛЬ' : 'УЧАСТНИК', x + w / 2, y + 154);

    ctx.textAlign = 'left';
}

function drawOwnedCard(ctx, card, owned, x, y, w, h) {
    const rarityColor = rarityColors[owned.rarity] ?? '#A855F7';
    const editionColor = editionColors[owned.edition] ?? '#9CA3AF';

    ctx.shadowColor = rarityColor;
    ctx.shadowBlur = 16;
    roundRect(ctx, x, y, w, h, 18);
    ctx.fillStyle = 'rgba(10, 3, 20, 0.95)';
    ctx.fill();
    ctx.shadowBlur = 0;

    const grad = ctx.createLinearGradient(x, y, x + w, y + h);
    grad.addColorStop(0, 'rgba(255,255,255,0.08)');
    grad.addColorStop(0.42, 'rgba(168,85,247,0.16)');
    grad.addColorStop(1, 'rgba(0,0,0,0.3)');

    roundRect(ctx, x, y, w, h, 18);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = rarityColor;
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = rarityColor;
    ctx.font = 'bold 21px Arial';
    ctx.fillText(card.code, x + 18, y + 31);

    ctx.fillStyle = editionColor;
    ctx.font = 'bold 15px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(editionNames[owned.edition] ?? owned.edition.toUpperCase(), x + w - 16, y + 31);
    ctx.textAlign = 'left';

    const nameText = truncateText(ctx, card.name, w - 105);
    fitText(ctx, nameText, w - 105, 25);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(nameText, x + 18, y + 73);

    ctx.fillStyle = '#C4B5FD';
    ctx.font = 'bold 17px Arial';
    ctx.fillText(card.type === 'role' ? 'РОЛЬ' : 'УЧАСТНИК', x + 18, y + 101);

    ctx.fillStyle = rarityColor;
    ctx.font = 'bold 17px Arial';
    ctx.fillText(rarityNames[owned.rarity] ?? owned.rarity.toUpperCase(), x + 18, y + 132);

    ctx.fillStyle = '#FBBF24';
    ctx.font = 'bold 18px Arial';
    ctx.fillText(formatCopyNumber(owned.copy_number), x + 18, y + 162);

    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, x + w - 66, y + h - 66, 48, 48, 14);
    ctx.fill();

    ctx.fillStyle = rarityColor;
    ctx.font = 'bold 25px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('GS', x + w - 42, y + h - 34);
    ctx.textAlign = 'left';
}

async function createCardsAlbumCard(user, allCards, userCards, options = {}) {
    const filter = options.filter ?? 'all';
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 9;

    const filteredCards = rarityFilters.has(filter)
        ? allCards.filter(card =>
            (card.drop_rarities ?? [card.base_rarity]).includes(filter)
        )
        : allCards;

    const totalPages = Math.max(1, Math.ceil(filteredCards.length / pageSize));
    const safePage = Math.max(1, Math.min(page, totalPages));

    const start = (safePage - 1) * pageSize;
    const visibleCards = filteredCards.slice(start, start + pageSize);

    const bestCardsMap = getBestCardsMap(userCards, filter);
    const relevantUserCards = rarityFilters.has(filter)
        ? userCards.filter(card => card.rarity === filter)
        : userCards;
    const uniqueOwned = new Set(relevantUserCards.map(card => `${card.card_id}:${card.rarity}`)).size;
    const availableVariants = rarityFilters.has(filter)
        ? filteredCards.length
        : allCards.reduce((sum, card) => sum + (card.drop_rarities?.length ?? 1), 0);
    const totalOwned = relevantUserCards.length;
    const duplicates = Math.max(0, totalOwned - uniqueOwned);
    const percent = availableVariants > 0 ? Math.round((uniqueOwned / availableVariants) * 100) : 0;

    const canvas = createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');
    installIconRenderer(ctx);

    const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
    bg.addColorStop(0, '#030008');
    bg.addColorStop(0.45, '#160827');
    bg.addColorStop(1, '#05000A');

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.globalAlpha = 0.055;
    ctx.fillStyle = '#C084FC';
    ctx.font = 'bold 205px Arial';
    ctx.fillText('CARDS', 455, 230);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = '#8B5CF6';
    ctx.lineWidth = 5;
    roundRect(ctx, 35, 35, WIDTH - 70, HEIGHT - 70, 34);
    ctx.stroke();

    ctx.shadowColor = '#A855F7';
    ctx.shadowBlur = 28;
    ctx.strokeStyle = '#C084FC';
    ctx.lineWidth = 2;
    roundRect(ctx, 55, 55, WIDTH - 110, HEIGHT - 110, 26);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#FFFFFF';
    fitText(ctx, '▥ КОЛЛЕКЦИЯ GAME SYNDICATE', 680, 39);
    ctx.fillText('▥ КОЛЛЕКЦИЯ GAME SYNDICATE', 90, 105);

    ctx.fillStyle = '#A855F7';
    fitText(ctx, `${(user.gsDisplayName || user.username).toUpperCase()} • BASE 2026 • ${filterNames[filter] ?? filter}`, 660, 24);
    ctx.fillText(`${(user.gsDisplayName || user.username).toUpperCase()} • BASE 2026 • ${filterNames[filter] ?? filter}`, 90, 142);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(`${uniqueOwned} / ${availableVariants} • ${percent}%`, 1110, 105);
    ctx.textAlign = 'left';

    drawProgressBar(ctx, 760, 126, 350, 24, uniqueOwned, availableVariants);

    ctx.fillStyle = '#A78BFA';
    ctx.font = 'bold 20px Arial';
    ctx.fillText(`Всего: ${totalOwned}   Повторок: ${duplicates}   Страница: ${safePage}/${totalPages}`, 90, 178);

    const cardW = 320;
    const cardH = 172;
    const gapX = 35;
    const gapY = 28;
    const startX = 90;
    const startY = 218;

    for (let i = 0; i < pageSize; i++) {
        const card = visibleCards[i];
        if (!card) continue;

        const col = i % 3;
        const row = Math.floor(i / 3);

        const x = startX + col * (cardW + gapX);
        const y = startY + row * (cardH + gapY);

        const owned = bestCardsMap.get(Number(card.id));

        if (owned) {
            drawOwnedCard(ctx, card, owned, x, y, cardW, cardH);
        } else {
            drawLockedCard(ctx, card, x, y, cardW, cardH);
        }
    }

    ctx.fillStyle = '#A78BFA';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Фильтры и страницы переключаются кнопками под сообщением', WIDTH / 2, 835);
    ctx.textAlign = 'left';

    return canvas.toBuffer('image/png');
}

module.exports = {
    createCardsAlbumCard,
};
