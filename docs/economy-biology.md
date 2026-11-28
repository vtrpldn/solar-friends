# Biological time and outside income

## Why

Harvests must not appear simply because a resident stands at a field for a few seconds. Paid work provides an optional income source while the village establishes slower local production.

## Implemented behavior

Residents perform the first half of a crop or curing job to plant or prepare it, then leave it alone during growth/curing. Egg and milk output instead accumulates from daily care; resident jobs collect already produced output. Once ready, a resident performs the remaining harvest work and physically carries the output to storage. Saving during growth preserves progress. Worker count and skill do not accelerate biological time; simulation speed changes only viewing speed.

The calendar is shared with needs, billing and travel: 3,200 simulation seconds equals one 24-hour game day. The year begins in November in the southern hemisphere. Outdoor growth slows by biome/season; greenhouse and indoor curing remain independent of those outdoor multipliers.

| Cycle | Base game days | Basis |
| --- | ---: | --- |
| Garden vegetables | 45 | Lower end of Embrapa's 45–60 day lettuce production reference; a representative crop group, not every vegetable |
| Greenhouse vegetables | 40 | Engineering/game assumption |
| Orchard fruit | 120 | Representative productive-tree interval; establishment age still needs refinement |
| Coffee | 330 | One crop a year after a two-year establishment; authored smallholder estimate |
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

Vegetable beds represent 16 m², greenhouse beds 24 m², orchards 64 m² and banana plots 32 m² for the moisture model. Daily dry-weather irrigation is respectively 48, 48, 32 and 48 liters. These are engineering assumptions, not calibrated crop-specific irrigation prescriptions. Residents automatically queue water deliveries while a crop is growing; rain substitutes for outdoor irrigation. Dry soil slows growth. Below 10% moisture, one continuous dry day begins permanent yield damage; seven continuous dry days fail the crop. Watering stops further damage but cannot restore lost yield. Beds keep receiving care through the harvestable stage. Failed beds require clearing and preparation; failed perennial harvests leave the building intact. Irrigation can supply another 2 mm/day to rebuild soil moisture, in addition to replacing daily demand. Each completed crop reduces fertility by ten percentage points; idle soil recovers over 180 game days. Fertility slows growth rather than creating extra harvested mass. Below 70% fertility, residents automatically apply stored mature compost at 0.25 kg/m² and spend 27 resident-minutes spreading it. Each application restores 30 percentage points, capped at 100%. This consumes compost, creates no harvested mass, and runs independently of equipment-maintenance budgets. The dose and work time are model assumptions; crop-specific irrigation and soil coefficients remain estimates. The representative area/yield calibration is documented below.

## Area yields and establishment (17 November)

Garden and greenhouse harvests now use 2 kg of edible produce per square meter: 32 kg from 16 m² and 48 kg from 24 m², before missed-harvest losses. This conservative representative yield is informed by [Embrapa Circular Técnica 56 (2007)](https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/780841/1/alface-organico-CT56-2007.pdf), which reports São Paulo's 2006 lettuce production of 129,077 tonnes over 6,570 hectares, about 1.96 kg/m². It is an explicit mixed-crop approximation, not a prediction for every vegetable or biome. Organic residues are modeled separately at 4/6 kg. Large harvests use multiple physical carrying trips with unchanged expiry dates.

A new orchard's first cycle includes 610 establishment days plus its 120-day productive cycle: two years before the first harvest under favorable conditions. Later cycles use 120 days. This is an authored representative fruit-tree assumption; species-specific juvenile periods vary. Existing orchards migrate as established, preserving their current productive state. Timber stands consume two replacement seedlings after their first harvest; the original planting is included in the building bill. Bamboo is retained as a managed perennial stand, not replanted after each cut.

### Grove seedlings and the nursery

Wild groves raise their own seedlings. Each land has a few **grove seedling** patches in a free cell beside standing trees (`wild-seedlings` in `gathering.js`); a resident digs two tree seedlings per visit, the patch recovers in 120 days, and it stops for good once every tree within three cells has been felled. Residents gather them unasked while the village holds fewer than four tree seedlings, like other gathering.

A **seedling bench** grows four tree seedlings on for 180 days into four nursery saplings (`BIOLOGY.saplings`). Saplings cannot be bought. An orchard planned while the stores hold four saplings takes them in place of the four bought seedlings, and its establishment is 430 days instead of 610: the 180 days on the bench count one for one (`NURSERY_HEAD_START`). The gain is that the bench can start in the first week, before there is earth, compost or water for an orchard, and that bench months do not slow in unfavourable seasons as field establishment does. These are authored assumptions. Bench saplings need no water yet and none die; coffee, bananas and timber stands do not use them.

An orchard is planted with the fruit tree that belongs to its land (`NATIVE_ORCHARDS` in `biological-production.js`). In the Mata Atlântica it stays a mixed fruit orchard. In the Cerrado it is pequi and in the Caatinga umbu: the same two-year establishment, 120-day cycle and 12 kg harvest, but the trees draw 50% (pequi) or 25% (umbu) of the usual irrigation, survive 14 days of dry soil before damage and 60 more before total loss, as managed timber does, and keep at least 80% of their growth rate through the dry season. These factors are authored to express drought adaptation; they are not measured figures for either species, and real pequi and umbu trees take longer than two years to bear. Orchards in existing Cerrado and Caatinga villages become native orchards on load.

A coffee grove (`coffee` in `catalog-rules.js`) is a 12 × 12 m plot of about forty shrubs under two shade trees. It is a cash crop, not food. The first crop comes after 730 establishment days plus a 330-day cycle, so after about three favorable years. Growth slows in unfavorable seasons like every seasonal crop: in a Cerrado story playthrough the first crop was on course for nearer four years. Later crops take 330 favorable days, roughly one a year. A crop is 24 kg of dried coffee and 12 kg of residues, picked and sun-dried on the grove's own bed as one job of resident work. Dried coffee does not spoil. The town café buys it at half its R$60/kg retail price, so a full crop is worth about R$720 before transport. The yield follows a smallholder arabica figure of roughly 1.7 t of green coffee per hectare; that, the price, the 72 L/day dry-weather irrigation and the timings are authored estimates without a cited source. Pulping, roasting and drinking coffee in the village are not modeled.


## Timber yield calibration

The 3×3 managed timber stand represents 36 m². Its six favorable-year harvest is now 288 kg (48 raw-wood pieces), with 324 base resident-minutes of work (10% planting/preparation, 90% felling and cutting) plus physical hauling. A 2026 [Embrapa national survey](https://www.embrapa.br/en/web/florestas/busca-de-noticias/-/noticia/149106379/expedicao-silvicultura-revela-produtividade-florestal-e-concentracao-da-expansao-em-mato-grosso-do-sul) reports eucalyptus increment of 27.6 m³/ha/year at a seven-year reference age. Applying that magnitude to 36 m² and six years, with an assumed 500 kg/m³, gives about 298 kg. The game rounds down to 288 kg. This is a managed fast-growing timber proxy, not a claim that native trees or every biome achieve eucalyptus yields. Seasonal slowdown extends elapsed years. Four replacement seedlings are required after each harvest, matching the four trees initially supplied with the stand. Previously queued two-seedling rotations remain loadable. Trees are spaced 3 m apart with 1.5 m boundary setbacks on the 6 × 6 m plot. The visual uses slender trunks rather than buttressed old-growth trunks. Timber drought damage begins after 14 continuous days of critically dry soil and reaches total loss after another 60 days; moisture still limits growth immediately. These tolerance and labor values are authored gameplay assumptions, not species-specific forestry prescriptions. Wild standing trees remain a separate finite resource.

## Weather and animal production

Rainfall uses liters per square meter from the shared [weather model](simulation-climate.md). Cultivation records received rain, irrigation, evaporation and drainage. Drought damage is separate from harvest-window losses and cannot be erased by watering.

Hens and goats consume the existing ration totals continuously from feed and water reserves. Adequate care restores health by at most five percentage points per day; deprivation removes fifteen points per day. Health during production determines yield. Standard groups produce at most two eggs/day or four liters of milk/day. Fractional production is retained, collection issues whole units, and uncollected output is limited to two collection batches with product-specific expiry. Collecting output preserves its expiry rather than making it fresh. Animals do not die, breed, or age in this model.
