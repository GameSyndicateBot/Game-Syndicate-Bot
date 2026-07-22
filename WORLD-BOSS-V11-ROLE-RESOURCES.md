# GS World Boss V11 — Role Resources

## Cleric
- Removed the separate self-heal button and action.
- Every successful basic attack heals the Cleric for 20 HP (actual healing is capped by missing HP).
- Cleric continues to use Energy for skill and ultimate.

## Resource systems

### Rage — Warrior, Paladin, Guardian
- Starts at 0/100.
- Gained from basic attacks and from taking HP damage.
- Skill costs 40 Rage.
- Ultimate costs 100 Rage.

### Energy — Cleric, Assassin, Archer, Berserker, Engineer
- Starts at 0/100.
- Gained from basic attacks (less on a miss).
- Skill costs 40 Energy.
- Ultimate costs 100 Energy.

### Mana + Ultimate Charge — Priest, Bard, Mage, Necromancer
- Starts with 100 Mana and 0 Ultimate Charge.
- Skills spend 40 Mana.
- Basic attacks restore 15 Mana and grant 20 Ultimate Charge (12 on a miss).
- Using a skill grants 15 Ultimate Charge.
- Ultimate requires 100 Ultimate Charge and does not consume Mana.

## UI
- The battle card, text embed, target menu, and personal class card show the correct resource name.
- Mana classes also show a separate Ultimate Charge value.
- Database migration automatically adds `mana` and `ult_charge` columns to existing installations.
