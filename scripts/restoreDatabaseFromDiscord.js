const fs = require('fs');
const path = require('path');

const API_BASE = 'https://discord.com/api/v10';
const MIN_DATABASE_SIZE = 4096;
const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'binary');

function getDatabasePath() {
    return path.resolve(
        process.env.DATABASE_PATH || '/app/shared/database.sqlite'
    );
}

function getBotToken() {
    return String(
        process.env.TOKEN ||
        process.env.DISCORD_TOKEN ||
        process.env.BOT_TOKEN ||
        ''
    ).trim();
}

function isValidSqliteFile(filePath) {
    try {
        const stats = fs.statSync(filePath);
        if (!stats.isFile() || stats.size < MIN_DATABASE_SIZE) return false;

        const fd = fs.openSync(filePath, 'r');
        const header = Buffer.alloc(SQLITE_HEADER.length);
        fs.readSync(fd, header, 0, header.length, 0);
        fs.closeSync(fd);

        return header.equals(SQLITE_HEADER);
    } catch {
        return false;
    }
}

async function fetchMessages(channelId, token) {
    const response = await fetch(
        `${API_BASE}/channels/${channelId}/messages?limit=100`,
        {
            headers: {
                Authorization: `Bot ${token}`,
                'User-Agent': 'GameSyndicateBot/2.3.1',
            }
        }
    );

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(
            `Discord API ${response.status}: ${body.slice(0, 300)}`
        );
    }

    return response.json();
}

function findNewestDatabaseAttachment(messages) {
    for (const message of messages) {
        const attachments = Array.isArray(message.attachments)
            ? message.attachments
            : [];

        for (const attachment of attachments) {
            const name = String(attachment.filename || '').toLowerCase();
            if (!name.endsWith('.sqlite') && !name.endsWith('.db')) continue;

            return {
                url: attachment.url,
                filename: attachment.filename,
                size: Number(attachment.size || 0),
                messageId: message.id,
                timestamp: message.timestamp,
            };
        }
    }

    return null;
}

async function downloadDatabase(attachment, destination) {
    const response = await fetch(attachment.url);
    if (!response.ok) {
        throw new Error(`Не удалось скачать бэкап: HTTP ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length < MIN_DATABASE_SIZE) {
        throw new Error(`Скачанный бэкап слишком маленький: ${buffer.length} bytes`);
    }

    if (!buffer.subarray(0, SQLITE_HEADER.length).equals(SQLITE_HEADER)) {
        throw new Error('Скачанный файл не является SQLite-базой.');
    }

    fs.mkdirSync(path.dirname(destination), { recursive: true });

    const temporaryPath = `${destination}.restore-${process.pid}.tmp`;
    fs.writeFileSync(temporaryPath, buffer, { mode: 0o666 });
    fs.renameSync(temporaryPath, destination);

    return buffer.length;
}

async function main() {
    const databasePath = getDatabasePath();

    if (isValidSqliteFile(databasePath)) {
        const size = fs.statSync(databasePath).size;
        console.log(`✅ Постоянная база уже существует: ${databasePath} (${size} bytes)`);
        return;
    }

    const token = getBotToken();
    const channelId = String(process.env.BACKUP_CHANNEL_ID || '').trim();

    if (!token || !channelId) {
        console.warn(
            '⚠️ Восстановление из Discord пропущено: нет TOKEN или BACKUP_CHANNEL_ID.'
        );
        return;
    }

    const databaseExists = fs.existsSync(databasePath);
    if (databaseExists) {
        const stat = fs.statSync(databasePath);
        const quarantinePath = `${databasePath}.invalid-${Date.now()}`;
        fs.renameSync(databasePath, quarantinePath);
        console.warn(
            `⚠️ Постоянная база найдена, но не прошла SQLite-проверку ` +
            `(${stat.size} bytes). Файл сохранён: ${quarantinePath}`
        );
    } else {
        console.log(`ℹ️ Файл постоянной базы не найден: ${databasePath}`);
    }

    console.log('🔎 Ищу последний Discord-бэкап для аварийного восстановления...');

    try {
        const messages = await fetchMessages(channelId, token);
        const attachment = findNewestDatabaseAttachment(messages);

        if (!attachment) {
            console.warn('⚠️ В канале бэкапов не найдено ни одного файла SQLite.');
            return;
        }

        const size = await downloadDatabase(attachment, databasePath);
        console.log(
            `✅ База восстановлена из Discord: ${attachment.filename} ` +
            `(${size} bytes, message ${attachment.messageId})`
        );
    } catch (error) {
        console.error('❌ Не удалось восстановить базу из Discord:', error.message);
        // Не завершаем контейнер: db.js сможет использовать bundled-базу как аварийный fallback.
    }
}

main().catch(error => {
    console.error('❌ Ошибка prestart-восстановления:', error);
    process.exitCode = 0;
});
