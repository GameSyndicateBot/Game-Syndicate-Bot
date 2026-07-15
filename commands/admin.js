const { SlashCommandBuilder } = require('discord.js');

const {
    db,
    getOrCreatePlayer,
    getCardDust,
    addCardDust,
    removeCardDust,
} = require('../database/db');

function isBotOwner(interaction) {
    const ownerId = String(process.env.BOT_OWNER_ID ?? '').trim();
    return Boolean(ownerId) && interaction.user.id === ownerId;
}

async function denyOwnerOnly(interaction) {
    const payload = {
        content: '❌ Эта команда доступна только владельцу бота.',
        ephemeral: true,
    };

    if (interaction.replied || interaction.deferred) {
        return interaction.followUp(payload);
    }

    return interaction.reply(payload);
}

function ensureTargetPlayer(user) {
    return getOrCreatePlayer(user);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Команды владельца бота')
        .addSubcommandGroup(group =>
            group
                .setName('dust')
                .setDescription('Управление GS Dust')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('add')
                        .setDescription('Добавить GS Dust участнику')
                        .addUserOption(option =>
                            option
                                .setName('user')
                                .setDescription('Участник, которому нужно выдать Dust')
                                .setRequired(true)
                        )
                        .addIntegerOption(option =>
                            option
                                .setName('amount')
                                .setDescription('Количество Dust')
                                .setRequired(true)
                                .setMinValue(1)
                                .setMaxValue(100000000)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('remove')
                        .setDescription('Снять GS Dust у участника')
                        .addUserOption(option =>
                            option
                                .setName('user')
                                .setDescription('Участник, у которого нужно снять Dust')
                                .setRequired(true)
                        )
                        .addIntegerOption(option =>
                            option
                                .setName('amount')
                                .setDescription('Количество Dust')
                                .setRequired(true)
                                .setMinValue(1)
                                .setMaxValue(100000000)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('set')
                        .setDescription('Установить точный баланс GS Dust')
                        .addUserOption(option =>
                            option
                                .setName('user')
                                .setDescription('Участник')
                                .setRequired(true)
                        )
                        .addIntegerOption(option =>
                            option
                                .setName('amount')
                                .setDescription('Новый баланс Dust')
                                .setRequired(true)
                                .setMinValue(0)
                                .setMaxValue(100000000)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('check')
                        .setDescription('Проверить баланс GS Dust')
                        .addUserOption(option =>
                            option
                                .setName('user')
                                .setDescription('Участник')
                                .setRequired(true)
                        )
                )
        ),

    async execute(interaction) {
        if (!isBotOwner(interaction)) {
            return denyOwnerOnly(interaction);
        }

        const group = interaction.options.getSubcommandGroup();
        const subcommand = interaction.options.getSubcommand();

        if (group !== 'dust') {
            return interaction.reply({
                content: '❌ Неизвестная группа admin-команд.',
                ephemeral: true,
            });
        }

        const target = interaction.options.getUser('user', true);
        ensureTargetPlayer(target);

        if (subcommand === 'check') {
            const balance = getCardDust(target.id);
            return interaction.reply({
                content: `💠 Баланс **${target.username}**: **${balance.toLocaleString('ru-RU')} GS Dust**.`,
                ephemeral: true,
            });
        }

        const amount = interaction.options.getInteger('amount', true);

        if (subcommand === 'add') {
            const balance = addCardDust(target.id, amount);
            return interaction.reply({
                content:
                    `✅ **${target.username}** получил **${amount.toLocaleString('ru-RU')} GS Dust**.\n` +
                    `Новый баланс: **${balance.toLocaleString('ru-RU')} GS Dust**.`,
                ephemeral: true,
            });
        }

        if (subcommand === 'remove') {
            const result = removeCardDust(target.id, amount);

            if (!result.ok) {
                return interaction.reply({
                    content:
                        `❌ У **${target.username}** недостаточно Dust.\n` +
                        `Текущий баланс: **${result.balance.toLocaleString('ru-RU')} GS Dust**.`,
                    ephemeral: true,
                });
            }

            return interaction.reply({
                content:
                    `✅ У **${target.username}** снято **${amount.toLocaleString('ru-RU')} GS Dust**.\n` +
                    `Новый баланс: **${result.balance.toLocaleString('ru-RU')} GS Dust**.`,
                ephemeral: true,
            });
        }

        if (subcommand === 'set') {
            db.prepare(`
                UPDATE players
                SET card_dust = ?
                WHERE user_id = ?
            `).run(amount, target.id);

            return interaction.reply({
                content: `✅ Баланс **${target.username}** установлен на **${amount.toLocaleString('ru-RU')} GS Dust**.`,
                ephemeral: true,
            });
        }

        return interaction.reply({
            content: '❌ Неизвестная admin-команда.',
            ephemeral: true,
        });
    },
};
