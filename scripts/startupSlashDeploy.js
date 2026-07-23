require('dotenv').config();

const fs = require('fs');
const path = require('path');

const DEFAULT_GUILD_ID = '1493225843269439488';
const guildId = (process.env.SLASH_RECOVERY_GUILD_ID || DEFAULT_GUILD_ID).trim();
const dataDir = process.env.DATA_DIR || '/app/data';
const recoveryRevision = 'v3-direct-api';
const successMarker = path.join(dataDir, `.slash-deploy-${guildId}-${recoveryRevision}.success`);
const today = new Date().toISOString().slice(0, 10);
const dailyAttemptMarker = path.join(dataDir, `.slash-deploy-${guildId}-${recoveryRevision}-${today}.attempted`);

function ensureDataDir() {
    fs.mkdirSync(dataDir, { recursive: true });
}

function writeMarker(file, text) {
    fs.writeFileSync(file, `${new Date().toISOString()} ${text}\n`, 'utf8');
}

function requireEnv(name) {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`Не задана переменная окружения ${name}`);
    return value;
}

function loadCommands() {
    const commands = [];
    const names = new Map();
    const commandsPath = path.join(__dirname, '..', 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        if (!command?.data || typeof command.data.toJSON !== 'function') {
            console.log(`⚠️ Slash recovery: ${file} пропущен — нет корректного data.`);
            continue;
        }

        const json = command.data.toJSON();
        if (names.has(json.name)) {
            throw new Error(`Дубликат slash-команды /${json.name}: ${names.get(json.name)} и ${file}`);
        }
        names.set(json.name, file);
        commands.push(json);
    }

    return commands;
}

async function deployDirectly() {
    const token = requireEnv('TOKEN');
    const clientId = requireEnv('CLIENT_ID');
    const commands = loadCommands();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    console.log(`🚑 Slash recovery v3: отправляю ${commands.length} команд напрямую в Discord API для сервера ${guildId}...`);

    try {
        const response = await fetch(
            `https://discord.com/api/v10/applications/${clientId}/guilds/${guildId}/commands`,
            {
                method: 'PUT',
                headers: {
                    Authorization: `Bot ${token}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'DiscordBot (Game Syndicate Slash Recovery, 3.0)',
                },
                body: JSON.stringify(commands),
                signal: controller.signal,
            },
        );

        const raw = await response.text();
        let payload;
        try { payload = raw ? JSON.parse(raw) : null; } catch { payload = raw; }

        if (!response.ok) {
            const error = new Error(
                typeof payload === 'object' && payload?.message
                    ? `Discord API ${response.status}: ${payload.message}`
                    : `Discord API ${response.status}: ${raw || 'пустой ответ'}`,
            );
            error.status = response.status;
            error.payload = payload;
            throw error;
        }

        const count = Array.isArray(payload) ? payload.length : commands.length;
        return count;
    } finally {
        clearTimeout(timeout);
    }
}

async function main() {
    ensureDataDir();

    if (!/^\d{17,20}$/.test(guildId)) {
        console.error(`⚠️ Slash recovery пропущен: некорректный ID сервера "${guildId}".`);
        return;
    }

    if (fs.existsSync(successMarker)) {
        console.log(`ℹ️ Slash recovery v3: команды для сервера ${guildId} уже успешно восстановлены.`);
        return;
    }

    if (fs.existsSync(dailyAttemptMarker)) {
        console.log(`ℹ️ Slash recovery v3 для сервера ${guildId} сегодня уже выполнялся. Следующая попытка — завтра.`);
        return;
    }

    writeMarker(dailyAttemptMarker, 'attempt-started');

    try {
        const count = await deployDirectly();
        writeMarker(successMarker, `deploy-success commands=${count}`);
        console.log(`✅ Slash recovery v3 завершён: на сервере ${guildId} зарегистрировано ${count} команд.`);
    } catch (error) {
        const payload = error?.payload;
        console.error(`❌ Slash recovery v3 не выполнен: ${error?.message || error}`);

        if (payload?.code === 30034) {
            console.error('⏳ Discord сообщает: достигнут дневной лимит создания application-команд (code 30034).');
        }
        if (payload?.retry_after != null) {
            console.error(`⏱️ retry_after от Discord: ${payload.retry_after} сек.`);
        }
        if (error?.name === 'AbortError') {
            console.error('⏱️ Discord API не ответил за 45 секунд; запуск основного бота продолжается.');
        }

        console.error('ℹ️ Основной бот будет запущен. Повторной попытки сегодня не будет.');
    }
}

main().catch(error => {
    console.error('⚠️ Неожиданная ошибка Slash recovery v3:', error);
    console.error('ℹ️ Основной бот будет запущен несмотря на ошибку восстановления команд.');
});
