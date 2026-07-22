# GS Build 47 — repair of member collection achievements

- Migrates legacy IDs `cards_full_common` and `cards_full_rare` to the current achievement IDs.
- Prevents old hidden IDs from increasing the profile counter while being absent from `/achievements`.
- Reconciles `players.achievements` with the real unlocked-achievement table.
- Normalizes card rarity values, including compatibility with the historical `mithic` spelling.
- Rechecks every server member's existing card collection on startup and grants missing Common, Rare, Epic, Legendary, Mythic, Exclusive, Holographic and Boss Pack achievements.
- The repair applies to all members, including IDs `561961056197672991` and `830515570377097259`.
