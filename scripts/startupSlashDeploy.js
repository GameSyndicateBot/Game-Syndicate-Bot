require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_GUILD_ID = '1493225843269439488';
const guildId = (process.env.SLASH_RECOVERY_GUILD_ID || DEFAULT_GUILD_ID).trim();
const dataDir = process.env.DATA_DIR || '/app/data';
const recoveryRevision = 'v2-force-once';
const successMarker = path.join(dataDir, `.slash-deploy-${guildId}-${recoveryRevision}.success`);
const today = new Date().toISOString().slice(0, 10);
const dailyAttemptMarker = path.join(dataDir, `.slash-deploy-${guildId}-${recoveryRevision}-${today}.attempted`);

function ensureDataDir() {
    fs.mkdirSync(dataDir, { recursive: true });
}

function writeMarker(file, text) {
    fs.writeFileSync(file, `${new Date().toISOString()} ${text}\n`, 'utf8');
}

function main() {
    ensureDataDir();

    if (!/^\d{17,20}$/.test(guildId)) {
        console.error(`⚠️ Slash recovery пропущен: некорректный ID сервера "${guildId}".`);
        return;
    }

    if (fs.existsSync(successMarker)) {
        console.log(`ℹ️ Slash-команды для сервера ${guildId} уже были успешно восстановлены. Повторная регистрация не запускается.`);
        return;
    }

    if (fs.existsSync(dailyAttemptMarker)) {
        console.log(`ℹ️ Slash recovery для сервера ${guildId} сегодня уже запускался. Следующая автоматическая попытка — завтра.`);
        return;
    }

    // Маркер ставится ДО запроса, чтобы автоперезапуск контейнера не повторял
    // регистрацию много раз подряд и не расходовал лимит Discord.
    writeMarker(dailyAttemptMarker, 'attempt-started');

    console.log(`🚑 Принудительная однократная попытка восстановления slash-команд v2 на сервере ${guildId}...`);
    const result = spawnSync(process.execPath, [path.join(__dirname, '..', 'deploy-commands.js'), guildId], {
        cwd: path.join(__dirname, '..'),
        env: process.env,
        encoding: 'utf8',
        stdio: 'pipe',
    });

    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);

    if (result.status === 0) {
        writeMarker(successMarker, 'deploy-success');
        console.log(`✅ Slash recovery завершён. Команды сервера ${guildId} восстановлены; повторный deploy при стартах отключён.`);
        return;
    }

    console.error(`⚠️ Slash recovery сегодня не выполнен (код ${result.status ?? 'unknown'}). Бот всё равно будет запущен.`);
    console.error('ℹ️ Повторной попытки сегодня не будет. Скрипт автоматически попробует снова завтра, если успешного маркера ещё нет.');
}

try {
    main();
} catch (error) {
    console.error('⚠️ Ошибка startup Slash recovery:', error);
    console.error('ℹ️ Основной бот будет запущен несмотря на ошибку восстановления команд.');
}
