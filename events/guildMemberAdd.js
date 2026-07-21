const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const { sendLog } = require('../utils/sendLog');
const { getGuildSetting } = require('../utils/guildSettings');
const { optionalDiscordId, optionalUrl } = require('../utils/env');

module.exports = {
    name: 'guildMemberAdd',

    async execute(member) {
        console.log(`✅ Новый участник: ${member.user.tag}`);

        try {
            const role = member.guild.roles.cache.get(process.env.AGENT_ROLE_ID);

            if (role) {
                await member.roles.add(role);
                console.log(`✅ Роль Агент выдана: ${member.user.tag}`);
            }
        } catch (error) {
            console.error('Ошибка выдачи роли Агент:', error);
        }

        try {
            const welcomeChannelId = getGuildSetting(
                member.guild.id,
                'welcome_channel_id',
                optionalDiscordId('WELCOME_CHANNEL_ID')
            );

            if (!welcomeChannelId) {
                console.warn(`⚠️ Канал приветствия не настроен для сервера ${member.guild.id}.`);
            }

            const channel = welcomeChannelId
                ? await member.guild.channels.fetch(welcomeChannelId)
                : null;

            if (channel && typeof channel.send === 'function') {
                const welcomeImagePath = path.join(
                    __dirname,
                    '..',
                    'images',
                    'welcome',
                    '456.png'
                );

                const attachment = new AttachmentBuilder(welcomeImagePath, {
                    name: 'welcome.png',
                });

                const rulesChannelId = optionalDiscordId('RULES_CHANNEL_ID', '1493230619218542733');
                const announcementsChannelId = optionalDiscordId('ANNOUNCEMENTS_CHANNEL_ID', '1493231288277274865');
                const telegramInviteUrl = optionalUrl('TELEGRAM_INVITE_URL', 'https://t.me/+bY_b9gO_EkJiNDhi');

                const rulesLine = rulesChannelId
                    ? `📜 Первым делом загляни в <#${rulesChannelId}>`
                    : '📜 Первым делом ознакомься с правилами сервера.';
                const announcementsLine = announcementsChannelId
                    ? `📢 Не забывай следить за <#${announcementsChannelId}> — там публикуются все анонсы, события и игровые вечера.`
                    : '📢 Следи за каналом анонсов, чтобы не пропускать события и игровые вечера.';
                const telegramBlock = telegramInviteUrl
                    ? `\n\n📱 Наш Telegram:\n${telegramInviteUrl}`
                    : '';

                await channel.send({
                    content:
`👋 ${member}, добро пожаловать в **Game Syndicate!**

🤝 Ты стал частью нашего Синдиката.

${rulesLine}
${announcementsLine}
🎙 Заходи в голосовые каналы и присоединяйся к другим участникам.${telegramBlock}

🎮 Хорошей игры и добро пожаловать в семью Game Syndicate! 💜`,
                    files: [attachment],
                });
            }

            await sendLog(
                member.guild,
                '👋 Новый участник',
                `**Пользователь:** ${member.user}\n**Тег:** ${member.user.tag}`,
                0x22C55E
            );
        } catch (error) {
            console.error('Ошибка приветствия:', error);
        }
    }
};