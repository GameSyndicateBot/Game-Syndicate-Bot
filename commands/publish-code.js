const fs = require('fs');
const path = require('path');
const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    AttachmentBuilder,
    MessageFlags,
} = require('discord.js');

const code = require('../data/communityCode.json');
const ASSET_DIR = path.join(__dirname, '..', 'assets', 'rules');

function safeAsset(filename) {
    if (!filename) return null;
    const fullPath = path.join(ASSET_DIR, filename);
    return fs.existsSync(fullPath) && fs.statSync(fullPath).isFile() ? fullPath : null;
}

async function sendBanner(channel, filename) {
    const fullPath = safeAsset(filename);
    if (!fullPath) return false;
    await channel.send({ files: [new AttachmentBuilder(fullPath, { name: filename })] });
    return true;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('publish-code')
        .setDescription('Опубликовать Кодекс сообщества Game Syndicate')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({ content: '❌ Команда доступна только администраторам.', flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const channel = await interaction.client.channels.fetch(code.channelId).catch(() => null);
        if (!channel?.isTextBased() || typeof channel.send !== 'function') {
            return interaction.editReply(`❌ Не найден текстовый канал <#${code.channelId}>.`);
        }

        let sentBanners = 0;
        for (const section of code.sections) {
            if (await sendBanner(channel, section.banner)) sentBanners += 1;

            const embed = new EmbedBuilder()
                .setColor(code.color || 0x8B5CF6)
                .setTitle(section.title)
                .setDescription(section.description);

            await channel.send({ embeds: [embed] });
        }

        if (await sendBanner(channel, code.finalBanner)) sentBanners += 1;

        const expectedBanners = code.sections.length + 1;
        const warning = sentBanners === expectedBanners
            ? ''
            : `\n⚠️ Найдено баннеров: ${sentBanners}/${expectedBanners}. Отсутствующие изображения пропущены.`;

        return interaction.editReply(`✅ Кодекс опубликован в <#${code.channelId}>.${warning}`);
    },
};
