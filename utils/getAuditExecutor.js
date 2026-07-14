async function getAuditExecutor(guild, actionType, targetId) {
    try {
        const logs = await guild.fetchAuditLogs({
            type: actionType,
            limit: 5,
        });

        const entry = logs.entries.find(entry =>
            entry.target?.id === targetId &&
            Date.now() - entry.createdTimestamp < 10000
        );

        return entry || null;
    } catch (error) {
        console.error('Ошибка чтения Audit Logs:', error);
        return null;
    }
}

module.exports = {
    getAuditExecutor,
};