
function applyEffects(entity) {
    if (!entity.effects) return [];

    const logs = [];

    entity.effects = entity.effects.filter(e => {
        if (e.type === "burn") {
            entity.hp -= e.value;
            logs.push(`🔥 ${entity.name || entity.userId} горит на ${e.value}`);
        }

        if (e.type === "poison") {
            entity.hp -= e.value;
            logs.push(`☠️ яд наносит ${e.value}`);
        }

        e.duration--;
        return e.duration > 0;
    });

    return logs;
}

module.exports = { applyEffects };
