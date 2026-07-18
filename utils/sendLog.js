const { EmbedBuilder } = require('discord.js');
const { getGuildSetting } = require('./guildSettings');

function cutText(value, max = 900) {
    const text = String(value ?? '').trim();
    if (!text) return '—';
    return text.length > max ? `${text.slice(0, Math.max(0, max - 1))}…` : text;
}

function safeCode(value, max = 900) {
    return cutText(value, max).replace(/```/g, 'ˋˋˋ');
}

function formatUser(user) {
    if (!user) return 'Неизвестно';
    return `${user}  \`${user.id}\``;
}

function formatDuration(totalSeconds) {
    const seconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h) return `${h} ч ${m} мин`;
    if (m) return `${m} мин ${s} сек`;
    return `${s} сек`;
}

function compactFields(fields = []) {
    return fields
        .filter(field => field && field.name && field.value !== undefined)
        .map(field => ({
            name: cutText(field.name, 256),
            value: cutText(field.value, 1024),
            inline: Boolean(field.inline),
        }))
        .slice(0, 25);
}

async function sendLog(guild, options, legacyDescription, legacyColor) {
    try {
        // Backward compatibility with old sendLog(guild, title, description, color).
        if (typeof options === 'string') {
            options = {
                title: options,
                description: legacyDescription,
                color: legacyColor,
            };
        }

        if (!guild) return null;
        const channelId = getGuildSetting(guild.id, 'logs_channel_id', process.env.LOG_CHANNEL_ID);
        if (!channelId) return null;
        const channel = await guild.channels.fetch(channelId).catch(() => null);
        if (!channel?.isTextBased?.() || typeof channel.send !== 'function') return null;

        const embed = new EmbedBuilder()
            .setColor(options.color ?? 0x8B5CF6)
            .setAuthor({ name: options.section ?? 'Game Syndicate • Логи' })
            .setTitle(cutText(options.title || 'Событие', 256))
            .setTimestamp()
            .setFooter({ text: options.footer ?? `Сервер: ${guild.name}` });

        if (options.description) embed.setDescription(cutText(options.description, 4096));
        const fields = compactFields(options.fields);
        if (fields.length) embed.addFields(fields);
        if (options.thumbnail && options.showThumbnail !== false) embed.setThumbnail(options.thumbnail);
        if (options.image) embed.setImage(options.image);
        if (options.url) embed.setURL(options.url);

        return channel.send({ embeds: [embed], files: options.files ?? [] });
    } catch (error) {
        console.error('Ошибка отправки лога:', error);
        return null;
    }
}

module.exports = { sendLog, cutText, safeCode, formatUser, formatDuration };
