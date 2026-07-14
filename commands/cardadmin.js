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

    return getAllCards().find(card => {
        return (
            String(card.id) === normalized ||
            String(card.code).toLowerCase() === normalized ||
            String(card.name).toLowerCase() === normalized ||
            String(card.name).toLowerCase().includes(normalized)
        );
    }) ?? null;
}

function formatCopyNumber(number) {
    return `#${String(number).padStart(6, '0')}`;
}

function normalizeRarity(value) {
    if (!value) return null;
    return String(value).toLowerCase();
}

function normalizeEdition(value) {
    if (!value) return null;
    return String(value).toLowerCase();
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
        .setDescription('Админ-команды для тестирования карточек')
        .addSubcommand(subcommand =>
            subcommand
                .setName('give')
                .setDescription('Выдать себе карточку для теста')
                .addStringOption(option =>
                    option
                        .setName('card')
                        .setDescription('ID, номер или имя карточки. Например: 010 или CreeLess')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option
                        .setName('amount')
                        .setDescription('Количество копий')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(MAX_GIVE_AMOUNT)
                )
                .addStringOption(option =>
                    option
                        .setName('rarity')
                        .setDescription('Редкость')
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
                        .setDescription('Издание')
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
                .setDescription('Сбросить себе кулдаун ежедневного пака для тестов')
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
            const changes = resetDailyPack(interaction.user.id);

            return interaction.editReply({
                content:
`# ✅ Daily Pack сброшен

Теперь можешь снова использовать:

\`/pack daily\`

Удалено записей кулдауна: **${changes}**`,
            });
        }

        if (subcommand !== 'give') {
            return interaction.editReply({
                content: '❌ Неизвестная cardadmin-команда.',
            });
        }

        const query = interaction.options.getString('card');
        const amount = interaction.options.getInteger('amount') ?? 1;
        const rarity = normalizeRarity(interaction.options.getString('rarity'));
        const edition = normalizeEdition(interaction.options.getString('edition'));

        const card = findCard(query);

        if (!card) {
            return interaction.editReply({
                content: `❌ Карточка **${query}** не найдена.`,
            });
        }

        const drops = [];

        for (let i = 0; i < amount; i++) {
            const drop = giveCardToUser(interaction.user.id, card, {
                rarity,
                edition,
                source: 'admin_give',
            });

            drops.push(drop);
        }

        const lines = [];

        lines.push('# ✅ Карточка выдана');
        lines.push('');
        lines.push(`**Карта:** ${card.code} • ${card.name}`);
        lines.push(`**Количество:** ${amount}`);
        lines.push('');
        lines.push('## Экземпляры');

        for (const drop of drops) {
            lines.push(
                `• **${drop.rarityName}** • **${drop.editionName}** • ${formatCopyNumber(drop.copyNumber)}`
            );
        }

        lines.push('');
        lines.push('Теперь можешь проверить:');
        lines.push('`/cards`');
        lines.push('`/dust`');

        return interaction.editReply({
            content: lines.join('\n'),
        });
    },
};
