const { db } = require('../database/db');

/**
 * Repairs only inconsistent RPG states that are safe to recover automatically.
 * It never cancels the newest real active expedition, so pending expedition
 * rewards are preserved.
 */
function repairRpgStates() {
  const stats = {
    duplicateExpeditionsCancelled: 0,
    orphanHeroesReleased: 0,
    expiredRecoveriesReleased: 0,
    returnedExpeditionHeroesReleased: 0,
  };

  const tx = db.transaction(() => {
    // A hero may have only one active expedition. Keep the newest row and
    // cancel older duplicates left behind by double clicks or interrupted flows.
    const duplicates = db.prepare(`
      SELECT user_id
      FROM hero_expeditions
      WHERE status = 'active'
      GROUP BY user_id
      HAVING COUNT(*) > 1
    `).all();

    const getActive = db.prepare(`
      SELECT id
      FROM hero_expeditions
      WHERE user_id = ? AND status = 'active'
      ORDER BY id DESC
    `);
    const cancelDuplicate = db.prepare(`
      UPDATE hero_expeditions
      SET status = 'cancelled',
          resolved_at = CURRENT_TIMESTAMP,
          result_json = ?
      WHERE id = ?
    `);

    for (const { user_id: userId } of duplicates) {
      const rows = getActive.all(userId);
      for (const row of rows.slice(1)) {
        cancelDuplicate.run(JSON.stringify({
          outcome: 'cancelled',
          reason: 'automatic_duplicate_session_recovery',
          rewards: false,
          returnedSafely: true,
        }), row.id);
        stats.duplicateExpeditionsCancelled++;
      }
    }

    // As soon as the expedition timer expires, the hero is physically back
    // and may participate in World Boss. Keep the expedition row active until
    // the player claims the result, so no rewards can be lost or duplicated.
    const returnedResult = db.prepare(`
      UPDATE heroes
      SET status = 'ready',
          recovery_until = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE status = 'expedition'
        AND EXISTS (
          SELECT 1
          FROM hero_expeditions e
          WHERE e.user_id = heroes.user_id
            AND e.status = 'active'
            AND datetime(e.returns_at) <= datetime('now')
        )
    `).run();
    stats.returnedExpeditionHeroesReleased = returnedResult.changes;

    // Release heroes marked as being in an expedition when no active
    // expedition row exists. This is the common "stuck menu" state.
    const orphanResult = db.prepare(`
      UPDATE heroes
      SET status = 'ready',
          recovery_until = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE status = 'expedition'
        AND NOT EXISTS (
          SELECT 1
          FROM hero_expeditions e
          WHERE e.user_id = heroes.user_id
            AND e.status = 'active'
        )
    `).run();
    stats.orphanHeroesReleased = orphanResult.changes;

    // A finished wound timer must never leave the hero blocked indefinitely.
    const recoveryResult = db.prepare(`
      UPDATE heroes
      SET status = 'ready',
          recovery_until = NULL,
          hp = max_hp,
          updated_at = CURRENT_TIMESTAMP
      WHERE status = 'wounded'
        AND recovery_until IS NOT NULL
        AND datetime(recovery_until) <= datetime('now')
    `).run();
    stats.expiredRecoveriesReleased = recoveryResult.changes;
  });

  tx();
  return stats;
}

module.exports = { repairRpgStates };
