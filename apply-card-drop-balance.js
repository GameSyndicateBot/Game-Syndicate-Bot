'use strict';

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const cardSystemPath = path.join(root, 'utils', 'cardSystem.js');
const packPanelPath = path.join(root, 'images', 'pack', 'createPackPanel.js');

function requireFile(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`Файл не найден: ${filePath}`);
    }
}

function backup(filePath) {
    const backupPath = `${filePath}.before-drop-balance.bak`;
    if (!fs.existsSync(backupPath)) {
        fs.copyFileSync(filePath, backupPath);
    }
}

function writeChanged(filePath, before, after) {
    if (before === after) {
        console.log(`Без изменений: ${path.relative(root, filePath)}`);
        return;
    }
    backup(filePath);
    fs.writeFileSync(filePath, after, 'utf8');
    console.log(`Обновлён: ${path.relative(root, filePath)}`);
}

requireFile(cardSystemPath);
requireFile(packPanelPath);

const newChanceBlock = `const RARITY_CHANCES = [
    { value: 'common', weight: 50 },
    { value: 'rare', weight: 27 },
    { value: 'epic', weight: 14 },
    { value: 'legendary', weight: 5 },
    { value: 'mythic', weight: 2 },
    { value: 'exclusive', weight: 1.2 },
    { value: 'holographic', weight: 0.8 },
];`;

let cardSystem = fs.readFileSync(cardSystemPath, 'utf8');
const originalCardSystem = cardSystem;

const chanceBlockRegex = /const\s+RARITY_CHANCES\s*=\s*\[[\s\S]*?\n\s*\];/;
if (!chanceBlockRegex.test(cardSystem)) {
    throw new Error('Не найден блок RARITY_CHANCES в utils/cardSystem.js');
}
cardSystem = cardSystem.replace(chanceBlockRegex, newChanceBlock);

// Повторки должны выпадать: выбор идёт из полного пула редкости без исключения уже имеющихся карт.
// Текущая реализация openRandomCard уже работает именно так. Добавляем явный комментарий,
// чтобы это поведение случайно не убрали при будущих изменениях.
if (!cardSystem.includes('Повторки разрешены: уже имеющиеся у игрока карты не исключаются из пула.')) {
    cardSystem = cardSystem.replace(
        /function\s+openRandomCard\(userId,\s*options\s*=\s*\{\}\)\s*\{\s*\n/,
        match => `${match}    // Повторки разрешены: уже имеющиеся у игрока карты не исключаются из пула.\n`
    );
}

writeChanged(cardSystemPath, originalCardSystem, cardSystem);

let packPanel = fs.readFileSync(packPanelPath, 'utf8');
const originalPackPanel = packPanel;

const replacements = [
    [/(['\"`][^'\"`]*COMMON[^'\"`]*['\"`]\s*,\s*)['\"`]35%['\"`]/i, "$1'50%'"],
    [/(['\"`][^'\"`]*RARE[^'\"`]*['\"`]\s*,\s*)['\"`]20%['\"`]/i, "$1'27%'"],
    [/(['\"`][^'\"`]*EPIC[^'\"`]*['\"`]\s*,\s*)['\"`]13%['\"`]/i, "$1'14%'"],
    [/(['\"`][^'\"`]*LEGENDARY[^'\"`]*['\"`]\s*,\s*)['\"`]10%['\"`]/i, "$1'5%'"],
    [/(['\"`][^'\"`]*MYTHIC[^'\"`]*['\"`]\s*,\s*)['\"`]8%['\"`]/i, "$1'2%'"],
    [/(['\"`][^'\"`]*EXCLUSIVE[^'\"`]*['\"`]\s*,\s*)['\"`]7%['\"`]/i, "$1'1.2%'"],
    [/(['\"`][^'\"`]*HOLOGRAPHIC[^'\"`]*['\"`]\s*,\s*)['\"`]7%['\"`]/i, "$1'0.8%'"],
];

for (const [regex, replacement] of replacements) {
    if (!regex.test(packPanel)) {
        console.warn(`Не найдено значение для замены: ${regex}`);
    }
    packPanel = packPanel.replace(regex, replacement);
}

writeChanged(packPanelPath, originalPackPanel, packPanel);

const total = 50 + 27 + 14 + 5 + 2 + 1.2 + 0.8;
if (Math.abs(total - 100) > Number.EPSILON) {
    throw new Error(`Сумма основных шансов должна быть 100%, сейчас ${total}%`);
}

console.log('\nГотово:');
console.log('Common 50%');
console.log('Rare 27%');
console.log('Epic 14%');
console.log('Legendary 5%');
console.log('Mythic 2%');
console.log('Exclusive 1.2%');
console.log('Holographic 0.8%');
console.log('Treasure 0.02% — отдельная проверка, без изменений');
console.log('Повторки разрешены и получают новый номер экземпляра.');
