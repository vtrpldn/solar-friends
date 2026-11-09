# Regular gameplay: all 68 building types

## Why

Recheck the resident needs, food and water failures found in the accelerated playtest, then attempt the entire catalog using ordinary gameplay. The funded fixture was stopped and removed after the user clarified the requirement. Its results are excluded here.

## Method and result

- Seed 42, entrance camp, default story rules: R$220, normal starting supplies, five residents. No sandbox, injected materials/money, instant construction, or altered prices/work durations.
- Played through the visible lab UI. Selected sites and blueprints, enabled ordinary production repetition and water/sanitation upkeep, sold actual harvested bamboo and food, and paid for missing building materials through normal town trips.
- Used 1024x requested speed, retaining 0.1-second simulation steps. Observed throughput varied with workload; examples ranged roughly 580–810x in the growing village. This is not a guaranteed speed on all hardware or scenes.
- Day 56, 04:39: **68/68 distinct buildable types completed, 74 structures including duplicate bamboo stands and banana groves, zero unfinished construction projects.** Natural deposits/trees are not buildable catalog entries.
- Six bamboo stands, two banana groves and an orchard supported food and export income. Every catalog construction used resident labor and actual materials; the final stocked goat pasture cost R$1,921 after available materials were used.

| Ledger | R$ |
| --- | ---: |
| Starting money | 220.00 |
| Sales income | 14,832.00 |
| Construction materials | 14,490.25 |
| Electricity | 103.73 |
| Other purchases | 96.00 |
| Ending balance | 362.02 |

The ledger reconciles without extra funds. The two emergency ingredient purchases were paid normally. The minimum cash balance in the retained hourly samples was nonnegative. Solar plus batteries stopped grid spending during the observed later period; the hydro generator was built afterward.

## Fixes exercised

- Urgent toilet/food needs interrupt sleep; residents can resume the remainder of their sleep afterward. Sleeping slows need decay. Critical physical needs take precedence over optional breaks, including at low energy.
- Existing food production receives priority during hunger. An explicit Resources policy permits one affordable emergency ingredient purchase per day; it can be disabled. Hungry drivers can make food trips without requiring high social/fun meters first.
- Ordered crops request water automatically instead of blocking their own irrigation. Maintained drinking reserves scale with population and tank capacity, with batching so tiny deficits do not trigger continuous purification jobs.
- Hauling and river bathing choose a nearby reachable bank rather than the fixed central river access.
- Lab resource selections refresh immediately; trade controls wait for the worker response, and automatic saves no longer overwrite placement/action feedback.

The old Day 8 starvation save was also replayed: by the evening, it had 31 ingredients, completed vegetable production, and all residents had eaten. The final all-building save restores with its day, money, residents and catalog intact.

## Observations and next balance decisions

1. **Bamboo is a dominant export.** Six cheap renewable stands funded most of the catalog. Growth time, recurring inputs, sale demand and hauling cost need review before treating this as a balanced economy. Prices were deliberately left unchanged during this run.
2. **Trade is click-heavy.** The ordinary sale action is one batch. This run repeatedly used that action; a player-set surplus sale threshold would remove repetitive clicking without giving free income.
3. **Construction competes strongly with income work.** Large queues slowed exports. A player-set worker allocation or minimum essential-production capacity would make village planning clearer.
4. **Power progression works better after the fixes.** Starter utilities no longer create the earlier toilet/blocked-kitchen drain. Later solar and storage visibly displaced grid costs.
5. **Large settlements spread service trips out.** Some later facilities are over 40 cells from stores. Better district storage/hauling controls would be more useful than simply increasing movement speed.

## Evidence and limits

- `evidence/2026-11-08-regular-catalog-summary.json`: complete building list, locations, work totals and ledger.
- `evidence/2026-11-08-regular-catalog-save.json`: replayable Day 56 state, validated through the normal restore function.
- `evidence/2026-11-08-regular-catalog.json.gz`: exported browser evidence, including hourly samples and UI action events. Decompress with `gunzip -c` to inspect.
- The final export retains 504 hourly samples from Days 35–56 (earlier exports were saved before reloads). None sampled a zero need, empty total drinking-water supply, or negative money. Minimum sampled hunger was 13.01; bladder 8.78. Hourly sampling cannot prove no transient dip between samples.
- One seed and one economic strategy; this verifies all catalog construction, not every production recipe, biome, placement rotation, or a representative difficulty curve.
- Focused needs, water, power, save, placement and deterministic-speed checks passed. No claim that every repository check passes; previously recorded unrelated baseline failures remain outside this change.

### Follow-up through Day 61

Reloaded the same village with the final urgent-needs/trade-feedback changes. Purchased 12 fodder for R$24 through a resident town trip, then ordered goat milking, egg collection and beekeeping through the UI. Residents completed all three and delivered **4 milk, 6 eggs and 3 honey** to stores. At Day 61, 19:49 the village still had all 68 types complete, R$338.02, 33 ingredients, about 287 clean water, and unchanged lifetime grid spending of R$103.73. The normal restore function also accepts this follow-up save (`evidence/2026-11-08-regular-catalog-day61-save.json`). The lab is left paused at this point.
