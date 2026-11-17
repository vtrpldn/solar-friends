# Processing material accounting

## Why

Cargo weights and processing recipes previously used inconsistent implicit units. A frame was treated as 18 kg despite its inputs weighing only 8 kg. These provisional measurements were never supplier specifications. A shared measurement table now keeps cargo and processing arithmetic consistent, and eight transformation recipes name their losses explicitly.

## Measurements and limitations

`web/v02/weekend/material-measures.js` defines approximate mass and volume per existing catalog piece or pack. Inventory counts, prices, recipe quantities and outputs have not changed. These are authored assumptions, not experimentally measured yields or canonical SI inventory units.

| Existing unit | Earlier cargo kg | Shared approximate kg |
| --- | ---: | ---: |
| Raw wood piece | 20 | 6 |
| Timber piece | 4 | 4 |
| Plank | 3 | 1.5 |
| Prepared frame | 18 | 4 |
| Wall material pack | 20 | 18 |
| Organic residues | fallback 2 | 1 |

Volumes for raw wood, planks and frames also decrease to 0.015, 0.005 and 0.04 m³. Other explicit cargo measurements stay unchanged. Updating these approximations can reduce future collection-trip requirements; it does not convert saved stock counts or refund already completed trips. Existing loaded cargo remains within capacity because no unit becomes heavier or bulkier.

These choices remove contradictions within the model; they do not establish real-world realism. Pack coverage, regional product specifications and measured processing yields still need calibration. Cooking currently assumes one water unit contributes one kg to its batch balance; the wider water system still requires canonical liter calibration.

## Recorded transformations

| Recipe | Input kg | Usable output kg | Named loss kg |
| --- | ---: | ---: | --- |
| Saw timber | 36 | 16 | 20 uncollected offcuts/sawdust |
| Saw planks | 12 | 9 | 3 uncollected offcuts/sawdust |
| Prepare frame | 5 | 4 | 1 joinery/fastening waste |
| Make walls | 40 | 36 | 4 unrecovered earth trimmings |
| Fire tiles | 44 | 24 | 20 firing moisture/fuel losses |
| Cook meals | 6 including water | 5 including scraps | 1 evaporation |
| Compost | 4 | 2 | 2 gas/moisture |
| Prepare dried provisions | 8 including water | 6 including residues | 2 drying moisture |

Losses are explicit sinks, not extra saleable inventory. Reusing sawdust or trimmings would require a separate recovery process. Crops, animals, extraction and construction are not claimed to be closed mass balances. Biological growth must account for environmental inputs before joining this model.

## Timing, saves and UI

Inputs are reserved by the existing production command. The accounting record increments when resident processing completes. Usable output remains carried until the resident reaches storage. Repeated ticks in the return phase, storage blockage and reload during carriage do not count another batch.

The optional versioned ledger stores bounded per-recipe counters rather than an ever-growing event list. Totals are derived from those counters. Old saves start recording future completions; already carried or delivered output is not reconstructed. Sandbox is excluded. Unknown ledger versions, recipe keys and invalid counts are rejected on restore.

The Resources screen shows batch totals, approximate input/output/loss mass and per-recipe losses. It explicitly excludes unmodeled systems and distinguishes processing completion from storage delivery.

## Evidence

`verify-v02-production-accounting.mjs` checks the transformation equations and their shared cargo definitions, then runs a resident through plank processing and delivery, reloads during carriage, and verifies single accounting and single delivery. Its completed workbench is an injected diagnostic fixture, not a bootstrap playthrough.

`verify-v02-economy-soak.mjs` continues the genuine Day 61 village through ordinary export funding and construction. Current output: `docs/balance/2026-11-16-material-accounting-soak.json`. Earlier checkpoint reports remain intact.

## Explicit unit checkpoint — 2026-11-17

Every catalog resource now has an explicit stock-unit description and cargo measurement. Unknown resources fail instead of silently inheriting a 2 kg / 0.01 m³ placeholder. Resources cards expose the definition in their tooltip. Counts and recipe quantities are unchanged; this is not a silent conversion of old stock.

Eggs now use an assumed representative mass of 60 g and packaged cargo volume of 0.1 L each: a dozen weighs 0.72 kg instead of 12 kg. The [MAPA weight-class table published by São Paulo's agriculture department](https://www.defesa.agricultura.sp.gov.br/legislacoes/portaria-sda-mapa-1179-de-05-09-2024%2C1943.html) supports using tens of grams, not kilograms. The selected representative weight and packaging volume are model assumptions, not a claim that every egg has identical mass. Egg count, price, nutrition and freshness remain unchanged.

Other kit measurements retain their earlier assumptions explicitly; making the table exhaustive does not make those values calibrated. In particular, toilet/pump kits and generic food portions need product and nutrition definitions before changing recipes. Canonical inventory conversion and full ownership reconciliation remain outstanding.

`verify-v02-material-units.mjs` checks full catalog coverage, every building/recipe measurement, dozen-egg mass and rejection of unknown material identifiers. Production and procurement regressions pass with the revised cargo model.

## Available-store movement record

The bounded material ledger records an opening stock snapshot, cumulative net movement per resource, 91 daily totals and the latest 160 events. Construction reservations, production inputs/deliveries, resident meals, spoilage, residues and other transfers pass through the stock boundary. The Finances screen shows recent movements and whether opening stock plus recorded changes reconciles to current available stock. Named cash transactions remain in the separate cash ledger; water and energy retain their physical utility accounts.

Project, production, export and vehicle ownership is derived separately from authoritative records, including partially delivered production output. The store ledger is not a fabricated history for older saves: recording begins when first used. Event timestamps are when a transition is observed; diagnostic tests jumping over several expiry dates can therefore differ in history timing while retaining identical net quantities. A missing event is surfaced as a reconciliation difference rather than silently rewriting stock or rejecting an otherwise usable village.
