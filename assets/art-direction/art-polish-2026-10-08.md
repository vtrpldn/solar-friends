---
description: Completed art and gameplay polish fixes, with current sprite inventory and verification evidence.
---

# Completed artwork polish

## Why

The audit identified art defects that needed implementation before more feature work. Commit `d5adfa1` addresses all seven recorded findings. The current catalogue has 58 active entries plus one historical reference, backed by 36 source images. The [current inventory](art-polish-2026-10-08.json) records source hashes, review notes and pixel checks.

| Finding | Completed change |
| --- | --- |
| ART-01 · clipping and drift | All 240 resident poses are isolated and registered before rendering, with a fixed baseline, lower-body pivot and one scale per sheet. Game, studio, replacement previews and pixel checks share this preparation. Original ten PNG sheets remain intact; this is a rendering repair, not a claim that their raw grids were repacked. |
| ART-02 · hen proportions | All three hens use 20 px source cells instead of 26 px, retaining standing and pecking anchors. |
| ART-03 · fixed garden crops | Painted empty day/night beds now receive separate lettuce, bean and tomato layers. Empty, seeded, growing, harvestable and dry states follow the real crop data. |
| ART-04 · incorrect activity poses | Five new sheets add cooking, watering, tending and feeding poses. Tasks and building visits select the corresponding clip; construction and crafting retain the hammer. |
| ART-05 · greenhouse mismatch | Painted timber, teal glass and brick day/night artwork replaces the procedural structure. Shared calibration, crop layers and catalogue/replacement/recipe support are integrated. |
| DEV-01 · scenario selector | The selector follows the loaded scenario while preserving a later user selection. |
| COPY-01 · hunger explanation | The reason now describes available ingredients while waiting for a cooked meal. |

Portraits now derive from the same character art used in the world. The original portrait study remains available as a reference, without an active game role. Built-in image generation produced ten accepted PNGs; [exact prompts and references](art-polish-prompts.json) are retained and included in the studio recipe records.

## Evidence

- 49 Rust tests, formatting, strict Clippy and the release WASM build passed.
- All nine `scripts/verify-*.mjs` scripts and JavaScript syntax checks passed. The new frame test exercises figures crossing grid boundaries, overlapping bounding boxes, isolation, shared scaling, crop thresholds and task mappings.
- Live browser pixel checks passed for all 59 entries / 287 cells, including 240 resident frames. These checks verify boundaries, gutters and ground registration; visual style is a separate review.
- Inspected the painted village in daylight and at night, all five new activity sheets in the shared renderer, normalized idle frames, mirrored idle and watering playback, and the crop matrix. The checks page exposes 60 garden/greenhouse × crop × phase × lighting combinations.
- First harvest advanced one game hour through the developer tools: food increased from 100 to 110 and the garden replanted at 0% growth.
- Game, artwork studio and live-check tabs returned no browser warnings or errors. All active studio entries are marked consistent; the reference study is excluded from active approval.

The original audit's seven-scenario and three-day simulation evidence remains linked there. This follow-up repeats the affected art and harvest checks rather than claiming that every possible gameplay sequence was retested. Painterly architecture remains approximate; metadata calibration does not prove every painted beam is geometrically exact.

## Inspect the result

Open `/artwork/checks.html` from the artwork studio or the Dev Tools artwork panel for current pixels and all frames. Local screenshots and exported checks are in `artifacts/art-polish/`: `village-day.png`, `village-night.png`, `crop-states-day.png`, `crop-states-night.png`, `pixel-checks.json` and `studio-review.json`. These local artifacts are ignored by Git; the inventory and source hashes are committed.
