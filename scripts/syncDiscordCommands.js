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
        if (!command?.data || typeof command.data.toJSON !== 'function') continue;

        const json = command.data.toJSON();
        if (names.has(json.name)) {
            throw new Error(`Дубликат slash-команды /${json.name} (${file})`);
        }
        names.add(json.name);
        commands.push(json);
    }

    return commands;
}

function withTimeout(promise, ms, label) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${label}: превышен таймаут ${ms / 1000} сек.`)), ms);
        }),
    ]).finally(() => clearTimeout(timer));
}

async function syncDiscordCommands() {
    const token = process.env.TOKEN?.trim();
    const clientId = process.env.CLIENT_ID?.trim();
    const guildId = process.env.PROD_GUILD_ID?.trim() || process.env.GUILD_ID?.trim();

    if (!token || !clientId || !guildId) {
        console.warn('⚠️ Автосинхронизация команд пропущена: нужны TOKEN, CLIENT_ID и PROD_GUILD_ID/GUILD_ID.');
        return false;
    }

    const commands = loadCommands();
    const rest = new REST({ version: '10', timeout: 20_000 }).setToken(token);

    console.log(`🔄 Фоновая синхронизация ${commands.length} slash-команд...`);

    // Один PUT атомарно заменяет серверный набор команд. Предварительное удаление
    // не требуется и раньше могло оставить сервер вообще без команд при зависании.
    await withTimeout(
        rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands }),
        30_000,
        'Регистрация slash-команд',
    );

    console.log(`✅ Slash-команды синхронизированы на сервере ${guildId}.`);
    return true;
}

module.exports = { syncDiscordCommands };
