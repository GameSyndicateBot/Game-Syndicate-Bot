const {
    SlashCommandBuilder,
    ChannelType,
    EmbedBuilder,
    PermissionFlagsBits,
    AttachmentBuilder,
} = require('discord.js');

const {
    db,
    getOrCreatePlayer,
    updatePlayer,
    updateStreak,
} = require('../database/db');

const { addXP } = require('../utils/levelSystem');
const { checkAchievements } = require('../utils/checkAchievements');
const { createEventCard } = require('../images/events/createEventCard');

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours} ч. ${minutes % 60} мин.`;
    return `${minutes} мин.`;
}

function canManageEvents(interaction) {
    const isOwner = interaction.user.id === process.env.BOT_OWNER_ID;
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    return isOwner || isAdmin;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('event')
        .setDescription('Управление игровыми вечерами')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Создать игровой вечер')
                .addStringOption(option =>
                    option.setName('game').setDescription('Название игры').setRequired(true)
                )
                .addChannelOption(option =>
                    option
                        .setName('voice')
                        .setDescription('Голосовой канал')
                        .addChannelTypes(ChannelType.GuildVoice)
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('minutes').setDescription('Минимум минут для зачёта').setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand.setName('start').setDescription('Запустить игровой вечер')
        )
        .addSubcommand(subcommand =>
            subcommand.setName('finish').setDescription('Завершить игровой вечер и выдать зачёт')
        )
        .addSubcommand(subcommand =>
            subcommand.setName('history').setDescription('Показать историю игровых вечеров')
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const subcommand = interaction.options.getSubcommand();

        if (['create', 'start', 'finish'].includes(subcommand) && !canManageEvents(interaction)) {
            return interaction.editReply({
                content: '❌ Управлять игровыми вечерами могут только администраторы и владелец бота.',
            });
        }

        if (subcommand === 'create') {
            const gameName = interaction.options.getString('game');
            const voiceChannel = interaction.options.getChannel('voice');
            const minMinutes = interaction.options.getInteger('minutes') ?? 30;

            const activeEvent = db.prepare(`
                SELECT *
                FROM game_events
                WHERE status IN ('created', 'started')
                ORDER BY id DESC
                LIMIT 1
            `).get();

            if (activeEvent) {
                return interaction.editReply({
                    content: `❌ Уже есть активный игровой вечер: **${activeEvent.game_name}**.`,
                });
            }

            const result = db.prepare(`
                INSERT INTO game_events (game_name, voice_channel_id, min_minutes, status, created_by)
                VALUES (?, ?, ?, 'created', ?)
            `).run(gameName, voiceChannel.id, minMinutes, interaction.user.id);

            const card = await createEventCard('created', {
                gameName,
                minMinutes,
                totalParticipants: 0,
                countedParticipants: '-',
                reward: '+300 XP',
                footer: `ID события: ${result.lastInsertRowid} • Создал ${interaction.user.username}`,
            });

            return interaction.editReply({
                files: [
                    new AttachmentBuilder(card, {
                        name: 'event-created.png',
                    }),
                ],
            });
        }

        if (subcommand === 'start') {
            const event = db.prepare(`
                SELECT *
                FROM game_events
                WHERE status = 'created'
                ORDER BY id DESC
                LIMIT 1
            `).get();

            if (!event) {
                return interaction.editReply({
                    content: '❌ Нет созданного игрового вечера для запуска.',
                });
            }

            db.prepare(`
                UPDATE game_events
                SET status = 'started', started_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(event.id);

            const voiceChannel = await interaction.guild.channels.fetch(event.voice_channel_id);

            let joinedNow = 0;

            if (voiceChannel && voiceChannel.members.size > 0) {
                for (const member of voiceChannel.members.values()) {
                    if (member.user.bot) continue;

                    joinedNow++;

                    db.prepare(`
                        INSERT OR IGNORE INTO game_event_participants
                        (event_id, user_id, username, joined_at)
                        VALUES (?, ?, ?, ?)
                    `).run(event.id, member.user.id, require('../utils/displayName').getServerDisplayName(member, member.user), Date.now());

                    db.prepare(`
                        UPDATE game_event_participants
                        SET joined_at = ?
                        WHERE event_id = ? AND user_id = ? AND joined_at IS NULL
                    `).run(Date.now(), event.id, member.user.id);
                }
            }

            const card = await createEventCard('started', {
                gameName: event.game_name,
                minMinutes: event.min_minutes,
                totalParticipants: joinedNow,
                countedParticipants: '-',
                reward: '+300 XP',
                footer: `Канал отслеживания: #${voiceChannel?.name || 'голосовой канал'}`,
            });

            return interaction.editReply({
                files: [
                    new AttachmentBuilder(card, {
                        name: 'event-started.png',
                    }),
                ],
            });
        }

        if (subcommand === 'finish') {
            const event = db.prepare(`
                SELECT *
                FROM game_events
                WHERE status = 'started'
                ORDER BY id DESC
                LIMIT 1
            `).get();

            if (!event) {
                return interaction.editReply({
                    content: '❌ Нет запущенного игрового вечера.',
                });
            }

            const now = Date.now();

            const activeParticipants = db.prepare(`
                SELECT *
                FROM game_event_participants
                WHERE event_id = ? AND joined_at IS NOT NULL
            `).all(event.id);

            for (const participant of activeParticipants) {
                const sessionSeconds = Math.floor((now - participant.joined_at) / 1000);

                db.prepare(`
                    UPDATE game_event_participants
                    SET total_seconds = total_seconds + ?, joined_at = NULL
                    WHERE event_id = ? AND user_id = ?
                `).run(sessionSeconds, event.id, participant.user_id);
            }

            const participants = db.prepare(`
                SELECT *
                FROM game_event_participants
                WHERE event_id = ?
                ORDER BY total_seconds DESC
            `).all(event.id);

            const minSeconds = event.min_minutes * 60;
            const counted = participants.filter(p => p.total_seconds >= minSeconds);
            const notCounted = participants.filter(p => p.total_seconds < minSeconds);

            for (const participant of counted) {
                const member = await interaction.guild.members.fetch(participant.user_id).catch(() => null);
                if (!member) continue;

                let player = getOrCreatePlayer(member.user);

                player.events_count = (player.events_count ?? 0) + 1;
                updateStreak(participant.user_id, 'event');

                player = addXP(player, 300);

                const result = await checkAchievements({
                    message: {
                        author: member.user,
                        guild: interaction.guild,
                    },
                    player,
                    member,
                });

                updatePlayer(result.player);

                db.prepare(`
                    UPDATE game_event_participants
                    SET counted = 1
                    WHERE event_id = ? AND user_id = ?
                `).run(event.id, participant.user_id);
            }

            db.prepare(`
                UPDATE game_events
                SET status = 'finished', finished_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `).run(event.id);

            const leader = participants[0];

            const card = await createEventCard('finished', {
                gameName: event.game_name,
                minMinutes: event.min_minutes,
                totalParticipants: participants.length,
                countedParticipants: counted.length,
                notCounted: notCounted.length,
                reward: '+300 XP',
                leader: leader
                    ? `${leader.username} • ${formatTime(leader.total_seconds)}`
                    : '—',
                footer: 'Прогресс игровых достижений обновлён',
            });

            return interaction.editReply({
                files: [
                    new AttachmentBuilder(card, {
                        name: 'event-finished.png',
                    }),
                ],
            });
        }

        if (subcommand === 'history') {
            const events = db.prepare(`
                SELECT
                    e.*,
                    COUNT(p.user_id) AS total_participants,
                    SUM(CASE WHEN p.counted = 1 THEN 1 ELSE 0 END) AS counted_participants
                FROM game_events e
                LEFT JOIN game_event_participants p ON p.event_id = e.id
                WHERE e.status = 'finished'
                GROUP BY e.id
                ORDER BY e.id DESC
                LIMIT 10
            `).all();

            if (!events.length) {
                return interaction.editReply({
                    content: '📭 История игровых вечеров пока пустая.',
                });
            }

            const embed = new EmbedBuilder()
                .setColor(0x8B5CF6)
                .setTitle('📜 История игровых вечеров')
                .setDescription(
                    events.map(event => {
                        return `🎮 **${event.game_name}**\n` +
                            `✅ Зачёт: **${event.counted_participants ?? 0}** / 👥 Всего: **${event.total_participants ?? 0}**\n` +
                            `📅 Завершён: ${event.finished_at ?? '—'}`;
                    }).join('\n\n')
                )
                .setFooter({ text: 'Game Syndicate • Event History' })
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }
    },
};