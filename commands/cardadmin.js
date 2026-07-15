const {
    SlashCommandBuilder,
} = require('discord.js');

const {
    db,
} = require('../database/db');

const {
    getAllCards,
    giveCardToUser,
    syncCardsCatalog,
} = require('../utils/cardSystem');

const { checkDeveloper } = require('../utils/devOnly');

const MAX_GIVE_AMOUNT = 25;

function findCard(query) {
    const normalized = String(query ?? '').trim().toLowerCase();

    if (!normalized) return null;

    const cards = getAllCards();

    // Сначала точное совпадение по ID, коду или названию.
    const exact = cards.find(card =>
        String(card.id) === normalized ||
        String(card.code ?? '').toLowerCase() === normalized ||
        String(card.name ?? '').toLowerCase() === normalized
    );

    if (exact) return exact;

    // Затем частичное совпадение по названию.
    return cards.find(card =>
        String(card.name ?? '').toLowerCase().includes(normalized)
    ) ?? null;
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
        console.error('Ошибка сброса daily pack:', error);
        return 0;
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cardadmin')
        .setDescription('Команды владельца для управления карточками')
        .addSubcommand(subcommand =>
            subcommand
                .setName('give')
                .setDescription('Выдать выбранному участнику карточку')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('Выбери участника из списка')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('user_id')
                        .setDescription('Или вставь Discord ID участника вручную')
                        .setRequired(false)
                )
                .addStringOption(option =>
                    option
                        .setName('card')
                        .setDescription('ID, номер или название карточки, например: 33 или Лудомания')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('amount')
                        .setDescription('Количество экземпляров')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(MAX_GIVE_AMOUNT)
                )
                .addStringOption(option =>
                    option
                        .setName('rarity')
                        .setDescription('Редкость карточки; если не указана — базовая')
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
                            { name: 'Standard', value: 'standard' },
                            { name: 'Foil', value: 'foil' },
                            { name: 'Galaxy', value: 'galaxy' },
                            { name: 'Crystal', value: 'crystal' },
                            { name: 'Signature', value: 'signature' },
                            { name: 'Glitch', value: 'glitch' },
                            { name: 'Gold', value: 'gold' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('resetdaily')
                .setDescription('Сбросить участнику ежедневный пак')
                .addUserOption(option =>
                    option
                        .setName('user')
                        .setDescription('Участник; если не указан — ты')
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
            const target = interaction.options.getUser('user') ?? interaction.user;
            const changes = resetDailyPack(target.id);

            return interaction.editReply({
                content:
`# ✅ Daily Pack сброшен

**Участник:** ${target}
Удалено записей кулдауна: **${changes}**

Теперь участник снова может использовать \`/pack daily\`.`,
            });
        }

        if (subcommand !== 'give') {
            return interaction.editReply({
                content: '❌ Неизвестная cardadmin-команда.',
            });
        }

        const selectedUser = interaction.options.getUser('user');
        const typedUserId = interaction.options.getString('user_id')?.trim();

        if (!selectedUser && !typedUserId) {
            return interaction.editReply({
                content: '❌ Выбери участника в поле `user` или вставь его Discord ID в поле `user_id`.',
            });
        }

        let target = selectedUser;

        if (!target && typedUserId) {
            if (!/^\d{17,20}$/.test(typedUserId)) {
                return interaction.editReply({
                    content: '❌ Неверный Discord ID. Он должен состоять только из 17–20 цифр.',
                });
            }

            target = await interaction.client.users.fetch(typedUserId).catch(() => null);

            if (!target) {
                return interaction.editReply({
                    content: `❌ Не удалось найти пользователя с ID \`${typedUserId}\`.`,
                });
            }
        }

        const query = interaction.options.getString('card', true);
        const amount = interaction.options.getInteger('amount') ?? 1;
        const rarity = interaction.options.getString('rarity') ?? undefined;
        const edition = interaction.options.getString('edition') ?? 'standard';

        const card = findCard(query);

        if (!card) {
            return interaction.editReply({
                content: `❌ Карточка **${query}** не найдена. Проверь ID или название.`,
            });
        }

        const drops = [];

        try {
            for (let i = 0; i < amount; i++) {
                const drop = giveCardToUser(target.id, card, {
                    rarity: rarity ?? card.base_rarity,
                    edition,
                    source: `admin_give_by_${interaction.user.id}`,
                });

                drops.push(drop);
            }
        } catch (error) {
            console.error('[cardadmin give]', error);

            return interaction.editReply({
                content:
`❌ Не удалось выдать карточку.

**Карта:** ${card.code ?? card.id} • ${card.name}
**Редкость:** ${rarity ?? card.base_rarity}
**Причина:** ${error.message}`,
            });
        }

        const lines = [
            '# ✅ Карточка выдана',
            '',
            `**Получатель:** ${target}`,
            `**Карта:** ${card.code ?? card.id} • ${card.name}`,
            `**Количество:** ${amount}`,
            '',
            '## Экземпляры',
            ...drops.map(drop =>
                `• **${drop.rarityName}** • **${drop.editionName}** • ${formatCopyNumber(drop.copyNumber)}`
            ),
        ];

        return interaction.editReply({
            content: lines.join('\n'),
        });
    },
};
