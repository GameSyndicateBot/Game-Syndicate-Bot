'use strict';

const { SlashCommandBuilder, MessageFlags} = require('discord.js');
const {
    createGathering,
    publish,
    resolveStartTimestamp,
} = require('../telegram/crossGatherings');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gather')
        .setDescription('Создать общий сбор Telegram + Discord')
        .addStringOption(option => option
            .setName('game')
            .setDescription('Название игры')
            .setRequired(true)
            .setMaxLength(50))
        .addStringOption(option => option
            .setName('time')
            .setDescription('Время начала по МСК, например 20:00')
            .setRequired(true)
            .setMinLength(5)
            .setMaxLength(5))
        .addIntegerOption(option => option
            .setName('players')
            .setDescription('Сколько всего игроков нужно')
            .setRequired(true)
            .setMinValue(2)
            .setMaxValue(50))
        .addStringOption(option => option
            .setName('comment')
            .setDescription('Комментарий к сбору')
            .setRequired(false)
            .setMaxLength(300)),

    async execute(interaction) {
        const game = interaction.options.getString('game');
        const time = interaction.options.getString('time');
        const maxPlayers = interaction.options.getInteger('players');
        const comment = interaction.options.getString('comment');

        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
            return interaction.reply({
                content: 'Время нужно указать в формате `ЧЧ:ММ`, например `20:00`.',
                flags: MessageFlags.Ephemeral,
            });
        }

        const creatorName = interaction.member?.displayName
            || interaction.user.globalName
            || interaction.user.username;

        const gathering = createGathering({
            creatorPlatform: 'discord',
            creatorId: interaction.user.id,
            creatorName,
            game,
            time,
            startsAtTs: resolveStartTimestamp(time),
            maxPlayers,
            comment: comment || null,
            telegramChatId: null,
            discordUserId: interaction.user.id,
        });

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await publish(gathering);

        return interaction.editReply(
            '✅ Общий сбор создан и опубликован в назначенном канале.',
        );
    }
};
