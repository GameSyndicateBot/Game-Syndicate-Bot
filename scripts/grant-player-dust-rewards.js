'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { db } = require('../database/db');

const APPLY = process.argv.includes('--apply');
const REWARD_KEY = 'manual_dust_rewards_2026_07_batch_1';

const rewards = [
    { userId: '561961056197672991', dust: 11200 }
    { userId: '830515570377097259', dust: 8000 }
    { userId: '468683569359880192', dust: 4800 }
    { userId: '759026090038657034', dust: 3200 }
    { userId: '302797251271458817', dust: 3200 }
];

db.exec(`
    CREATE TABLE IF NOT EXISTS manual_reward_batches (
        reward_key TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        details_json TEXT NOT NULL
    );
`);

const alreadyApplied = db.prepare(`
    SELECT reward_key, applied_at
    FROM manual_reward_batches
    WHERE reward_key = ?
`).get(REWARD_KEY);

if (alreadyApplied) {
    console.error(
        `❌ Этот пакет наград уже был применён: ${alreadyApplied.applied_at}`);
    process.exit(1);
}

const getPlayer = db.prepare(`
    SELECT
        user_id,
        username,
        COALESCE(card_dust, 0) AS card_dust
    FROM players
    WHERE user_id = ?
`);

const rows = rewards.map(reward => {
    const player = getPlayer.get(reward.userId);

    return {
        ...reward,
        username: player?.username || null,
        oldDust: Number(player?.card_dust || 0),
        newDust: Number(player?.card_dust || 0) + reward.dust,
        found: Boolean(player),
    };
});

console.log('');
console.log('=== НАЧИСЛЕНИЕ GS DUST ===');

for (const row of rows) {
    console.log(
        `${row.found ? '✅' : '❌'} ${row.userId}`
        + `${row.username ? ` (${row.username})` : ''}`
        + `: ${row.oldDust} + ${row.dust} = ${row.newDust}`);
}

const missing = rows.filter(row => !row.found);

if (missing.length > 0) {
    console.error('');
    console.error('❌ Некоторые Discord ID не найдены в таблице players.');
    console.error('Начисление отменено, чтобы не потерять награды.');
    process.exit(1);
}

if (!APPLY) {
    console.log('');
    console.log('Это предварительный просмотр. База не изменена.');
    console.log('Для применения выполни:');
    console.log('node scripts/grant-player-dust-rewards.js --apply');
    process.exit(0);
}

const databasePath = path.join(
    __dirname,
    '..',
    'database',
    'database.sqlite',
);
const backupDir = path.join(__dirname, '..', 'backups');
fs.mkdirSync(backupDir, { recursive: true });

const timestamp = new Date()
    .toISOString()
    .replaceAll(':', '-')
    .replaceAll('.', '-');

const backupPath = path.join(
    backupDir,
    `database-before-dust-rewards-${timestamp}.sqlite`);

db.pragma('wal_checkpoint(TRUNCATE)');
fs.copyFileSync(databasePath, backupPath);

const updateDust = db.prepare(`
    UPDATE players
    SET card_dust = COALESCE(card_dust, 0) + ?
    WHERE user_id = ?
`);

const saveBatch = db.prepare(`
    INSERT INTO manual_reward_batches (
        reward_key,
        details_json
    ) VALUES (?, ?)
`);

const applyRewards = db.transaction(() => {
    for (const reward of rewards) {
        const result = updateDust.run(reward.dust, reward.userId);

        if (result.changes !== 1) {
            throw new Error(
                `Не удалось начислить Dust пользователю ${reward.userId}`);
        }
    }

    saveBatch.run(REWARD_KEY, JSON.stringify(rewards));
});

try {
    applyRewards();
} catch (error) {
    console.error('❌ Ошибка начисления:', error.message);
    console.error(`Резервная копия: ${backupPath}`);
    process.exit(1);
}

console.log('');
console.log('✅ Dust успешно начислен всем 5 участникам.');
console.log(`💾 Резервная копия базы: ${backupPath}`);
console.log('Повторный запуск этого пакета заблокирован.');
