# GS CORE V19.6.4 — Caravan / Quick Event / Probability Audit

- Caravan arrival notice is posted to channel `1530165282512044032` and deleted when the 30-minute visit ends.
- One-time Caravan visit starts on first launch of this patch. Daily scheduling continues after it, beginning 31.07.2026.
- Quick Event skipped by World Boss retries after 5 minutes instead of drawing a new full interval.
- Scheduler watchdog repairs delayed hosting timers.
- Royal Button victories now count toward competitive Quick Event streaks.
- Dungeon success uses an auditable crypto roll stored in `result_json`.
- Expedition chance and roll were audited; both were already saved in history. Diagnostic logging was added.
