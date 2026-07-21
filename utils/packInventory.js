const { db } = require('../database/db');

const PACK_TYPES = Object.freeze({
    base: {
        id: 'base',
        name: 'Base Pack',
    },
    premium: {
        id: 'premium',
        name: 'Premium Pack',
    },
    elite: {
        id: 'elite',
        name: 'Elite Pack',
    },
});

const PACK_ALIASES = Object.freeze({
    base: 'base',
    base_pack: 'base',
    basic: 'base',
    common: 'base',

    premium: 'premium',
    premium_pack: 'premium',

    elite: 'elite',
    elite_pack: 'elite',
});

function initPackInventoryTable() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS player_pack_inventory (
            user_id TEXT NOT NULL,
            pack_type TEXT NOT NULL,
            amount INTEGER NOT NULL DEFAULT 0 CHECK(amount >= 0),
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, pack_type)
        );

        CREATE INDEX IF NOT EXISTS idx_player_pack_inventory_user
        ON player_pack_inventory(user_id);
    `);
}

function normalizeUserId(userId) {
    const normalized = String(userId ?? '').trim();

    if (!normalized) {
        throw new TypeError('userId обязателен.');
    }

    return normalized;
}

function normalizePackType(packType) {
    const raw = String(packType ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');

    const normalized = PACK_ALIASES[raw];

    if (!normalized || !PACK_TYPES[normalized]) {
        throw new RangeError(
            `Неизвестный тип пака: ${packType}. Доступно: base, premium, elite.`
        );
    }

    return normalized;
}

function normalizeAmount(amount, { allowZero = false } = {}) {
    const normalized = Number(amount);

    if (!Number.isSafeInteger(normalized)) {
        throw new TypeError('Количество паков должно быть целым числом.');
    }

    if (allowZero ? normalized < 0 : normalized <= 0) {
        throw new RangeError(
            allowZero
                ? 'Количество паков не может быть отрицательным.'
                : 'Количество паков должно быть больше нуля.'
        );
    }

    return normalized;
}

function getPackAmount(userId, packType) {
    initPackInventoryTable();

    const normalizedUserId = normalizeUserId(userId);
    const normalizedPackType = normalizePackType(packType);

    const row = db.prepare(`
        SELECT amount
        FROM player_pack_inventory
        WHERE user_id = ? AND pack_type = ?
    `).get(normalizedUserId, normalizedPackType);

    return Number(row?.amount ?? 0);
}

function getPackInventory(userId) {
    initPackInventoryTable();

    const normalizedUserId = normalizeUserId(userId);
    const rows = db.prepare(`
        SELECT pack_type, amount, updated_at
        FROM player_pack_inventory
        WHERE user_id = ?
    `).all(normalizedUserId);

    const stored = new Map(
        rows.map(row => [String(row.pack_type), row])
    );

    return Object.values(PACK_TYPES).map(pack => {
        const row = stored.get(pack.id);

        return {
            ...pack,
            amount: Number(row?.amount ?? 0),
            updatedAt: row?.updated_at ?? null,
        };
    });
}

function addPack(userId, packType, amount = 1) {
    initPackInventoryTable();

    const normalizedUserId = normalizeUserId(userId);
    const normalizedPackType = normalizePackType(packType);
    const normalizedAmount = normalizeAmount(amount);

    db.prepare(`
        INSERT INTO player_pack_inventory (
            user_id,
            pack_type,
            amount,
            updated_at
        )
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, pack_type) DO UPDATE SET
            amount = player_pack_inventory.amount + excluded.amount,
            updated_at = CURRENT_TIMESTAMP
    `).run(normalizedUserId, normalizedPackType, normalizedAmount);

    return getPackAmount(normalizedUserId, normalizedPackType);
}

function removePack(userId, packType, amount = 1) {
    initPackInventoryTable();

    const normalizedUserId = normalizeUserId(userId);
    const normalizedPackType = normalizePackType(packType);
    const normalizedAmount = normalizeAmount(amount);

    return db.transaction(() => {
        const currentAmount = getPackAmount(
            normalizedUserId,
            normalizedPackType
        );

        if (currentAmount < normalizedAmount) {
            return {
                ok: false,
                reason: 'not_enough_packs',
                packType: normalizedPackType,
                requested: normalizedAmount,
                balance: currentAmount,
            };
        }

        db.prepare(`
            UPDATE player_pack_inventory
            SET amount = amount - ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND pack_type = ?
        `).run(
            normalizedAmount,
            normalizedUserId,
            normalizedPackType
        );

        return {
            ok: true,
            packType: normalizedPackType,
            removed: normalizedAmount,
            balance: currentAmount - normalizedAmount,
        };
    })();
}

function consumePack(userId, packType, amount = 1) {
    return removePack(userId, packType, amount);
}

function setPackAmount(userId, packType, amount) {
    initPackInventoryTable();

    const normalizedUserId = normalizeUserId(userId);
    const normalizedPackType = normalizePackType(packType);
    const normalizedAmount = normalizeAmount(amount, { allowZero: true });

    db.prepare(`
        INSERT INTO player_pack_inventory (
            user_id,
            pack_type,
            amount,
            updated_at
        )
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id, pack_type) DO UPDATE SET
            amount = excluded.amount,
            updated_at = CURRENT_TIMESTAMP
    `).run(normalizedUserId, normalizedPackType, normalizedAmount);

    return normalizedAmount;
}

function hasPack(userId, packType, amount = 1) {
    const normalizedAmount = normalizeAmount(amount);
    return getPackAmount(userId, packType) >= normalizedAmount;
}

function clearPackInventory(userId) {
    initPackInventoryTable();

    const normalizedUserId = normalizeUserId(userId);
    const result = db.prepare(`
        DELETE FROM player_pack_inventory
        WHERE user_id = ?
    `).run(normalizedUserId);

    return Number(result.changes ?? 0);
}

initPackInventoryTable();

module.exports = {
    PACK_TYPES,
    normalizePackType,
    getPackAmount,
    getPackInventory,
    addPack,
    addPackToInventory: addPack,
    removePack,
    consumePack,
    setPackAmount,
    hasPack,
    clearPackInventory,
};
