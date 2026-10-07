---
description: Gameplay and all-sprite consistency audit, with unresolved art defects and acceptance criteria for the next polish pass.
---

# Gameplay and art consistency audit

The art audit **needs work**. Of 42 catalogue entries, 27 are visually consistent within the current stylized scale and 15 need corrections. The procedural greenhouse is an additional failure outside the catalogue. All 195 source cells were inspected, including all 160 resident animation frames. The gameplay checks passed within the coverage below.

## Why

Passing metadata and simulation tests cannot establish visual consistency. This audit compares the actual source cells, game-scale artwork, day/night scenes and scenario behavior with the [approved reference](brazilian-ecovila-approved.png) and [art direction](art-direction.txt). Baseline: `4dfe5f3`; preview corrections: `5d5be86`. Asset hashes and an individual verdict for every entry are in the [audit inventory](consistency-audit-2026-10-08.json). The same verdicts are saved in the local artwork studio.

## Fixes before further feature work

| Priority | Finding | Acceptance criteria |
| --- | --- | --- |
| 1 · ART-01 | All ten resident sheets paint across nominal 4×4 cell boundaries. Crops include fragments of neighboring poses or cut off hats, tools and feet. Nina’s standing-idle row also shifts sideways substantially. | Repack each complete pose with transparent gutters; maintain a stable ground point and body scale. Review all 160 crops and each loop, including mirrored motion and transitions. Do not scale each frame independently to fill its cell. |
| 1 · ART-05 | The greenhouse is a flat translucent canvas drawing beside painted buildings. Its linework, materials and simple ellipse crops do not match. It has no catalogue entry or painted night variant. | Supply matching painted day/night structure layers at the same map projection; keep crops independently drawable. Include the greenhouse in catalogue/replacement/recipe workflows. |
| 1 · ART-03 | Garden day/night sprites always show the same lettuce. Empty, dry, young, mature, bean and tomato states look identical; `drawGrowingBed` is only called for greenhouses. | Use a painted empty bed with crop-state layers. Verify empty, seeded, growing, harvestable and dry beds for each crop in day/night views. |
| 2 · ART-02 | All three standing hens are about 18.8 px high beside a 40.9 px adult, about 46%. They read oversized compared with the approved reference. | Start a calibration draft at 20 px cell width instead of 26 px, yielding roughly 35% adult height. Review both poses, all variants, and coop-door proportions before adopting. Production size is unchanged. |
| 2 · ART-04 | Kitchen, garden, greenhouse and coop visits reuse the hammer-work row. Ordinary cooking, watering and gardening tasks fall back to looking around. | Map each task to a plausible activity pose. Add the missing activity art; retain the hammer for construction/crafting. |
| 3 · DEV-01 | Direct scenario URLs display the correct active scenario but initialize the “Start from” selector to Fresh arrival. | Initialize the selector from the loaded scenario without overriding a later user selection. |
| 3 · COPY-01 | A hungry established village reports “arrival supplies until the kitchen is ready” even with a completed kitchen. | Describe eating available ingredients when no prepared meals remain. |

Painted homes, kitchen, grove, cistern, compost, square, workshop and coop share the intended palette and materials. Four tree species, both terrain swatches and five resident portraits also fit. Portrait heights range from 39.8–41.2 px at the shared 43 px cell width. Tree size variation is intentional stylization. Building camera checks validate declared axes; they cannot prove that every painted roof or beam is geometrically exact.

Day/night silhouette overlap ranges from 96.1–99.3% at a 256 px alpha sample. The variants retain the same declared crop, scale and ground anchor. Lit lanterns and antialiasing can change silhouettes; these percentages are review signals, not evidence that every differing pixel is a defect.

## Corrections completed in this audit

- The all-building fixture now includes a completed greenhouse. Both Established village and Night lighting inherit it. The fixture check requires all ten building kinds.
- Chicken calibration and replacement previews now use the game’s standing/pecking foot anchors, while preserving a proposed calibration offset. Catalogue dimensions also use the shared chicken constants.
- All 42 studio entries have a verdict and specific review notes. The original art files remain unchanged.

## Gameplay and tooling evidence

| Check | Result |
| --- | --- |
| Rust suite, formatting, strict Clippy, WASM build | Pass; 49 Rust tests |
| JavaScript syntax and eight `verify-*.mjs` scripts | Pass; includes artwork, chickens, developer tools, 4,704 placement probes, quests, animation logic, situations and storage |
| Seven development scenarios | Each loaded and single-stepped through the browser |
| Three-day simulation sweep | All seven scenarios passed finite/resource/vital-range checks and 72 hourly save restores each, 504 total; hungry scenario recovered to under 8 hunger per resident |
| First harvest, browser | One-hour advance produced 110 food and a replanted garden at 0% growth |
| Full coop, browser | One tick produced three eggs, visible in the pantry |
| Overworked cook, browser | Real concern appeared; sharing shifts produced the agreement and caring state |
| Save protection, browser | Sandbox import, new village and restore-backup controls disabled; status identifies the protected save |
| Day/night and greenhouse, browser | Actual game renderer inspected and captured; greenhouse mismatch is visible |
| Browser warnings/errors | None returned for the exercised game and studio tabs |

This is desktop coverage. Audio was not listened to, every possible player action sequence was not exhaustively explored, and subjective balance/fun was not certified. The Playwright `npm run dev:check` harness was not run; the non-browser checks and interactive browser checks above were run separately. Construction/road indicators were source-reviewed; they do not have separate raster sprites or individual catalogue verdicts. Contact sheets fit source cells into equal boxes for style/cropping review, so use game-scale screenshots for proportions.

## Local evidence

The [visual report](../../artifacts/consistency-audit/index.html), [pixel measurements](../../artifacts/consistency-audit/pixel-metrics.json), [scenario snapshots](../../artifacts/consistency-audit/gameplay-browser.json) and [three-day results](../../artifacts/consistency-audit/three-day-gameplay.json) are local ignored artifacts. They include contact sheets for every source cell and screenshots of greenhouse, chicken scale, day/night, harvest, pantry and agreement states. Re-run the checks after corrections; this dated audit does not approve later asset revisions.
