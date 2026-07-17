const {
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder,
    EmbedBuilder,
} = require('discord.js');

const {
    PACK_TYPES,
    getPackInventory,
    consumePack,
    addPack,
} = require('../utils/packInventory');

const {
    PACK_TYPES: CARD_PACK_TYPES,
    openRandomCard,
    syncCardsCatalog,
} = require('../utils/cardSystem');

const { createRevealPanel } = require('../images/reveal/createRevealPanel');
const { backupCriticalChange } = require('../services/automaticBackups');

const BUTTON_PREFIX = 'packs_open_';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const PACK_META = Object.freeze({
    base: {
        emoji: '📦',
        style: ButtonStyle.Success,
        description: 'Базовый набор с одной случайной карточкой.',
    },
    premium: {
        emoji: '💎',
        style: ButtonStyle.Primary,
        description: 'Улучшенный набор с повышенными шансами редких карточек.',
    },
    elite: {
        emoji: '👑',
        style: ButtonStyle.Danger,
        description: 'Элитный набор с самыми высокими шансами топовых редкостей.',
    },
});

function buttonId(packId, userId) {
    return `${BUTTON_PREFIX}${packId}_${userId}`;
}

function buildInventoryEmbed(user, inventory, notice = null) {
    const total = inventory.reduce((sum, pack) => sum + pack.amount, 0);
    const embed = new EmbedBuilder()
        .setColor(0x8b2cff)
        .setTitle('📦 Твои паки')
        .setDescription(
            notice
                ? `${notice}\n\nВыбери пак, который хочешь открыть.`
                : total > 0
                    ? 'Выбери пак, который хочешь открыть.'
                    : 'Сейчас в инвентаре нет паков. Их можно получить в событиях, загадках, Lucky Day и за мирового босса.'
        )
        .setAuthor({
            name: user.globalName || user.username,
            iconURL: user.displayAvatarURL({ extension: 'png', size: 128 }),
        })
        .addFields(
            ...inventory.map(pack => ({
                name: `${PACK_META[pack.id].emoji} ${pack.name}`,
                value: `В наличии: **${pack.amount}**\n${PACK_META[pack.id].description}`,
                inline: true,
            }))
        )
        .setFooter({ text: `Всего паков: ${total}` });

    return embed;
}

function buildInventoryButtons(userId, inventory) {
    const amounts = new Map(inventory.map(pack => [pack.id, pack.amount]));

    return [
        new ActionRowBuilder().addComponents(
            ...Object.values(PACK_TYPES).map(pack => new ButtonBuilder()
                .setCustomId(buttonId(pack.id, userId))
                .setLabel(`Открыть ${pack.name}`)
                .setEmoji(PACK_META[pack.id].emoji)
                .setStyle(PACK_META[pack.id].style)
                .setDisabled((amounts.get(pack.id) ?? 0) <= 0)
            )
        ),
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`gs_home_${userId}`)
                .setLabel('Вернуться в GS Hub')
                .setEmoji('🏠')
                .setStyle(ButtonStyle.Secondary)
        ),
    ];
}

function buildInventoryReply(user, notice = null) {
    const inventory = getPackInventory(user.id);

    return {
        content: '',
        embeds: [buildInventoryEmbed(user, inventory, notice)],
        files: [],
        components: buildInventoryButtons(user.id, inventory),
    };
}

function buildResultButtons(userId, packId, remaining) {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(buttonId(packId, userId))
            .setLabel(`Открыть ещё (${remaining})`)
            .setEmoji(PACK_META[packId].emoji)
            .setStyle(PACK_META[packId].style)
            .setDisabled(remaining <= 0),
        new ButtonBuilder()
            .setCustomId(`packs_inventory_${userId}`)
            .setLabel('Мои паки')
            .setEmoji('📦')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`cards_back_${userId}_all_1`)
            .setLabel('Открыть альбом')
            .setEmoji('📖')
            .setStyle(ButtonStyle.Secondary)
    );

    return [row];
}

function openOwnedPack(userId, packId) {
    const pack = CARD_PACK_TYPES[packId];

    if (!pack) {
        return { ok: false, reason: 'unknown_pack' };
    }

    const consumed = consumePack(userId, packId, 1);

    if (!consumed.ok) {
        return {
            ok: false,
            reason: consumed.reason,
            balance: consumed.balance,
            pack,
        };
    }

    try {
        const drop = openRandomCard(userId, {
            source: `inventory_pack_${pack.id}`,
            allowTreasure: true,
            rarityChances: pack.chances,
        });

        return {
            ok: true,
            pack,
            drop,
            remaining: consumed.balance,
        };
    } catch (error) {
        // Возвращаем пак, если выдача карточки не завершилась.
        addPack(userId, packId, 1);
        throw error;
    }
}

async function playInventoryPackOpening(interaction, user, packId) {
    const pack = CARD_PACK_TYPES[packId];

    if (!pack) {
        return interaction.editReply(buildInventoryReply(user, '❌ Неизвестный тип пака.'));
    }

    const charge = await createRevealPanel(user, {
        phase: 'charge',
        source: pack.name.toUpperCase(),
    });

    await interaction.editReply({
        content: `# ${PACK_META[packId].emoji} Открываем ${pack.name}...`,
        embeds: [],
        files: [new AttachmentBuilder(charge, { name: 'inventory-pack-charge.png' })],
        components: [],
    });

    await sleep(650);

    const result = openOwnedPack(user.id, packId);

    if (!result.ok) {
        return interaction.editReply(buildInventoryReply(
            user,
            `❌ У тебя нет **${pack.name}** для открытия.`
        ));
    }

    await backupCriticalChange(interaction.client, `inventory-${pack.id}-opened`);

    const burst = await createRevealPanel(user, {
        phase: 'burst',
        source: pack.name.toUpperCase(),
        drop: result.drop,
    });

    await interaction.editReply({
        content: '# ✨ Пак открыт...',
        embeds: [],
        files: [new AttachmentBuilder(burst, { name: 'inventory-pack-burst.png' })],
        components: [],
    });

    await sleep(750);

    const rarity = await createRevealPanel(user, {
        phase: 'rarity',
        source: pack.name.toUpperCase(),
        drop: result.drop,
    });

    await interaction.editReply({
        content: '# 🔮 Редкость определена...',
        embeds: [],
        files: [new AttachmentBuilder(rarity, { name: 'inventory-pack-rarity.png' })],
        components: [],
    });

    await sleep(850);

    const finalPanel = await createRevealPanel(user, {
        phase: 'result',
        source: pack.name.toUpperCase(),
        drop: result.drop,
    });

    return interaction.editReply({
        content:
            `# 🎴 Карточка получена\n` +
            `**${result.drop.rarityName} ${result.drop.card.name}**\n` +
            `Осталось **${result.remaining}** × ${pack.name}.`,
        embeds: [],
        files: [new AttachmentBuilder(finalPanel, { name: 'inventory-pack-result.png' })],
        components: buildResultButtons(user.id, packId, result.remaining),
    });
}

module.exports = {
    buildInventoryReply,
    playInventoryPackOpening,

    data: new SlashCommandBuilder()
        .setName('packs')
        .setDescription('Посмотреть и открыть полученные паки'),

    async execute(interaction) {
        await interaction.deferReply();
        syncCardsCatalog();
        return interaction.editReply(buildInventoryReply(interaction.user));
    },

    async handleComponent(interaction) {
        if (interaction.customId.startsWith('packs_inventory_')) {
            const ownerId = interaction.customId.slice('packs_inventory_'.length);

            if (interaction.user.id !== ownerId) {
                await interaction.reply({
                    content: 'Это не твой инвентарь паков.',
                    ephemeral: true,
                });
                return true;
            }

            await interaction.deferUpdate();
            await interaction.editReply(buildInventoryReply(interaction.user));
            return true;
        }

        if (!interaction.customId.startsWith(BUTTON_PREFIX)) {
            return false;
        }

        const payload = interaction.customId.slice(BUTTON_PREFIX.length);
        const separator = payload.indexOf('_');
        const packId = separator >= 0 ? payload.slice(0, separator) : '';
        const ownerId = separator >= 0 ? payload.slice(separator + 1) : '';

        if (!ownerId || interaction.user.id !== ownerId) {
            await interaction.reply({
                content: 'Этот инвентарь паков открыт не для тебя.',
                ephemeral: true,
            });
            return true;
        }

        if (!CARD_PACK_TYPES[packId]) {
            await interaction.reply({
                content: '❌ Неизвестный тип пака.',
                ephemeral: true,
            });
            return true;
        }

        await interaction.deferUpdate();

        try {
            syncCardsCatalog();
            await playInventoryPackOpening(interaction, interaction.user, packId);
        } catch (error) {
            console.error('Inventory pack opening failed:', error);
            await interaction.editReply(buildInventoryReply(
                interaction.user,
                '❌ Не удалось открыть пак. Пак не был потерян — попробуй ещё раз.'
            )).catch(() => null);
        }

        return true;
    },
};
