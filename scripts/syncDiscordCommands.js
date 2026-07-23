const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

function loadCommands() {
    const commandsPath = path.join(__dirname, '..', 'commands');
    const files = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    const commands = [];
    const names = new Set();

    for (const file of files) {
        const command = require(path.join(commandsPath, file));
        if (!command?.data || typeof command.data.toJSON !== 'function' || typeof command.execute !== 'function') continue;

        const json = command.data.toJSON();
        if (names.has(json.name)) throw new Error(`Дубликат slash-команды /${json.name} (${file})`);
        names.add(json.name);
        commands.push(json);
    }

    return commands;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function resolveGuildId(client) {
    const guildId = process.env.GUILD_ID?.trim();
    const prodGuildId = process.env.PROD_GUILD_ID?.trim();
    console.log(`🧭 Command sync env: GUILD_ID=${guildId || 'не задан'}, PROD_GUILD_ID=${prodGuildId || 'не задан'}`);

    const configured = guildId || prodGuildId;
    if (configured && client.guilds.cache.has(configured)) return configured;

    const guilds = [...client.guilds.cache.values()];
    if (guilds.length === 1) return guilds[0].id;
    return configured || '';
}

async function fetchRegistered(rest, applicationId, guildId) {
    const rows = await rest.get(Routes.applicationGuildCommands(applicationId, guildId));
    return Array.isArray(rows) ? rows : [];
}

async function syncDiscordCommands(client) {
    if (!client?.isReady?.()) return false;

    const guildId = resolveGuildId(client);
    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
        console.error(`❌ Бот не состоит на сервере ${guildId}.`);
        return false;
    }

    const commands = loadCommands();
    const expectedNames = commands.map(c => c.name).sort();
    const applicationId = client.application?.id || client.user?.id;
    const token = process.env.TOKEN?.trim();
    if (!applicationId || !token) throw new Error('Не найден TOKEN или application ID бота.');

    const rest = new REST({ version: '10', timeout: 180_000 }).setToken(token);
    console.log(`🔄 Подготовлено ${commands.length} slash-команд для сервера ${guild.id} (${guild.name}).`);
    console.log(`🧾 Локальные команды: ${expectedNames.map(n => `/${n}`).join(', ')}`);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
            console.log(`📡 Прямая публикация Discord REST: попытка ${attempt}/3...`);
            await rest.put(Routes.applicationGuildCommands(applicationId, guild.id), { body: commands });

            const registered = await fetchRegistered(rest, applicationId, guild.id);
            const actualNames = registered.map(c => c.name).sort();
            const missing = expectedNames.filter(name => !actualNames.includes(name));
            const extra = actualNames.filter(name => !expectedNames.includes(name));

            console.log(`🔎 Discord API вернул ${registered.length} серверных команд.`);
            console.log(`🧾 Зарегистрированы: ${actualNames.map(n => `/${n}`).join(', ')}`);

            if (missing.length || extra.length || registered.length !== commands.length) {
                throw new Error(`Проверка не пройдена. Не хватает: ${missing.join(', ') || 'нет'}; лишние: ${extra.join(', ') || 'нет'}`);
            }

            console.log(`✅ Slash-команды опубликованы и проверены через Discord API: ${registered.length} команд на сервере ${guild.id}.`);
            return true;
        } catch (error) {
            const status = error?.status || error?.rawError?.code || error?.code || 'unknown';
            const message = error?.rawError?.message || error?.message || String(error);
            console.error(`⚠️ Попытка ${attempt}/3 не удалась [${status}]: ${message}`);
            if (attempt < 3) {
                const delay = attempt * 15_000;
                console.log(`⏳ Повтор через ${delay / 1000} сек...`);
                await sleep(delay);
            }
        }
    }

    console.error('❌ Slash-команды не опубликованы после 3 попыток. Бот продолжает работать.');
    return false;
}

module.exports = { syncDiscordCommands };
