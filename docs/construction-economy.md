# Construction economy checkpoint

## Why

The previous catalog assigned 22 work units to every material item, regardless of whether it was a fastener pack or a wall section. Core construction now estimates labor by task and preserves a complete material breakdown for later regional calibration.

## Current scope

Homes, open sheds, kitchens, warehouses, roads and bridges use the new estimates. First-camp recipes retain their deliberately quick assembly times. Material quantities, purchase prices, footprints and hauling requirements are unchanged. This is a labor-model foundation, **not completed real-world calibration**.

Each material appears once in the calculation. Earth in adobe homes belongs to earth-wall preparation; other earth and stone go to groundwork. Prepared frames, timber structure, walls/roof, connections and equipment each have separate coefficients. Setting out adds a fixed setup allowance. The breakdown is available in building tooltips and selected-project text.

| Example | Old person-hours | Revised person-hours |
| --- | ---: | ---: |
| Small limewashed house | 4.62 | 10.20 |
| Family house | 6.93 | 13.80 |
| Shared adobe house | 14.52 | 17.04 |
| Open shed | 2.48 | 4.00 |
| Kitchen | 3.96 | 7.56 |
| Warehouse | 10.73 | 12.32 |
| Road cell | 0.15 | 0.34 |
| Timber bridge | 7.92 | 9.16 |

These are **authored game person-hours**. They do not claim that a real house can be built in ten hours. Hauling, travel, personal needs, skill, weather and crew coordination affect elapsed completion time separately. Preparation phases describe the estimate; they are not yet sequential construction stages or curing timers.

## Provenance and remaining calibration

[CAIXA SINAPI](https://www.caixa.gov.br/poder-publico/modernizacao-gestao/sinapi/Paginas/default.aspx) publishes technical construction compositions and input references. Its [methodology](https://www.caixa.gov.br/Downloads/sinapi-metodologia/Livro_SINAPI_Metodologias_Conceitos.pdf) describes task specifications, coefficients, equipment and quantity criteria. This supports structuring estimates by task; none of the coefficients in this increment is copied from or certified against SINAPI.

Before applying real coefficients, define each catalog pack's physical coverage, usable building area, wall height, roof area and construction method. Then select dated regional compositions and distinguish real labor from any explicit game-time compression. Simply multiplying arbitrary packs by real square-meter prices would create false precision.

## Save behavior

New saves carry `constructionLaborVersion: 1`. On loading an older save, completed structures remain completed and partial work retains its completion percentage under the revised requirement. Materials, pending purchases, delivered loads and cash are untouched. The conversion operates on the parsed state, not the original saved string. Repeated loads do not rescale progress twice. Unknown versions and impossible old progress are rejected rather than clamped.

Tests: `scripts/verify-v02-construction-specs.mjs` checks every material allocation, house ordering, first-camp pacing, new saves, the genuine historical Day 61 save, idempotency and corrupt/unknown versions. The three-day replay continues to use actual exports and resident construction; it is not a fresh-start balance test.
