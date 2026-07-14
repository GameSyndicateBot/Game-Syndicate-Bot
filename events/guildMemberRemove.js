const { sendLog } = require('../utils/sendLog');

module.exports = {
    name: 'guildMemberRemove',

    async execute(member) {
        await sendLog(member.guild, {
            title: '🚪 Участник вышел',
            color: 0xEF4444,
            thumbnail: member.user.displayAvatarURL(),
            fields: [
                {
                    name: '👤 Пользователь',
                    value: `${member.user}\n\`${member.user.tag}\``,
                    inline: true,
                },
                {
                    name: '🆔 ID',
                    value: member.user.id,
                    inline: true,
                },
            ],
        });
    },
};