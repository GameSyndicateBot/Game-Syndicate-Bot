const path = require('path');
const { AttachmentBuilder } = require('discord.js');
const { sendLog, formatUser } = require('../utils/sendLog');

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
            const channel = await member.guild.channels.fetch(
                process.env.WELCOME_CHANNEL_ID
            );

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

                await channel.send({
                    content:
`👋 ${member}, добро пожаловать в **Game Syndicate!**

🤝 Ты стал частью нашего Синдиката.

📜 Первым делом загляни в <#1493230619218542733>
📢 Не забывай следить за <#1493231288277274865> — там публикуются все анонсы, события и игровые вечера.
🎙 Заходи в голосовые каналы и присоединяйся к другим участникам.

📱 Наш Telegram:
https://t.me/+bY_b9gO_EkJiNDhi

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
    },
};