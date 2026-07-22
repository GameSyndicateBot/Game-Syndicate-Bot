# World Boss Test V3

- Cleric now has two separate abilities:
  - Life Transfer: 40 energy, sacrifices own HP to heal a chosen ally.
  - Minor Self-Heal: 20 energy, restores 10 HP, separate 1-turn cooldown.
- Priest resurrection restores a chosen dead player at 50% HP and 0 energy.
- Added administrator-only `Start now` button during registration; minimum 4 players remains required.
- Boss HP scaling increased by 15%; outgoing damage increased by about 10%.
- Boss normal attacks can critically hit: 10% chance, x1.75 damage.
- Added boss area attack against every living player and player summons.
- Added boss curses:
  - single-target ability lock;
  - single-target ultimate lock;
  - rare one-turn group ability lock.
- Added rare destruction of player summons; golems have a 50% resistance chance.
- Added visible boss Rage meter (0-100).
- Rage grows each boss turn and from direct damage received.
- At 100 Rage, the boss automatically uses a powerful group ultimate and resets Rage.
- Bosses only summon minions assigned to them in config/cards.
- Automatic schedule remains disabled for testing.
