# GS World Boss V6 — Balance & AI

## Boss AI
- Unified weighted action selector.
- Guaranteed first summon by round 2 when possible.
- Guaranteed first curse by round 3.
- Three boss phases based on remaining HP.
- Later phases increase AoE and curse frequency.
- Console diagnostics: `[WorldBoss AI] battle=... action=...`.

## Boss/minion bindings
- Shadow Guardian: 2045, 2046
- Void Devourer: 2047, 2048
- Archon of Chaos: 2049, 2050
- Iron Colossus: 2051 only
- Storm Tyrant: 2052, 2053
- Bone Emperor: 2054, 2055
- Ice Leviathan: 2056, 2057
- Crimson Dragon: 2058, 2059

## HP
Boss and minion HP now use the values printed on Boss Pack cards. Boss HP is no longer scaled by player count.

## Classes
- Cleric self-heal: 25 HP.
- Engineer summons expire after their configured duration and expiration is logged.
- Berserker moved to DPS: stronger basic attack, missing-HP damage passive, triple-strike skill, six-turn double-damage ultimate with +25% incoming damage. Activating the ultimate does not end the turn.
- DPS basic damage increased.
- Warrior ultimate is now a two-turn party defensive cooldown with taunt.
- Archer skill uses three independent 25–40 damage arrows.
- Archer ultimate distributes 240 total damage among all enemies; if the boss is alone, all damage hits the boss.
- Class draft offers one more class than the number of players.
