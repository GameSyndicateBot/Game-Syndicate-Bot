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

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
    const route = Routes.applicationGuildCommands(clientId, guildId);
    const attempts = 3;

    console.log(`🔄 Подготовлено ${commands.length} slash-команд для сервера ${guildId}.`);

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            // На Bothost Discord API иногда отвечает заметно дольше 30 секунд.
            // Используем один атомарный PUT, большой сетевой таймаут и повторы.
            const rest = new REST({ version: '10', timeout: 120_000 }).setToken(token);
            console.log(`📡 Синхронизация slash-команд: попытка ${attempt}/${attempts}...`);

            const result = await rest.put(route, { body: commands });
            const count = Array.isArray(result) ? result.length : commands.length;
            console.log(`✅ Slash-команды синхронизированы: ${count} команд на сервере ${guildId}.`);
            return true;
        } catch (error) {
            const status = error?.status || error?.rawError?.code || 'unknown';
            const message = error?.rawError?.message || error?.message || String(error);
            console.error(`⚠️ Попытка ${attempt}/${attempts} не удалась [${status}]: ${message}`);

            if (attempt < attempts) {
                const delay = attempt * 15_000;
                console.log(`⏳ Повтор через ${delay / 1000} сек...`);
                await sleep(delay);
            }
        }
    }

    console.error('❌ Slash-команды не синхронизированы после 3 попыток. Сам бот продолжает работать.');
    return false;
}

module.exports = { syncDiscordCommands };
