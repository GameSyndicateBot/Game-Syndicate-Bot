const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Показать меню команд бота'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setColor(0x8B5CF6)
            .setTitle('📖 Game Syndicate Bot • Помощь')
            .setDescription('Ниже список доступных команд и возможностей бота.')
            .addFields(
                {
                    name: '👤 Профиль и прогресс',
                    value:
`**/profile** — показать PNG-профиль игрока.
**/achievements** — показать список достижений.
**/top** — показать лидерборд по XP, сообщениям, голосу или достижениям.`,
                    inline: false,
                },
                {
                    name: '🏆 Достижения',
                    value:
`Бот автоматически выдаёт достижения за сообщения, уровни, время на сервере и голосовые каналы.

Новые достижения публикуются в зале славы.`,
                    inline: false,
                },
                {
                    name: '🎙 Голосовая активность',
                    value:
`За время в голосовых каналах начисляется XP.
Также есть достижения за первый вход и часы в голосе.`,
                    inline: false,
                },
                {
                    name: '🛡 Админ-команды',
                    value:
`**/resetprofile** — сбросить профиль пользователя.
Доступно только администраторам.`,
                    inline: false,
                },
                {
                    name: '📜 Логи сервера',
                    value:
`Бот логирует удаление/редактирование сообщений, вход/выход участников, роли, таймауты, баны/разбаны и голосовые каналы.`,
                    inline: false,
                }
            )
            .setFooter({ text: 'Game Syndicate • Помощь по боту' })
            .setTimestamp();

        await interaction.reply({
            embeds: [embed],
            ephemeral: true,
        });
    },
};