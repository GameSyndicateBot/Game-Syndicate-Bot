const {
    SlashCommandBuilder,
} = require('discord.js');

const { db } = require('../database/db');

const {
    getAllCards,
    giveCardToUser,
    syncCardsCatalog,
} = require('../utils/cardSystem');

const { checkDeveloper } = require('../utils/devOnly');
const { backupCriticalChange } = require('../services/automaticBackups');

const MAX_AMOUNT = 25;

function findCard(query) {
    const normalized = String(query ?? '').trim().toLowerCase();

    if (!normalized) return null;

    const cards = getAllCards();

    const exact = cards.find(card =>
        String(card.id) === normalized ||
        String(card.code ?? '').toLowerCase() === normalized ||
        String(card.name ?? '').toLowerCase() === normalized
    );

    if (exact) return exact;

    return cards.find(card =>
        String(card.name ?? '').toLowerCase().includes(normalized)
    ) ?? null;
}

function normalizePlayerId(value) {
    const text = String(value ?? '').trim();
    const mentionMatch = text.match(/^<@!?(\d{17,20})>$/);

    if (mentionMatch) return mentionMatch[1];
    if (/^\d{17,20}$/.test(text)) return text;

    return null;
}

async function resolveTarget(interaction, rawPlayer) {
    const userId = normalizePlayerId(rawPlayer);

    if (!userId) {
        return {
            ok: false,
            message: '❌ В поле `player` вставь Discord ID или упоминание участника.',
        };
    }

    const user = await interaction.client.users.fetch(userId).catch(() => null);

    if (!user) {
        return {
            ok: false,
            message: `❌ Не удалось найти пользователя с ID \`${userId}\`.`,
        };
    }

    return {
        ok: true,
        user,
    };
}

function formatCopyNumber(number) {
    return `#${String(number).padStart(6, '0')}`;
}

function resetDailyPack(userId) {
    try {
        const result = db.prepare(`
            DELETE FROM daily_card_packs
            WHERE user_id = ?
        `).run(userId);

        return result.changes ?? 0;
    } catch (error) {
        console.error('[cardadmin resetdaily]', error);
        return 0;
    }
}

function takeCardsFromUser(userId, card, options = {}) {
    const rarity = String(options.rarity ?? card.base_rarity).toLowerCase();
    const edition = String(options.edition ?? 'standard').toLowerCase();
    const amount = Math.max(1, Number(options.amount) || 1);

    const rows = db.prepare(`
        SELECT id, copy_number
        FROM player_cards
        WHERE user_id = ?
          AND card_id = ?
          AND rarity = ?
          AND edition = ?
        ORDER BY id DESC
        LIMIT ?
    `).all(userId, card.id, rarity, edition, amount);

    if (rows.length < amount) {
        return {
            ok: false,
            owned: rows.length,
            requested: amount,
            rarity,
            edition,
        };
    }

    const removeCard = db.prepare(`
        DELETE FROM player_cards
        WHERE id = ? AND user_id = ?
    `);

    const removeTreasureClaim = db.prepare(`
        DELETE FROM monthly_treasure_claims
        WHERE inventory_id = ?
    `);

    const transaction = db.transaction(() => {
        for (const row of rows) {
            if (rarity === 'treasure') {
                removeTreasureClaim.run(row.id);
            }

            removeCard.run(row.id, userId);
        }
    });

    transaction();

    const remaining = db.prepare(`
        SELECT COUNT(*) AS count
        FROM player_cards
        WHERE user_id = ?
          AND card_id = ?
          AND rarity = ?
          AND edition = ?
    `).get(userId, card.id, rarity, edition)?.count ?? 0;

    return {
        ok: true,
        removed: rows,
        remaining,
        rarity,
        edition,
    };
}

function addCommonCardOptions(subcommand, actionText) {
    return subcommand
        .setDescription(`${actionText} участнику карточку`)
        .addStringOption(option =>
            option
                .setName('player')
                .setDescription('Discord ID или упоминание участника')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('card')
                .setDescription('ID, код или название карточки: 33 или Лудомания')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option
                .setName('amount')
                .setDescription('Количество экземпляров')
                .setRequired(false)
                .setMinValue(1)
                .setMaxValue(MAX_AMOUNT)
        )
        .addStringOption(option =>
            option
                .setName('rarity')
                .setDescription('Редкость; если не указана — базовая редкость карты')
                .setRequired(false)
                .addChoices(
                    { name: 'Common', value: 'common' },
                    { name: 'Rare', value: 'rare' },
                    { name: 'Epic', value: 'epic' },
                    { name: 'Legendary', value: 'legendary' },
                    { name: 'Mythic', value: 'mythic' },
                    { name: 'Exclusive', value: 'exclusive' },
                    { name: 'Holographic', value: 'holographic' },
                    { name: 'Treasure', value: 'treasure' }
                )
        )
        .addStringOption(option =>
            option
                .setName('edition')
                .setDescription('Издание; обычно Standard')
                .setRequired(false)
                .addChoices(
                    { name: 'Standard', value: 'standard' }
                )
        );
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cardadmin')
        .setDescription('Команды владельца для управления карточками')
        .addSubcommand(subcommand =>
            addCommonCardOptions(
                subcommand.setName('give'),
                'Выдать'
            )
        )
        .addSubcommand(subcommand =>
            addCommonCardOptions(
                subcommand.setName('take'),
                'Забрать у'
            )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('resetdaily')
                .setDescription('Сбросить участнику ежедневный пак')
                .addStringOption(option =>
                    option
                        .setName('player')
                        .setDescription('Discord ID или упоминание; если не указано — ты')
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        if (!(await checkDeveloper(interaction))) {
            return;
        }

        await interaction.deferReply({
            ephemeral: true,
        });

        syncCardsCatalog();

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'resetdaily') {
            const rawPlayer = interaction.options.getString('player');

            let target = interaction.user;

            if (rawPlayer) {
                const resolved = await resolveTarget(interaction, rawPlayer);

                if (!resolved.ok) {
                    return interaction.editReply({
                        content: resolved.message,
                    });
                }

                target = resolved.user;
            }

            const changes = resetDailyPack(target.id);

            return interaction.editReply({
                content:
`# ✅ Daily Pack сброшен

**Участник:** ${target}
Удалено записей кулдауна: **${changes}**

Теперь участник снова может использовать \`/pack daily\`.`,
            });
        }

        const rawPlayer = interaction.options.getString('player', true);
        const resolved = await resolveTarget(interaction, rawPlayer);

        if (!resolved.ok) {
            return interaction.editReply({
                content: resolved.message,
            });
        }

        const target = resolved.user;
        const query = interaction.options.getString('card', true);
        const amount = interaction.options.getInteger('amount') ?? 1;
        const rarity = interaction.options.getString('rarity') ?? undefined;
        const edition = interaction.options.getString('edition') ?? 'standard';

        const card = findCard(query);

        if (!card) {
            return interaction.editReply({
                content: `❌ Карточка **${query}** не найдена. Проверь ID, код или название.`,
            });
        }

        const chosenRarity = rarity ?? card.base_rarity;
        const allowedRarities = card.drop_rarities ?? [card.base_rarity];

        if (!allowedRarities.includes(chosenRarity)) {
            return interaction.editReply({
                content:
`❌ Карточка **${card.code ?? card.id} • ${card.name}** не существует в редкости **${chosenRarity}**.

Доступные редкости: ${allowedRarities.map(value => `\`${value}\``).join(', ')}`,
            });
        }

        if (subcommand === 'give') {
            const drops = [];

            try {
                const transaction = db.transaction(() => {
                    for (let i = 0; i < amount; i++) {
                        const drop = giveCardToUser(target.id, card, {
                            rarity: chosenRarity,
                            edition,
                            source: `admin_give_by_${interaction.user.id}`,
                        });

                        drops.push(drop);
                    }
                });

                transaction();
                await backupCriticalChange(interaction.client, 'cardadmin-give');
            } catch (error) {
                console.error('[cardadmin give]', error);

                return interaction.editReply({
                    content:
`❌ Не удалось выдать карточку.

**Карта:** ${card.code ?? card.id} • ${card.name}
**Редкость:** ${chosenRarity}
**Причина:** ${error.message}`,
                });
            }

            return interaction.editReply({
                content: [
                    '# ✅ Карточка выдана',
                    '',
                    `**Получатель:** ${target}`,
                    `**Карта:** ${card.code ?? card.id} • ${card.name}`,
                    `**Редкость:** ${chosenRarity}`,
                    `**Количество:** ${amount}`,
                    '',
                    '## Экземпляры',
                    ...drops.map(drop =>
                        `• **${drop.rarityName}** • **${drop.editionName}** • ${formatCopyNumber(drop.copyNumber)}`
                    ),
                ].join('\n'),
            });
        }

        if (subcommand === 'take') {
            try {
                const result = takeCardsFromUser(target.id, card, {
                    amount,
                    rarity: chosenRarity,
                    edition,
                });

                if (!result.ok) {
                    return interaction.editReply({
                        content:
`❌ У участника недостаточно экземпляров этой карточки.

**Участник:** ${target}
**Карта:** ${card.code ?? card.id} • ${card.name}
**Редкость:** ${chosenRarity}
**Есть:** ${result.owned}
**Нужно забрать:** ${result.requested}`,
                    });
                }

                await backupCriticalChange(interaction.client, 'cardadmin-take');

                return interaction.editReply({
                    content: [
                        '# 🗑️ Карточка изъята',
                        '',
                        `**Участник:** ${target}`,
                        `**Карта:** ${card.code ?? card.id} • ${card.name}`,
                        `**Редкость:** ${chosenRarity}`,
                        `**Удалено:** ${result.removed.length}`,
                        `**Осталось таких экземпляров:** ${result.remaining}`,
                        '',
                        '## Удалённые экземпляры',
                        ...result.removed.map(row =>
                            `• ${formatCopyNumber(row.copy_number)}`
                        ),
                    ].join('\n'),
                });
            } catch (error) {
                console.error('[cardadmin take]', error);

                return interaction.editReply({
                    content:
`❌ Не удалось забрать карточку.

**Причина:** ${error.message}`,
                });
            }
        }

        return interaction.editReply({
            content: '❌ Неизвестная cardadmin-команда.',
        });
    },
};
