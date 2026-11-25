# Cultivation

Fields, gardens and greenhouses share bed-level cultivation. Players designate rectangular fields from **Build → Food & farming → Cultivated field**, drag the boundary, choose row direction and confirm. Select a site to manage individual beds. Residents prepare soil, sow seeds, apply compost, harvest and carry products to storage. Crops do not occupy a resident while growing.

Fields reserve 2–32 cells per side. A cell is 2 m. Beds are 1.2 m wide with 0.8 m lateral aisles and 1 m headlands. Field beds are divided into 2 m sections so expansion preserves previously cultivated sections. Existing garden beds remain 1.2 × 4 m; greenhouse beds remain 1.2 × 8 m. The field follows terrain without a foundation pad. Greenhouse access respects the visible walls and end door openings.

## Biological model

One game day is 3,200 simulation seconds. `crops.js` is the only place a crop is defined; stock items, planting stock, shelf life, cooking recipes, trade and models read that table. Current standard-density values are:

| Crop | Growth days | Plants/m² | Potential fresh harvest kg/m² | Dry-weather demand L/m²/day | Harvest window days | Keeps (days) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Leafy greens (couve e alface) | 45 | 12 | 2 | 3 | 4 | 3 |
| Bush beans (feijão) | 60 | 8 | 1.2 | 3 | 7 | 5 |
| Sweet corn (milho verde) | 85 | 4 | 1.5 | 4 | 5 | 3 |
| Cassava (mandioca) | 270 | 1 | 2 | 1.5 | 60 | 3 |
| Sweet potato (batata-doce) | 120 | 4 | 1.5 | 2.5 | 21 | 14 |
| Pumpkin (abóbora) | 100 | 1 | 1.5 | 3.5 | 14 | 30 |
| Cowpeas (feijão-de-corda) | 70 | 6 | 0.5 | 2 | 7 | 4 |

Calendar choices for the first three crops lie within the broad ranges in [University of Minnesota Extension's vegetable climate resources](https://extension.umn.edu/agriculture/specialty-crops/vegetable-farming/climate-resilience-resources-for-vegetable-growers-in-minnesota). The [University of Maryland sweet-corn guide](https://extension.umd.edu/resource/growing-sweet-corn-home-garden) provides a spacing reference. These sources do not establish local Brazilian crop performance: cultivar, soil and climate vary.

Cassava, sweet potato, pumpkin and cowpeas are staples of Brazilian smallholdings. Their cycle lengths, yields, water demand, shelf lives and town prices are authored estimates in the range commonly quoted for family farming (an eight-to-twelve-month cassava cycle, a four-month sweet potato); none has a cited reference in the calibration register yet. Three of them differ from the first crops in kind, not only in numbers:

- **Drought tolerance.** `dry` gives the days of dry soil a crop survives before damage and the further days to total loss. The default is 1 and 6; cassava has 8 and 24, sweet potato and cowpeas 3 and 10.
- **Dry-season growth.** `season` is the lowest seasonal growth factor the crop accepts. Cassava keeps at least 70% of its rate and sweet potato and cowpeas 60% through the Caatinga and Cerrado dry season, which slows the other crops to as little as 30%.
- **Planting stock.** Cassava is planted from cutting bundles and sweet potato from slip bundles, bought from the agricultural supplier like seed packets.

Cassava also waits in the ground: its harvest window is 60 days. Fresh roots still spoil in three days once lifted, so it is harvested as it is cooked or toasted. A kitchen turns 8 kg of roots into 4 portions of farinha provisions and 2 kg of peelings, recording the other 2 kg as moisture; they keep 30 days against 10 for other dried provisions, and automatic food management makes them towards the provision target. This is a simplified portion model, not a farinha yield figure.

Density, fresh yield, water demand, residue production, labor and seed-packet coverage are explicit simulation estimates. Half, standard and dense planting scale seed use and water demand. Dense planting incurs competition; it cannot multiply output without consequence. Outdoor growth uses the existing biome/season multiplier. Greenhouses exclude rain and that seasonal multiplier, but still need water and fertile soil. Temperature, ventilation and solar transmission are not modeled yet; the enclosure is a simplified environmental treatment, not a universally superior farming tier.

Growth uses moisture, fertility and competition. Accumulated stress permanently reduces that planting's yield potential. Watering later resumes growth without erasing earlier stress. Once mature, harvest losses begin after the crop's window and increase gradually. Harvest quantities are resolved once after resident work, then remain attached to the operation through transport and reloads.

## Soil and resource accounting

Each bed tracks moisture, fertility, organic matter, cover, cumulative irrigation/rain, evapotranspiration and drainage. Water capacity is 16 L/m². Rain supplies a modeled 6 L/m²/day outdoors. Existing utility supplies provide irrigation; failed withdrawals do not moisten the soil. Cover reduces demand by up to 40%. The model combines evaporation and plant transpiration in its outgoing water total.

Residues decompose exponentially with a 60-day time constant; applied compost uses 30 days. The modeled split retains 20% as soil organic material and records 80% as gas/moisture losses. Those fractions are illustrative model assumptions, not measured compost chemistry. Fertility and organic matter are normalized indices; this is not an elemental nitrogen or carbon model. Cropped beds no longer recover fertility merely by waiting: amendments and residue decomposition provide recovery.

The bed ledger records seeds, simulated biological biomass input, applied compost, standing biomass, harvested products, collected residues, remaining amendments, retained organic matter, decomposition losses and field losses. Biological input represents environmental uptake; harvest is not treated as a closed transformation of seed mass alone. Inventory stays in whole stock units; uncollected fractional residues remain on the bed. Existing food-batch accounting handles subsequent spoilage.

Every crop is a distinct stock item, measured in kg, with the authored shelf life in the table above. Each has an explicit cooking recipe. A corn-feed supplement recipe yields 1 kg dry fodder and 1 kg residues from 4 kg fresh corn, recording the other 2 kg as moisture loss. This is a simplified feed-processing model, not a balanced livestock diet specification.

## Persistence and limits

Legacy garden/greenhouse jobs and already queued soil-care work finish before bed migration. Empty sites receive unprepared beds; migration creates no harvest or free seeds. Existing crop-product inventories missing from older saves initialize to zero. Sandbox preserves its existing resource conventions and skips biological waiting after resident planting.

Active bed jobs lock configuration. Standing crops must be explicitly cleared before changing crops or shrinking through occupied beds. Field expansion retains matched beds' soil and crop state. Jobs must finish before resizing; shrinking cannot discard residues or pending amendments. Cultivated soil cannot be relocated with a building. No unlocks, ecological score, nitrogen-fixation bonus, pollination, pest system, erosion transport or machinery progression is implemented.

## Checks

- `node scripts/verify-v02-cultivation.mjs`: actual resident cycles for all crops in fields and greenhouses, operation-boundary saves, regular growth time, stress, cover, rainfall, field edits, legacy migration and resource balances.
- `node scripts/verify-v02-cultivation-browser.mjs`: desktop dragging, row rotation, confirmation, management, job queue, reload and day/night captures. `FARM_SCREENSHOTS` selects the output directory.
- `node scripts/benchmark-v02-cultivation.mjs`: a fixed 100-bed, 10,000-plant scene with crops disabled/enabled. Records animation-frame intervals, CPU submission time, renderer, draw calls and memory counters. `FARM_BENCHMARK` selects the JSON output.

The benchmark is a headless-browser measurement, not a hardware frame-rate guarantee. Crop and soil geometry is instanced. Distant crops use simplified geometry; close crops retain volumetric leaves. Renderer memory counters count resources, while the optional heap figure covers JavaScript memory rather than GPU bytes.

### Recorded desktop validation — 2026-11-17

The cultivation, browser, legacy biological-production, food-storage, production-hauling, production-accounting, building-access and second-playtest checks passed. Construction checks covered the existing placeable catalog and the new field, including its recipe mapping. The browser exercised field dragging, rotation, confirmation, bed settings, preparation queueing and reload without page exceptions; day/night scenes were inspected beside residents and a house.

The final [100-bed benchmark](../assets/validation/farming-v1/benchmark.json) used ANGLE/SwiftShader software rendering. At 10,000 plants, enabling crops increased draw calls from 1 to 2 and triangles from 18,000 to 58,000. Observed average animation-frame intervals were 74.0 ms without crops and 184.4 ms with crops; reported JavaScript heap was 17.1 MB in both samples. Software rendering is slow here. Hardware-rendered frame rate remains unverified; this result establishes batching, not smooth large-farm performance.
