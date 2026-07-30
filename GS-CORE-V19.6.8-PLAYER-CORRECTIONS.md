# GS CORE V19.6.8 — Player corrections

Implemented in this archive:

- Caravan arrival is randomized only inside 09:00–00:00 MSK; the full 30-minute visit fits inside the window.
- Guild Merchant material sales now include “Enter quantity” modal, so arbitrary stacks can be sold in one action.
- Achievements now include “В меню GS”.
- Weakening Scroll recipe is unified for everyone: Essence ×8, Beast Bone ×5, Magic Crystal ×1. UI uses the localized item name “Кость зверя”.
- Existing V19.6.8 clean blacksmith menus and processed-leather upgrades are retained.

The remaining large feature requests (equipment dismantling, direct gifts, unlimited expedition archive with paging, cancellation penalties, profession tools, richer fish/seafood recipes and artifact equip UX) require separate service/UI/database work and are recorded for V19.7.0 rather than being inserted as unsafe partial logic.

Data recovery requests for two treasure maps and the Necromancer level require the production database or exact expedition/class-progress rows. This archive does not blindly grant or overwrite player data without evidence.
