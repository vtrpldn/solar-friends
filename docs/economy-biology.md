# Biological time and outside income

## Why

Harvests must not appear simply because a resident stands at a field for a few seconds. Paid work provides an optional income source while the village establishes slower local production.

## Implemented behavior

Residents perform the first half of a production job to plant, feed or prepare it, then leave it alone during growth/curing. Once ready, a resident performs the remaining harvest work and physically carries the output to storage. Saving during growth preserves progress. Worker count and skill do not accelerate biological time; simulation speed changes only viewing speed.

The calendar is shared with needs, billing and travel: 3,200 simulation seconds equals one 24-hour game day. The year begins in November in the southern hemisphere. Outdoor growth slows by biome/season; greenhouse and indoor curing remain independent of those outdoor multipliers.

| Cycle | Base game days | Basis |
| --- | ---: | --- |
| Garden vegetables | 45 | Lower end of Embrapa's 45–60 day lettuce production reference; a representative crop group, not every vegetable |
| Greenhouse vegetables | 40 | Engineering/game assumption |
| Orchard fruit | 120 | Representative productive-tree interval; establishment age still needs refinement |
| Bananas | 270 | Engineering/game assumption |
| Planted timber | 2,190 | Six-year plantation assumption; standing natural trees remain immediately selectable for cutting |
| Bamboo | 365 | Annual managed stand assumption |
| Compost | 60 | Engineering/game assumption |
| Hen care/collection | 3 | Six eggs from three hens per cycle, not eight eggs every few hours |
| Goat care/milking | 1 | Four liters from two dairy goats, three kg fodder and sixteen liters water per cycle |
| Honey | 90 | Seasonal managed-hive assumption |

[Embrapa lettuce guide](https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1009227/1/DOC142.pdf) supplies the vegetable-cycle reference. [SENAR laying-hen guide](https://ead.senar.org.br/storage/senar-play/temp_zzpgvweijbxllsyjskspgunrvgglwrztcdgm/Cartilha-Completa-147.pdf) gives 115 g feed/bird/day in its example; the game's one kg for three hens over three days approximates that consumption. [Embrapa goat guidance](https://www.infoteca.cnptia.embrapa.br/bitstream/doc/54342/1/Doc85.pdf) notes dry-feed conditions can require eight liters/day. These references do not establish the remaining species yields or seasonal coefficients.

Ripe produce has a harvest window, then loses recoverable output gradually over a second window of equal length. Lost field yield is not added as saleable inventory. Food storage's existing freshness clock starts when harvesting finishes. There is no automatic renewed crop output while the player waits; repeating work still requires inputs and a resident.

## Optional outside contracts

Residents can enable a weekday part-time contract in their Overview. Iara works at a nursery, Bento does carpentry repairs, Luz cooks at a café, Cauã assists solar installers and Nina teaches environmental education. A four-hour shift pays R$80–100 gross, with an R$8 return bus fare. These are authored scenario rates, not researched occupational wage quotations.

A resident leaves only when rested, needs are reasonably met, no cargo is held and essential physical needs are met. If uncommitted cash cannot cover the fare, the employer deducts it from the return payment, avoiding a zero-cash commuting deadlock. They walk to the entrance, spend the commute and shift offsite, return to camp, then receive one ledger payment. Employers supply meals and toilet breaks. Work consumes energy; these residents are unavailable for village jobs. Disabling work during a shift takes effect afterward. Save/load preserves the shift and prevents duplicate settlement. The village's own work has no compulsory shared shift.

## Evidence and remaining calibration

`verify-v02-biological-production.mjs` exercises actual planting, worker release, growth save/load, calendar progress and partial/total field losses. `verify-v02-outside-work.mjs` exercises departure, offsite absence, return, deferred income, fatigue and mid-shift restore. Neither is a complete balance playthrough.

Seasonal coefficients, crop area/yield, juvenile orchards, ongoing care outside productive batches, mortality, construction scale and working capital still need calibration. Long biological cycles intentionally invalidate the old overnight-harvest assumptions; the complete economy must be tested with ordinary income and purchases before release.

## Ongoing moisture and soil

Vegetable beds represent 16 m², greenhouse beds 24 m², orchards 64 m² and banana plots 32 m² for the moisture model. Daily dry-weather irrigation is respectively 48, 48, 32 and 48 liters. These are engineering assumptions, not calibrated crop-specific irrigation prescriptions. Residents automatically queue water deliveries while a crop is growing; rain substitutes for outdoor irrigation. Dry soil stops growth, and watering restores it without deleting the crop. Each completed crop reduces fertility by ten percentage points; idle soil recovers over 180 game days. Fertility slows growth rather than creating extra harvested mass. Below 70% fertility, residents automatically apply stored mature compost at 0.25 kg/m² and spend 27 resident-minutes spreading it. Each application restores 30 percentage points, capped at 100%. This consumes compost, creates no harvested mass, and runs independently of equipment-maintenance budgets. The dose and work time are model assumptions; crop-specific area/yield calibration remains outstanding.
