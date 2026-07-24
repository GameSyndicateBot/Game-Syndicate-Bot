# GS CORE V16.5.5 — Expedition Alchemy Migration Fix

- Added missing `hero_active_buffs` table migration.
- Added missing `hero_consumable_history` table migration.
- Added defensive table initialization inside `alchemyService`.
- Fixed expedition start failure: `SqliteError: no such table: hero_active_buffs`.
- Existing player data is preserved; migrations are additive (`CREATE TABLE IF NOT EXISTS`).
