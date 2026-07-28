const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');

const {
    db,
    getOrCreatePlayer,
    getCardDust,
    addCardDust,
    removeCardDust,
} = require('../database/db');

const caravan = require('../services/caravanService');

function isBotOwner(interaction) {
    const ownerId = String(process.env.BOT_OWNER_ID ?? '').trim();
    return Boolean(ownerId) && interaction.user.id === ownerId;
}

async function denyOwnerOnly(interaction) {
    const payload = {
        content: '❌ Эта команда доступна только владельцу бота.',
        flags: MessageFlags.Ephemeral,
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
        )
        .addSubcommandGroup(group => group.setName('rpg').setDescription('Восстановление RPG-состояний')
            .addSubcommand(subcommand => subcommand.setName('unstuck').setDescription('Освободить игрока из зависшего RPG-состояния')
                .addUserOption(option => option.setName('user').setDescription('Игрок').setRequired(true))))
        .addSubcommandGroup(group => group.setName('caravan').setDescription('Управление Караванщиком')
            .addSubcommand(subcommand => subcommand.setName('next').setDescription('Показать время следующего появления Караванщика'))
            .addSubcommand(subcommand => subcommand.setName('status').setDescription('Показать состояние Караванщика'))) ,

    async execute(interaction) {
        if (!isBotOwner(interaction)) {
            return denyOwnerOnly(interaction);
        }

        const group = interaction.options.getSubcommandGroup();
        const subcommand = interaction.options.getSubcommand();

        if (group === 'caravan') {
            const state = caravan.statePublic();
            const opensAt = Date.parse(state.opens_at);
            const closesAt = Date.parse(state.closes_at);
            const openUnix = Math.floor(opensAt / 1000);
            const closeUnix = Math.floor(closesAt / 1000);
            const [atmosphereIcon, atmosphereText] = state.atmosphere || ['🐪', 'Караванщик продолжает путь.'];

            if (subcommand === 'next') {
                const description = state.active
                    ? `🟢 Караванщик уже находится в Гильдии.

🚪 Уйдёт: <t:${closeUnix}:F>
⏳ Осталось: <t:${closeUnix}:R>`
                    : `📅 Следующее появление: <t:${openUnix}:F>
⏳ До прибытия: <t:${openUnix}:R>
🕒 Продолжительность визита: **30 минут**.`;

                return interaction.reply({
                    embeds: [new EmbedBuilder()
                        .setColor(state.active ? 0x22C55E : 0x7C3AED)
                        .setTitle('🐪 Следующий Караванщик')
                        .setDescription(description)
                        .setFooter({ text: 'Время отображается в часовом поясе пользователя Discord.' })],
                    flags: MessageFlags.Ephemeral,
                });
            }

            if (subcommand === 'status') {
                const visits = db.prepare('SELECT COUNT(DISTINCT user_id) AS count FROM caravan_offers WHERE day_key=?').get(state.day_key)?.count || 0;
                const purchases = db.prepare("SELECT COUNT(*) AS count FROM caravan_history WHERE day_key=? AND action='purchased'").get(state.day_key)?.count || 0;
                const dustSpent = db.prepare('SELECT COALESCE(SUM(current_price),0) AS total FROM caravan_offers WHERE day_key=? AND purchased=1').get(state.day_key)?.total || 0;

                return interaction.reply({
                    embeds: [new EmbedBuilder()
                        .setColor(state.active ? 0x22C55E : 0x7C3AED)
                        .setTitle('🛠 Owner • Караванщик')
                        .setDescription(`${state.active ? '🟢 **Сейчас в Гильдии**' : '🔴 **Сейчас в пути**'}
${atmosphereIcon} ${atmosphereText}`)
                        .addFields(
                            { name: state.active ? 'Уход' : 'Следующее появление', value: state.active ? `<t:${closeUnix}:F>
<t:${closeUnix}:R>` : `<t:${openUnix}:F>
<t:${openUnix}:R>`, inline: false },
                            { name: 'День визита', value: `\`${state.day_key}\``, inline: true },
                            { name: 'Ассортимент получили', value: `${Number(visits).toLocaleString('ru-RU')} игроков`, inline: true },
                            { name: 'Покупок', value: Number(purchases).toLocaleString('ru-RU'), inline: true },
                            { name: 'Потрачено', value: `${Number(dustSpent).toLocaleString('ru-RU')} GS Dust`, inline: true },
                        )
                        .setFooter({ text: 'Команда доступна только владельцу бота.' })],
                    flags: MessageFlags.Ephemeral,
                });
            }
        }

        const target = interaction.options.getUser('user', true);

        if (group === 'rpg' && subcommand === 'unstuck') {
            const active = db.prepare(`
                SELECT id, location_key, started_at, ends_at
                FROM hero_expeditions
                WHERE user_id = ? AND status = 'active'
                ORDER BY id DESC
            `).all(target.id);

            // Никогда не вытаскиваем игрока из реально существующей активной экспедиции.
            // Даже владелец бота получает отказ, чтобы случайно не потерять прогресс/награду.
            if (active.length > 0) {
                return interaction.reply({
                    content: `⚠️ **${target.username}** сейчас числится в активной экспедиции. Автоматическое освобождение отменено, чтобы не потерять прогресс или награду.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            const hero = db.prepare(`
                SELECT status, recovery_until
                FROM heroes
                WHERE user_id = ?
            `).get(target.id);

            if (!hero) {
                return interaction.reply({
                    content: `ℹ️ У **${target.username}** нет RPG-героя. Освобождать нечего.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            const now = Date.now();
            const recoveryExpired = hero.status === 'wounded'
                && hero.recovery_until
                && Number.isFinite(Date.parse(hero.recovery_until))
                && Date.parse(hero.recovery_until) <= now;
            const orphanExpeditionState = hero.status === 'expedition';

            if (!orphanExpeditionState && !recoveryExpired) {
                return interaction.reply({
                    content: `ℹ️ У **${target.username}** не найдено зависшего RPG-состояния. Текущий статус: **${hero.status || 'ready'}**. Никакие данные не изменены.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            const tx = db.transaction(() => {
                db.prepare("DELETE FROM hero_expedition_cooldowns WHERE user_id=?").run(target.id);
                db.prepare(`
                    UPDATE heroes
                    SET status = 'ready',
                        recovery_until = NULL,
                        hp = CASE WHEN ? THEN max_hp ELSE hp END,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = ?
                `).run(recoveryExpired ? 1 : 0, target.id);
            });
            tx();

            return interaction.reply({
                content: `✅ У **${target.username}** очищено только подтверждённое зависшее RPG-состояние. Активных экспедиций не было; прогресс, предметы, материалы и награды сохранены.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        if (group !== 'dust') {
            return interaction.reply({content:'❌ Неизвестная группа admin-команд.',flags:MessageFlags.Ephemeral});
        }
        ensureTargetPlayer(target);

        if (subcommand === 'check') {
            const balance = getCardDust(target.id);
            return interaction.reply({
                content: `💠 Баланс **${target.username}**: **${balance.toLocaleString('ru-RU')} GS Dust**.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        const amount = interaction.options.getInteger('amount', true);

        if (subcommand === 'add') {
            const balance = addCardDust(target.id, amount);
            return interaction.reply({
                content:
                    `✅ **${target.username}** получил **${amount.toLocaleString('ru-RU')} GS Dust**.\n` +
                    `Новый баланс: **${balance.toLocaleString('ru-RU')} GS Dust**.`,
                flags: MessageFlags.Ephemeral,
            });
        }

        if (subcommand === 'remove') {
            const result = removeCardDust(target.id, amount);

            if (!result.ok) {
                return interaction.reply({
                    content:
                        `❌ У **${target.username}** недостаточно Dust.\n` +
                        `Текущий баланс: **${result.balance.toLocaleString('ru-RU')} GS Dust**.`,
                    flags: MessageFlags.Ephemeral,
                });
            }

            return interaction.reply({
                content:
                    `✅ У **${target.username}** снято **${amount.toLocaleString('ru-RU')} GS Dust**.\n` +
                    `Новый баланс: **${result.balance.toLocaleString('ru-RU')} GS Dust**.`,
                flags: MessageFlags.Ephemeral,
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
                flags: MessageFlags.Ephemeral,
            });
        }

        return interaction.reply({
            content: '❌ Неизвестная admin-команда.',
            flags: MessageFlags.Ephemeral,
        });
    },
};
