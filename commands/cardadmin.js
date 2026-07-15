const { SlashCommandBuilder } = require('discord.js');

const { db } = require('../database/db');
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

function parseDiscordUserId(value) {
    const text = String(value ?? '').trim();
    const mentionMatch = text.match(/^<@!?(\d{17,20})>$/);
    if (mentionMatch) return mentionMatch[1];
    if (/^\d{17,20}$/.test(text)) return text;
    return null;
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

module.exports = {
    data: new SlashCommandBuilder()
        .setName('cardadmin')
        .setDescription('Команды владельца для управления карточками')
        .addSubcommand(subcommand =>
            subcommand
                .setName('give')
                .setDescription('Выдать игроку любую карточку')
                // Обязательные параметры идут первыми — этого требует Discord.
                .addStringOption(option =>
                    option
                        .setName('player')
                        .setDescription('Discord ID игрока или упоминание @игрока')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option
                        .setName('card')
                        .setDescription('ID, код или название карточки: 33 / 033 / Лудомания')
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
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('resetdaily')
                .setDescription('Сбросить игроку ежедневный пак')
                .addStringOption(option =>
                    option
                        .setName('player')
                        .setDescription('Discord ID игрока или упоминание; пусто — сбросить себе')
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        if (!(await checkDeveloper(interaction))) return;

        await interaction.deferReply({ ephemeral: true });

        try {
            syncCardsCatalog();

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'resetdaily') {
                const rawPlayer = interaction.options.getString('player');
                const userId = rawPlayer ? parseDiscordUserId(rawPlayer) : interaction.user.id;

                if (!userId) {
                    return interaction.editReply(
                        '❌ Укажи корректный Discord ID или упоминание игрока.'
                    );
                }

                const user = await interaction.client.users.fetch(userId).catch(() => null);
                const changes = resetDailyPack(userId);

                return interaction.editReply({
                    content:
`# ✅ Daily Pack сброшен

**Участник:** ${user ? `<@${user.id}>` : `\`${userId}\``}
Удалено записей кулдауна: **${changes}**

Теперь игрок снова может использовать \`/pack daily\`.`,
                });
            }

            if (subcommand !== 'give') {
                return interaction.editReply('❌ Неизвестная подкоманда.');
            }

            const rawPlayer = interaction.options.getString('player', true);
            const userId = parseDiscordUserId(rawPlayer);

            if (!userId) {
                return interaction.editReply(
                    '❌ Неверный получатель. Вставь Discord ID из 17–20 цифр или упоминание игрока.'
                );
            }

            // Получатель может отсутствовать в кэше — fetch получает его напрямую через Discord API.
            const targetUser = await interaction.client.users.fetch(userId).catch(() => null);
            if (!targetUser) {
                return interaction.editReply(
                    `❌ Discord не нашёл пользователя с ID \`${userId}\`.`
                );
            }

            const query = interaction.options.getString('card', true);
            const amount = interaction.options.getInteger('amount') ?? 1;
            const requestedRarity = interaction.options.getString('rarity');
            const card = findCard(query);

            if (!card) {
                return interaction.editReply(
                    `❌ Карточка **${query}** не найдена. Укажи ID, код или точное название.`
                );
            }

            const rarity = requestedRarity ?? card.base_rarity;
            const availableRarities = card.drop_rarities ?? [card.base_rarity];

            if (!availableRarities.includes(rarity)) {
                return interaction.editReply({
                    content:
`❌ Карта **${card.code ?? card.id} • ${card.name}** не существует в редкости **${rarity}**.

Доступные редкости: **${availableRarities.join(', ')}**.`,
                });
            }

            const drops = [];
            const giveTransaction = db.transaction(() => {
                for (let i = 0; i < amount; i += 1) {
                    drops.push(giveCardToUser(userId, card, {
                        rarity,
                        edition: 'standard',
                        source: `admin_give_by_${interaction.user.id}`,
                    }));
                }
            });

            giveTransaction();

            const lines = [
                '# ✅ Карточка выдана',
                '',
                `**Получатель:** <@${userId}> (\`${userId}\`)`,
                `**Карта:** ${card.code ?? card.id} • ${card.name}`,
                `**Редкость:** ${drops[0]?.rarityName ?? rarity}`,
                `**Количество:** ${amount}`,
                '',
                '## Экземпляры',
                ...drops.map(drop =>
                    `• **${drop.rarityName}** • ${formatCopyNumber(drop.copyNumber)}`
                ),
            ];

            return interaction.editReply({ content: lines.join('\n') });
        } catch (error) {
            console.error('[cardadmin]', error);

            const message = error?.message ?? String(error);
            return interaction.editReply({
                content: `❌ Ошибка команды \`/cardadmin\`: ${message}`,
            }).catch(() => null);
        }
    },
};
