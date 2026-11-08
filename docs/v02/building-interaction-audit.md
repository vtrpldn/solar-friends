# v0.2 building and resident interaction audit

Audited 2026-11-08. Scope: the playable weekend simulation, not the art-library interaction rehearsals. All 28 building models are available through 57 total build choices (including the four camp shortcuts, resource sites and props).

## Findings fixed

- Hens and goats could never complete production: animal drinking incorrectly required a greywater tank. Drinking now consumes fresh water without generating washing wastewater.
- Completed houses and additional tents were ignored by tired residents. They now offer two resting spaces each, with a reachable entrance, indoor recovery and exit; occupied accommodation cannot be relocated. Original camp tents remain the fallback.
- Wash stations were ignored and washing depended on having built a cistern. Residents now prefer a supplied wash station, with exclusive use and actual fresh-to-greywater accounting.
- Toilets created sewage without anyone visiting. Residents now walk to an available toilet and generate waste after using it. Full toilets cannot accept another visit.
- The square, open shed, warehouse and receiving bench had no resident destinations. Squares attract leisure, open sheds provide reachable rain shelter, and storage buildings/receiving benches receive material pickups and finished outputs.
- Workers could share service positions. Service approaches reserve space; production and washing face their target, with front work-surface alignment for the workshop, kitchen and wash station. Farm work uses the tending pose.
- Stocking an empty goat pasture did not update its visible model. It now displays the occupied pasture after the first goat pair is supplied.
- Switched-off batteries still supplied the network. Their charge is now isolated until switched on. Water pipes no longer deliver into switched-off destinations.
- Generic completion messages described every building as providing privacy. Messages now distinguish toilets from other completed buildings. Recovered batteries appear under Power.

## Functional coverage

| Buildings | Function exercised |
| --- | --- |
| Limewashed, veranda, gabled, terrace, adobe gabled and adobe veranda houses | Construction, two-person indoor recovery, exit, relocation protection, save/restore; rooftop generation and battery behavior use the shared home node |
| Open timber shed | Construction and residents moving beneath its open roof during rain |
| Community square | Construction and resident leisure visits |
| Storage house | Construction, increased storage capacity, resident deliveries |
| Workshop | All five preparation recipes: frames, walls, tiles, fittings and tools; inputs, power, labor and output delivery |
| Community kitchen | Cooking with water, electricity or sewage-derived biogas; food output returned to storage |
| Vegetable garden, greenhouse, orchard and banana grove | Four food recipes, water requirements, resident labor and harvest output |
| Goat pasture, empty goat pasture, chicken coop and apiary | Feed/water where required, goat stocking, milk/eggs/honey production and delivery |
| Compost station | Residues converted to compost through resident work |
| Cistern | Non-potable intake, powered filtering, class separation and pumping |
| Ecological toilet | Resident visits, bounded sewage storage and compatible treatment connection |
| Reed bed | Greywater treatment into irrigation water, with water-loss accounting |
| Banana treatment bed | Sewage treatment without creating potable water |
| Biodigester | Sewage treatment, biogas production and use by a cooking job |
| Solar farm | Generation, charge/discharge, isolated loads and resident-installed connections |
| River generator | Reachable riverbank construction and night generation |
| Street light | Connected power requirement and battery-backed night operation |

Additional checks cover all five extraction sites, renewable cooldowns, finite deposits, the receiving bench, recovered battery, rain barrel, standalone wash station and both additional tents.

## Evidence

- `node scripts/verify-v02-buildings.mjs`: all 57 build choices physically supplied and completed by residents, then restored from saves; all 19 production recipes visited, worked and delivered; all six house variants and both added tents; service visits and utility edge cases.
- `node scripts/verify-v02-economy.mjs`: power/water conservation, dependencies, installation, hauling, production, regrowth, sales and repeat-production targets. Completion checks allow travel and washing instead of relying on a fixed 160-second deadline.
- Existing weekend, resident-rig, presentation and sunlight checks cover the previous camp loop, navigation, rest transitions, animation and lighting.
- The unsaved `?utilities-preview&interactions` scene exercises exhausted residents heading home, washing and livestock jobs together. Browser playtesting observed milk and egg deliveries and recovery from low energy. It does not touch the player's save.

## Limits and remaining distinctions

This verifies the current management functions, not a complete life simulator. Production remains player-queued (or set to repeat). Power generation and water treatment operate automatically once connected; residents install utilities and haul water rather than staffing them continuously. Interior rooms are not rendered, and livestock work uses a shared tending animation rather than bespoke hand-to-animal animation.

Camp accessories such as the watering can, wheelbarrow, tool rack, seedling bench, woodpile, clothesline, hammock, bicycle, produce crates, wayfinding sign and farm gate remain decorative in the playable simulation. Bench/table/fire-circle props attract nearby leisure but do not all have authored seated interactions here. Their construction is tested; they are not counted as functional production buildings. Shared inventory and direct endpoint utility links remain deliberate v0.2 simplifications.
