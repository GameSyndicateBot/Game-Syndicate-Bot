# Patch 49 — Targeted collection achievement grants

Confirmed missing collection achievements are now granted during the normal startup achievement backfill.

- 561961056197672991: cards_epic_complete, cards_legendary_complete
- 830515570377097259: cards_common_complete, cards_rare_complete

The regular achievement unlock flow is used, so XP, achievement points, GS Dust, counters and roles are processed normally. INSERT OR IGNORE protection prevents duplicate rewards.
