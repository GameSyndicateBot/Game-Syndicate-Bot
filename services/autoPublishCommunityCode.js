const fs = require('fs');
const path = require('path');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');

const CONFIG_PATH = path.join(__dirname, '..', 'data', 'communityCode.json');
const FLAG_PATH = path.join(__dirname, '..', 'data', '.community_code_published');
const ASSET_DIR = path.join(__dirname, '..', 'assets', 'rules');

function readConfig() {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

function getRequiredBanners(config) {
    return [
        ...(config.sections || []).map(section => section.banner).filter(Boolean),
        config.finalBanner,
    ].filter(Boolean);
}

async function autoPublishCommunityCode(client) {
    if (fs.existsSync(FLAG_PATH)) {
        console.log('ℹ️ Кодекс уже опубликован — повторная отправка пропущена.');
        return;
    }

    if (!fs.existsSync(CONFIG_PATH)) {
        console.error('❌ Кодекс: не найден data/communityCode.json');
        return;
    }

    const config = readConfig();
    const channelId = String(config.channelId || '').trim();
    if (!channelId) {
        console.error('❌ Кодекс: в конфигурации не указан channelId.');
        return;
    }

    // Не начинаем публикацию, пока не добавлены все баннеры.
    // Так Кодекс не появится в канале наполовину и флаг не будет создан раньше времени.
    const missingBanners = getRequiredBanners(config).filter(filename => {
        const fullPath = path.join(ASSET_DIR, filename);
        return !fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile();
    });

    if (missingBanners.length > 0) {
        console.error(`❌ Кодекс не опубликован. Отсутствуют баннеры: ${missingBanners.join(', ')}`);
        return;
    }

    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.() || typeof channel.send !== 'function') {
        console.error(`❌ Кодекс: текстовый канал ${channelId} не найден или недоступен.`);
        return;
    }

    for (const section of config.sections || []) {
        const bannerPath = path.join(ASSET_DIR, section.banner);
        await channel.send({
            files: [new AttachmentBuilder(bannerPath, { name: section.banner })],
        });

        const embed = new EmbedBuilder()
            .setColor(config.color || 0x8B5CF6)
            .setTitle(section.title)
            .setDescription(section.description);

        await channel.send({ embeds: [embed] });
    }

    // Финальный баннер завершает всю публикацию и не получает отдельный Embed.
    const finalBannerPath = path.join(ASSET_DIR, config.finalBanner);
    await channel.send({
        files: [new AttachmentBuilder(finalBannerPath, { name: config.finalBanner })],
    });

    fs.writeFileSync(FLAG_PATH, new Date().toISOString(), 'utf8');
    console.log(`✅ Кодекс Game Syndicate опубликован в канале ${channelId}.`);
}

module.exports = { autoPublishCommunityCode };
