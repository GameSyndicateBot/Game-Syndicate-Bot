const JOIN_DATE_OVERRIDES = new Map([
    ['468683569359880192', Date.parse('2026-05-29T23:34:00+03:00')],
    ['317166633619816450', Date.parse('2026-04-14T18:51:00+03:00')],
]);

function getEffectiveJoinedTimestamp(memberOrUserId) {
    const userId = typeof memberOrUserId === 'string'
        ? memberOrUserId
        : memberOrUserId?.id || memberOrUserId?.user?.id;

    const override = userId ? JOIN_DATE_OVERRIDES.get(String(userId)) : null;
    if (Number.isFinite(override)) return override;

    const joinedTimestamp = Number(memberOrUserId?.joinedTimestamp || 0);
    return Number.isFinite(joinedTimestamp) && joinedTimestamp > 0
        ? joinedTimestamp
        : 0;
}

function getEffectiveJoinedAt(memberOrUserId) {
    const timestamp = getEffectiveJoinedTimestamp(memberOrUserId);
    return timestamp > 0 ? new Date(timestamp) : null;
}

function hasJoinDateOverride(userId) {
    return JOIN_DATE_OVERRIDES.has(String(userId));
}

function getJoinDateOverrideEntries() {
    return [...JOIN_DATE_OVERRIDES.entries()];
}

module.exports = {
    getEffectiveJoinedTimestamp,
    getEffectiveJoinedAt,
    hasJoinDateOverride,
    getJoinDateOverrideEntries,
};
