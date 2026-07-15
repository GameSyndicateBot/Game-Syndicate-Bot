const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    AttachmentBuilder,
} = require('discord.js');

const {
    getDuplicateGroups,
    getDismantleDustForRarity,
    dismantleCard,
    syncCardsCatalog,
} = require('../utils/cardSystem');

const {
    db,
    getCardDust,
    addCardDust,
} = require('../database/db');

const { checkDeveloper } = require('../utils/devOnly');
const { createDustPanel } = require('../images/dust/createDustPanel');
const { createDustInfoPanel } = require('../images/dust/createDustInfoPanel');
const { createDismantlePanel } = require('../images/dust/createDismantlePanel');
const { createCardImage } = require('../images/cards/createCardImage');

const PAGE_SIZE = 6;

db.prepare(`
    CREATE TABLE IF NOT EXISTS protected_card_copies (
        user_id TEXT NOT NULL,
        inventory_id INTEGER NOT NULL,
        protected_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, inventory_id)
    )
`).run();

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getRarityName(rarity) {
    return {
        common: 'Common',
        rare: 'Rare',
        epic: 'Epic',
        legendary: 'Legendary',
        mythic: 'Mythic',
        exclusive: 'Exclusive',
        holographic: 'Holographic',
        treasure: 'Treasure',
    }[rarity] ?? rarity;
}

function getEditionName(edition) {
    return {
        standard: 'Standard',
        foil: 'Foil',
        galaxy: 'Galaxy',
        crystal: 'Crystal',
        signature: 'Signature',
        glitch: 'Glitch',
        gold: 'Gold',
    }[edition] ?? edition;
}

function getRarityEmoji(rarity) {
    return {
        common: '⚪',
        rare: '🔵',
        epic: '🟣',
        legendary: '🟠',
        mythic: '🔴',
        exclusive: '💠',
        holographic: '🌈',
        treasure: '🏆',
    }[rarity] ?? '🎴';
}

function getEditionEmoji(edition) {
    return {
        standard: '⬜',
        foil: '✨',
        galaxy: '🌌',
        crystal: '💎',
        signature: '✍️',
        glitch: '⚡',
        gold: '👑',
    }[edition] ?? '⬜';
}

function formatCopyNumber(number) {
    return `#${String(number).padStart(6, '0')}`;
}

function getProtectedIds(userId) {
    return new Set(
        db.prepare(`
            SELECT inventory_id
            FROM protected_card_copies
            WHERE user_id = ?
        `).all(userId).map(row => Number(row.inventory_id))
    );
}

function isProtected(userId, inventoryId) {
    return Boolean(db.prepare(`
        SELECT 1
        FROM protected_card_copies
        WHERE user_id = ? AND inventory_id = ?
    `).get(userId, inventoryId));
}

function toggleProtection(userId, inventoryId) {
    if (isProtected(userId, inventoryId)) {
        db.prepare(`
            DELETE FROM protected_card_copies
            WHERE user_id = ? AND inventory_id = ?
        `).run(userId, inventoryId);

        return false;
    }

    const exists = db.prepare(`
        SELECT 1
        FROM player_cards
        WHERE id = ? AND user_id = ?
    `).get(inventoryId, userId);

    if (!exists) return null;

    db.prepare(`
        INSERT OR IGNORE INTO protected_card_copies (user_id, inventory_id)
        VALUES (?, ?)
    `).run(userId, inventoryId);

    return true;
}

function cleanupProtection(userId) {
    db.prepare(`
        DELETE FROM protected_card_copies
        WHERE user_id = ?
          AND inventory_id NOT IN (
              SELECT id FROM player_cards WHERE user_id = ?
          )
    `).run(userId, userId);
}

function getDuplicateCardsForDismantle(userId) {
    cleanupProtection(userId);

    const groups = getDuplicateGroups(userId);
    const protectedIds = getProtectedIds(userId);
    const items = [];

    for (const group of groups) {
        const sorted = [...group.ownedCards].sort((a, b) => {
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

            const scoreA =
                (rarityPower[a.rarity] ?? 0) * 100 +
                (editionPower[a.edition] ?? 0);
            const scoreB =
                (rarityPower[b.rarity] ?? 0) * 100 +
                (editionPower[b.edition] ?? 0);

            return scoreB - scoreA || Number(a.id) - Number(b.id);
        });

        // Первая копия группы всегда сохраняется как последняя обязательная.
        for (const owned of sorted.slice(1)) {
            items.push({
                ...owned,
                card: group.card,
                dust: getDismantleDustForRarity(owned.rarity),
                protected: protectedIds.has(Number(owned.id)),
            });
        }
    }

    return items.sort((a, b) => {
        if (a.protected !== b.protected) return a.protected ? 1 : -1;
        return b.dust - a.dust || Number(a.id) - Number(b.id);
    });
}

function getPageData(userId, page = 1) {
    const duplicates = getDuplicateCardsForDismantle(userId);
    const totalPages = Math.max(1, Math.ceil(duplicates.length / PAGE_SIZE));
    const safePage = Math.max(1, Math.min(page, totalPages));
    const start = (safePage - 1) * PAGE_SIZE;
    const visible = duplicates.slice(start, start + PAGE_SIZE);

    const dismantleable = duplicates.filter(item => !item.protected);
    const protectedCount = duplicates.length - dismantleable.length;
    const totalDust = dismantleable.reduce((sum, item) => sum + item.dust, 0);

    return {
        duplicates,
        dismantleable,
        visible,
        totalPages,
        safePage,
        totalDust,
        protectedCount,
    };
}

function findDuplicateItem(userId, inventoryId) {
    return getDuplicateCardsForDismantle(userId)
        .find(item => Number(item.id) === Number(inventoryId)) ?? null;
}

function buildSelectRow(userId, page) {
    const { visible } = getPageData(userId, page);
    if (!visible.length) return null;

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`dust_select_${userId}_${page}`)
            .setPlaceholder('Выбери повторку')
            .addOptions(
                visible.map(item => ({
                    label: `${item.protected ? '🔒 ' : ''}${item.card.code} • ${item.card.name}`.slice(0, 100),
                    description: `${getRarityName(item.rarity)} • ${getEditionName(item.edition)} • ${item.protected ? 'защищена' : `+${item.dust} Dust`}`.slice(0, 100),
                    value: String(item.id),
                    emoji: item.protected ? '🔒' : '♻️',
                }))
            )
    );
}

function buildListButtons(userId, page) {
    const { totalPages } = getPageData(userId, page);

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`dust_page_${userId}_${page - 1}`)
            .setLabel('Назад')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page <= 1),

        new ButtonBuilder()
            .setCustomId(`dust_refresh_${userId}_${page}`)
            .setLabel('Обновить')
            .setStyle(ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId(`dust_info_${userId}_${page}`)
            .setLabel('Как получить Dust')
            .setStyle(ButtonStyle.Success),

        new ButtonBuilder()
            .setCustomId(`dust_page_${userId}_${page + 1}`)
            .setLabel('Вперёд')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages)
    );
}

function buildBulkRow(userId, page) {
    const { dismantleable, protectedCount, totalDust } = getPageData(userId, page);

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`dust_bulk_${userId}_${page}`)
            .setLabel(`Распылить все (${dismantleable.length})`)
            .setEmoji('♻️')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(dismantleable.length === 0),

        new ButtonBuilder()
            .setCustomId(`dust_protected_${userId}_${page}`)
            .setLabel(`Защищено: ${protectedCount}`)
            .setEmoji('🔒')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(protectedCount === 0),

        new ButtonBuilder()
            .setCustomId(`dust_bulkinfo_${userId}_${page}`)
            .setLabel(`Получишь ${totalDust} Dust`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
    );
}

function buildConfirmButtons(userId, inventoryId, page, protectedState) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`dust_confirm_${userId}_${inventoryId}_${page}`)
            .setLabel('Распылить')
            .setEmoji('♻️')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(protectedState),

        new ButtonBuilder()
            .setCustomId(`dust_lock_${userId}_${inventoryId}_${page}`)
            .setLabel(protectedState ? 'Снять защиту' : 'Защитить')
            .setEmoji(protectedState ? '🔓' : '🔒')
            .setStyle(protectedState ? ButtonStyle.Success : ButtonStyle.Primary),

        new ButtonBuilder()
            .setCustomId(`dust_cancel_${userId}_${page}`)
            .setLabel('Назад')
            .setEmoji('↩️')
            .setStyle(ButtonStyle.Secondary)
    );
}

function buildBulkConfirmButtons(userId, page) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`dust_bulkconfirm_${userId}_${page}`)
            .setLabel('Да, распылить все')
            .setEmoji('♻️')
            .setStyle(ButtonStyle.Danger),

        new ButtonBuilder()
            .setCustomId(`dust_cancel_${userId}_${page}`)
            .setLabel('Отмена')
            .setStyle(ButtonStyle.Secondary)
    );
}

function buildResultButtons(userId, page) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`dust_cancel_${userId}_${page}`)
            .setLabel('Назад к Dust')
            .setEmoji('↩️')
            .setStyle(ButtonStyle.Primary)
    );
}

async function buildDustReply(user, page = 1) {
    const {
        duplicates,
        visible,
        totalPages,
        safePage,
        totalDust,
        protectedCount,
    } = getPageData(user.id, page);
    const balance = getCardDust(user.id);

    const panel = await createDustPanel(user, {
        balance,
        duplicates: visible,
        totalDuplicates: duplicates.length,
        page: safePage,
        totalPages,
        totalDust,
    });

    const rows = [];
    const selectRow = buildSelectRow(user.id, safePage);
    if (selectRow) rows.push(selectRow);
    rows.push(buildListButtons(user.id, safePage));
    rows.push(buildBulkRow(user.id, safePage));

    const protectionText = protectedCount
        ? `\n🔒 Защищено от распыления: **${protectedCount}**`
        : '';

    return {
        content: `# ✨ GS Dust${protectionText}`,
        files: [new AttachmentBuilder(panel, { name: 'gs-dust.png' })],
        components: rows,
    };
}

async function buildDustInfoReply(user, page = 1) {
    const panel = await createDustInfoPanel(user);

    return {
        content:
`# GS Dust — способы получения

🔒 Чтобы сохранить нужную повторку, выбери её в меню и нажми **«Защитить»**.
Защищённые копии не распыляются ни вручную, ни кнопкой **«Распылить все»**.`,
        files: [new AttachmentBuilder(panel, { name: 'gs-dust-guide.png' })],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`dust_cancel_${user.id}_${page}`)
                    .setLabel('Назад к Dust')
                    .setStyle(ButtonStyle.Primary)
            ),
        ],
    };
}

async function buildConfirmReply(user, inventoryId, page) {
    const item = findDuplicateItem(user.id, inventoryId);

    if (!item) {
        const reply = await buildDustReply(user, page);
        return {
            ...reply,
            content: '❌ Эта карточка уже недоступна для распыления.',
        };
    }

    const protectedState = isProtected(user.id, inventoryId);
    const cardImage = await createCardImage(item.card, item, {
        locked: protectedState,
    });

    return {
        content:
`# ${protectedState ? '🔒 Защищённая повторка' : '♻️ Подтверждение распыления'}

${getRarityEmoji(item.rarity)} **${getRarityName(item.rarity)}** • ${getEditionEmoji(item.edition)} **${getEditionName(item.edition)}** • ${formatCopyNumber(item.copy_number)}

${protectedState
    ? 'Эта копия защищена и не попадёт в массовое распыление.'
    : `Получишь: ✨ **${item.dust} GS Dust**`}`,
        files: [
            new AttachmentBuilder(cardImage, {
                name: `dust-preview-${item.card.code}.png`,
            }),
        ],
        components: [
            buildConfirmButtons(
                user.id,
                inventoryId,
                page,
                protectedState
            ),
        ],
    };
}

async function buildBulkConfirmReply(user, page) {
    const {
        dismantleable,
        protectedCount,
        totalDust,
    } = getPageData(user.id, page);

    return {
        content:
`# ⚠️ Массовое распыление

Будет распылено повторок: **${dismantleable.length}**
Будет получено: ✨ **${totalDust} GS Dust**
Защищённых копий пропущено: 🔒 **${protectedCount}**

Последняя обязательная копия каждой карточки также останется нетронутой.`,
        files: [],
        components: [buildBulkConfirmButtons(user.id, page)],
    };
}

function dismantleAllUnprotected(userId) {
    const { dismantleable, protectedCount } = getPageData(userId, 1);

    if (!dismantleable.length) {
        return {
            ok: false,
            count: 0,
            dust: 0,
            protectedCount,
            balance: getCardDust(userId),
        };
    }

    const totalDust = dismantleable.reduce(
        (sum, item) => sum + item.dust,
        0
    );
    const ids = dismantleable.map(item => Number(item.id));
    const placeholders = ids.map(() => '?').join(',');

    db.transaction(() => {
        db.prepare(`
            DELETE FROM player_cards
            WHERE user_id = ?
              AND id IN (${placeholders})
        `).run(userId, ...ids);

        db.prepare(`
            DELETE FROM protected_card_copies
            WHERE user_id = ?
              AND inventory_id IN (${placeholders})
        `).run(userId, ...ids);

        addCardDust(userId, totalDust);
    })();

    return {
        ok: true,
        count: ids.length,
        dust: totalDust,
        protectedCount,
        balance: getCardDust(userId),
    };
}

async function editDismantlePanel(interaction, content, panel, fileName) {
    return interaction.editReply({
        content,
        files: [
            new AttachmentBuilder(panel, {
                name: fileName,
            }),
        ],
        components: [],
    });
}

async function playDismantleAnimation(
    interaction,
    user,
    inventoryId,
    page
) {
    const item = findDuplicateItem(user.id, inventoryId);

    if (!item) {
        const reply = await buildDustReply(user, page);
        return interaction.editReply({
            ...reply,
            content: '❌ Эта карточка уже недоступна для распыления.',
        });
    }

    if (isProtected(user.id, inventoryId)) {
        const reply = await buildConfirmReply(
            user,
            inventoryId,
            page
        );
        return interaction.editReply({
            ...reply,
            content:
                '🔒 Сначала сними защиту с этой карточки.',
        });
    }

    const charge = await createDismantlePanel(
        user,
        item,
        'charge'
    );
    await editDismantlePanel(
        interaction,
        '# ♻️ Распыление карточки',
        charge,
        'dust-charge.png'
    );
    await sleep(650);

    const crack = await createDismantlePanel(
        user,
        item,
        'crack'
    );
    await editDismantlePanel(
        interaction,
        '# ♻️ Распыление карточки',
        crack,
        'dust-crack.png'
    );
    await sleep(650);

    const burst = await createDismantlePanel(
        user,
        item,
        'burst'
    );
    await editDismantlePanel(
        interaction,
        '# ♻️ Распыление карточки',
        burst,
        'dust-burst.png'
    );
    await sleep(700);

    const result = dismantleCard(user.id, inventoryId);

    if (!result.ok) {
        const reply = await buildDustReply(user, page);
        return interaction.editReply({
            ...reply,
            content:
                `❌ ${result.message ?? 'Не удалось распылить карточку.'}`,
        });
    }

    db.prepare(`
        DELETE FROM protected_card_copies
        WHERE user_id = ? AND inventory_id = ?
    `).run(user.id, inventoryId);

    const resultPanel = await createDismantlePanel(
        user,
        item,
        'result',
        result
    );

    return interaction.editReply({
        content: '# ✨ Расыление завершено',
        files: [
            new AttachmentBuilder(resultPanel, {
                name: 'dust-result.png',
            }),
        ],
        components: [buildResultButtons(user.id, page)],
    });
}

module.exports = {
    buildDustReply,
    playDismantleAnimation,

    data: new SlashCommandBuilder()
        .setName('dust')
        .setDescription(
            'GS Dust, защита и распыление повторок карточек'
        ),

    async execute(interaction) {
        if (!(await checkDeveloper(interaction))) return;

        await interaction.deferReply();
        syncCardsCatalog();

        const reply = await buildDustReply(
            interaction.user,
            1
        );
        return interaction.editReply(reply);
    },

    async handleComponent(interaction) {
        const parts = interaction.customId.split('_');

        if (parts[0] !== 'dust') return false;

        const action = parts[1];
        const ownerId = parts[2];

        if (interaction.user.id !== ownerId) {
            await interaction.reply({
                content:
                    'Это меню Dust открыто не для тебя.',
                ephemeral: true,
            });
            return true;
        }

        if (action === 'page' || action === 'refresh') {
            const page = Number(parts[3] ?? 1);
            const reply = await buildDustReply(
                interaction.user,
                page
            );
            await interaction.update(reply);
            return true;
        }

        if (action === 'info') {
            const page = Number(parts[3] ?? 1);
            const reply = await buildDustInfoReply(
                interaction.user,
                page
            );
            await interaction.update(reply);
            return true;
        }

        if (action === 'select') {
            const page = Number(parts[3] ?? 1);
            const inventoryId = Number(
                interaction.values[0]
            );
            const reply = await buildConfirmReply(
                interaction.user,
                inventoryId,
                page
            );
            await interaction.update(reply);
            return true;
        }

        if (action === 'cancel') {
            const page = Number(parts[3] ?? 1);
            const reply = await buildDustReply(
                interaction.user,
                page
            );
            await interaction.update(reply);
            return true;
        }

        if (action === 'lock') {
            const inventoryId = Number(parts[3]);
            const page = Number(parts[4] ?? 1);
            const state = toggleProtection(
                interaction.user.id,
                inventoryId
            );

            if (state === null) {
                const reply = await buildDustReply(
                    interaction.user,
                    page
                );
                await interaction.update({
                    ...reply,
                    content:
                        '❌ Карточка больше не найдена.',
                });
                return true;
            }

            const reply = await buildConfirmReply(
                interaction.user,
                inventoryId,
                page
            );
            await interaction.update({
                ...reply,
                content:
                    state
                        ? '🔒 Карточка защищена от любого распыления.'
                        : '🔓 Защита с карточки снята.',
            });
            return true;
        }

        if (action === 'confirm') {
            const inventoryId = Number(parts[3]);
            const page = Number(parts[4] ?? 1);

            await interaction.deferUpdate();
            await playDismantleAnimation(
                interaction,
                interaction.user,
                inventoryId,
                page
            );
            return true;
        }

        if (action === 'bulk') {
            const page = Number(parts[3] ?? 1);
            const reply = await buildBulkConfirmReply(
                interaction.user,
                page
            );
            await interaction.update(reply);
            return true;
        }

        if (action === 'bulkconfirm') {
            const page = Number(parts[3] ?? 1);
            await interaction.deferUpdate();

            const result = dismantleAllUnprotected(
                interaction.user.id
            );

            if (!result.ok) {
                const reply = await buildDustReply(
                    interaction.user,
                    page
                );
                await interaction.editReply({
                    ...reply,
                    content:
                        'ℹ️ Нет незащищённых повторок для распыления.',
                });
                return true;
            }

            const reply = await buildDustReply(
                interaction.user,
                1
            );
            await interaction.editReply({
                ...reply,
                content:
`# ✨ Массовое распыление завершено

Распылено карточек: **${result.count}**
Получено: ✨ **${result.dust} GS Dust**
Защищено и пропущено: 🔒 **${result.protectedCount}**
Новый баланс: ✨ **${result.balance} GS Dust**`,
            });
            return true;
        }

        if (
            action === 'protected' ||
            action === 'bulkinfo'
        ) {
            await interaction.reply({
                content:
                    '🔒 Защищённые карточки отмечены в списке. Выбери карточку, чтобы снять защиту.',
                ephemeral: true,
            });
            return true;
        }

        return false;
    },
};
