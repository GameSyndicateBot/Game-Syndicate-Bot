const fs = require('fs');
const path = require('path');

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

function withTimeout(promise, timeoutMs, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}: превышен таймаут ${Math.round(timeoutMs / 1000)} сек.`)), timeoutMs);
    });

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function resolveGuildId(client) {
    const guildId = process.env.GUILD_ID?.trim();
    const prodGuildId = process.env.PROD_GUILD_ID?.trim();

    console.log(`🧭 Command sync env: GUILD_ID=${guildId || 'не задан'}, PROD_GUILD_ID=${prodGuildId || 'не задан'}`);

    // GUILD_ID — основной источник на Bothost. Это исключает ситуацию,
    // когда старая дублирующая PROD_GUILD_ID перекрывает актуальный сервер.
    const configured = guildId || prodGuildId;
    if (configured && client.guilds.cache.has(configured)) return configured;

    if (configured) {
        console.warn(`⚠️ Настроенный сервер ${configured} отсутствует в кэше бота.`);
    }

    const guilds = [...client.guilds.cache.values()];
    if (guilds.length === 1) {
        console.warn(`⚠️ Использую единственный доступный сервер бота: ${guilds[0].id} (${guilds[0].name}).`);
        return guilds[0].id;
    }

    return configured || '';
}

async function syncDiscordCommands(client) {
    if (!client?.isReady?.()) {
        console.warn('⚠️ Автосинхронизация команд пропущена: Discord-клиент ещё не готов.');
        return false;
    }

    const guildId = resolveGuildId(client);
    if (!guildId) {
        console.warn('⚠️ Автосинхронизация команд пропущена: не найден GUILD_ID/PROD_GUILD_ID.');
        return false;
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) {
        console.error(`❌ Slash-команды не зарегистрированы: бот не состоит на сервере ${guildId}.`);
        console.log(`ℹ️ Доступные серверы: ${[...client.guilds.cache.values()].map(g => `${g.id} (${g.name})`).join(', ') || 'нет'}`);
        return false;
    }

    const commands = loadCommands();
    const attempts = 3;

    console.log(`🔄 Подготовлено ${commands.length} slash-команд для сервера ${guild.id} (${guild.name}).`);

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            console.log(`📡 Синхронизация slash-команд: попытка ${attempt}/${attempts}...`);

            // Регистрируем через уже авторизованный Discord-клиент. Так не нужны
            // отдельные CLIENT_ID/TOKEN для deploy и исключается неправильный route.
            const result = await withTimeout(
                guild.commands.set(commands),
                120_000,
                'Регистрация slash-команд'
            );

            console.log(`✅ Slash-команды синхронизированы: ${result.size} команд на сервере ${guild.id}.`);
            return true;
        } catch (error) {
            const status = error?.status || error?.rawError?.code || error?.code || 'unknown';
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
