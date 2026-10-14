---
description: Canonical sprite sizes, camera calibration, and prompts for the artwork consistency pass.
---

# Artwork consistency

## Why

Small utility structures need to read at a plausible size beside homes and residents. The game, placement ghosts, and artwork studio use [building-art.js](../../web/building-art.js) for source crops, widths, ground anchors, and camera calibration. Library thumbnails use one common scale; the focus bench defaults to game scale.

See the [completed polish pass](art-polish-2026-10-08.md) for the fixes and verification, and the [original audit](consistency-audit-2026-10-08.md) for the before-state.

## Canonical assets

The library contains 75 entries backed by 47 source images: 74 active entries and one original resident study retained as a reference. Portraits use the same base character artwork as the animated residents. The live checks cover 303 cells, including all 240 resident poses. Unused garden and cistern cells remain embedded in older atlases but have no active library entry.

| Structure | Source-cell width at zoom 1 |
| --- | ---: |
| Home / kitchen | 179.36 px |
| Home · veranda | 158 px |
| Home · gable | 164 px |
| Home · entry terrace | 156 px |
| Greenhouse | 174 px |
| Community square | 172 px |
| Workshop | 158 px |
| Garden | 140.42 px |
| Banana grove | 123.9 px |
| Coop | 100 px |
| Compost | 78 px |
| Cistern | 77 px |
| Solar farm | 188 px |
| Street light | 80 px |

Widths include transparent padding and describe the source calibration. The placed village also applies the plot registration described below. A compost bin is about waist high beside a resident; a coop is smaller than a home.

New homes receive a saved variation cycling through the original, veranda, gable and entry-terrace artwork. Cancelling an earlier blueprint keeps the remaining homes and next placement ghost stable. All remain the same three-bed home with the same cost and collision footprint. Their source widths differ to compensate for transparent padding and keep painted doors, roofs and foundations at comparable sizes. Placement ghosts select the next variation; saved building IDs keep the sequence stable after reload. The artwork preview contains all six homes, and the live checks show their day/night versions together. Exact built-in image-generation prompts and references are in [house-variation-prompts.json](house-variation-prompts.json).

Residents use 48 px prepared cells, with a ground anchor of 0.95. Complete connected poses are isolated from the original sheets at load time, aligned by lower-body pivots and normalized with one scale per sheet. This preserves the shorter seated and kneeling poses without clipping adjacent artwork. Hens use 20 px cells and their pose-specific ground anchors. Crop layers use 22 px cells for lettuce and 26 px for beans and tomatoes, with one shared atlas scale so growth stages keep their relative sizes.

Gardens and greenhouses use painted empty structures plus separate crop layers. The taller greenhouse has two rows of four plants along its side beds and a clear central aisle. Registered glass and doorway apertures keep plants behind the painted frame; glass softens their color. [greenhouse-layout.js](../../web/greenhouse-layout.js) shares that layout between the game and crop previews. The wall-height revision and night pair were generated with the built-in image tool; exact prompts are in [greenhouse-height-prompts.json](greenhouse-height-prompts.json). Empty, young, growing, mature and dry states follow simulation data, including repeat tomato harvests. The [live artwork checks](../../web/artwork/checks.html) render all 60 crop/structure/light combinations and every resident frame.

## Sprite grid fitting

Buildings render directly over the terrain, without generated stone or soil platforms. [building-footprints.js](../../web/building-footprints.js) fits the full painted outline to its occupied grid columns and front edges using one uniform scale and a ground-contact offset. Transparent padding does not affect the fit. Upright walls and roofs rise above the ground diamond without changing their proportions.

[building-silhouettes.js](../../web/building-silhouettes.js) records the combined day/night outline from source alpha ≥32, the same threshold used by the artwork studio. Faint antialiasing and light fringes are retained in the PNGs. Run `node scripts/sync-building-silhouettes.mjs` after replacing artwork; validation rejects stale records.

Square and solar farm occupy 3×3 tiles. Cistern, compost, coop, street light, river generator and ecological toilet occupy one tile. Other buildings and all six home designs occupy 2×2 tiles. Plot corners lie on half-tile boundaries, matching roads; even plots preserve saved anchors. Placement ghosts, construction frames, selection, crop layers, emissions and road checks use these same plots and sprite registration. Local materials do not add a separate plot border.

Open **Dev Tools → Artwork → Sprite grid fit** for all 22 variants beside Iara, with day/night and grid guides. `node scripts/verify-sprite-grid-fit.mjs` checks actual source-pixel edges through the game drawing path at four zooms. `node scripts/verify-grid-foundations.mjs` checks JavaScript/Rust occupancy, road boundaries, both placement orders and saved plots.

## Camera calibration

The map uses a 2:1 orthographic game projection, with ground axes at slopes +0.5 and -0.5. This is the conventional game projection, not mathematical 30-degree isometry. [building-projection.js](../../web/building-projection.js) records hand-traced structural edges for every rectangular building, including all four homes. Two separate edges per direction determine the fitted camera. The shared Canvas transform keeps verticals upright; widths and ground anchors remain the canonical values above. The banana grove has no rectangular architecture and keeps its original camera.

The community square is an open seating area. Its benches, table and portable lantern share the normal affine camera calibration; it has no pergola or local texture warp.

Open [Building projection](../../web/artwork/projection.html), linked from the artwork studio and live checks, for all 22 variants. Toggle day/night, uncorrected source/game projection, and measured-edge overlays. Teal guides show the target directions; orange dashes show traced painted edges. The review covers 44 day/night views. Traced-edge residuals are at most 1.23 pixels at zoom 1; roof tiles, irregular timber, furniture details and foliage remain illustrations rather than exact architectural geometry. This tolerance is explicit: it is not a claim that every painted pixel is perfectly orthogonal.

Run `node scripts/verify-building-projection.mjs` for measured-edge tolerances, verticals, exact pergola beam slopes and post heights, triangle coverage without folds, and the actual cached Canvas drawing transforms. [building-projection-review.json](building-projection-review.json) pins all 26 reviewed source-file hashes; replacing a PNG requires re-tracing and visual review before updating its hash. Run `node scripts/verify-artwork.mjs` for catalog coverage, day/night geometry parity, transparency and relative-size bounds.

Three built-in image-generation attempts at a new pergola were rejected because their post geometry remained inconsistent. No candidate was installed. The exact prompts and disposition are recorded in [building-projection-attempts.json](building-projection-attempts.json).

Solar farms and street lights use the same calibrated camera. Their exact day/night generation prompts are in [solar-power-prompts.json](solar-power-prompts.json). Powered lights use the night texture; disconnected or depleted lights use a dimmed daytime texture so painted illumination cannot remain on during an outage. Rooftop-panel homes stay independently lit.

## Generation prompts

The built-in image-generation tool produced the greenhouse day/night pair, empty garden pair, crop atlas and five activity sheets in the latest pass. Exact prompts, references and destinations are in [art-polish-prompts.json](art-polish-prompts.json).

The built-in image-generation tool edited compost, workshop, coop, and square PNGs in [web/art](../../web/art/). Workshop, compost, and coop used their old sprite as edit target and the village atlas as style reference.

Shared prompt:

> Edit target image 1. Preserve this exact subject and its warm painted Brazilian ecovila style, terracotta/cream/teal palette, materials and upper-left illumination, matching reference image 2. Correct the camera to a rigorous 2:1 orthographic isometric GAME projection: all ground-plane rectangular edges parallel to screen vectors (2,1) and (-2,1), vertical posts perfectly vertical, no vanishing points, no perspective convergence. Equal axis foreshortening. Reconstruct geometry rather than keeping the current asymmetric perspective. Roof ridges, eaves, wall bases, furniture and horizontal beams must share these axes (sloped roof edges follow the pitched roof geometry). Single isolated object centered on square transparent canvas, entire silhouette within 8% padding. No text, grid, outlines, cast shadow outside footprint or added objects. Keep the same subject details, with slightly simplified small textures for readability.

Workshop suffix:

> Subject: the open-front woodworking workshop. Its ground foundation must be a symmetric diamond; the two visible ground axes have slopes exactly +0.5 and -0.5.

Compost suffix:

> Subject: two small waist-high wooden compost bays side by side with compost, scraps, a teal pail and garden fork. Strong symmetrical 2:1 ground axes. Simplify photorealistic wood grain to the softly painted cottage reference. Ground edge slopes +0.5 and -0.5. Do not make a building; these are small open bins.

Coop suffix:

> Subject: a small raised chicken coop with a short ramp. Rotate the building to equal 45-degree azimuth, showing equal foreshortening of the left and right walls. Ground axis slopes exactly +/-0.5, not the current asymmetric view. Retain the tiny doorway, teal shutter, terracotta roof and cream walls.

Final square prompt (old square as edit target):

> Rebuild this pergola sprite with CORRECT GEOMETRY, preserving the warm illustrated Brazilian palette, bunting, vines, two benches and table. Transparent square canvas. Essential change: FOUR posts form a perfect rectangular prism in 2:1 orthographic game isometric projection. On a nominal 1000x1000 canvas place four post FEET at back (500,450), left (180,610), right (820,610), front (500,770). Their TOPS are back (500,150), left (180,310), right (820,310), front (500,470). All four straight upright posts exactly same height. Join their tops with four straight horizontal wooden beams; all beam edges slopes +0.5 or -0.5, no perspective convergence. Front post must be centered x=500, NOT shifted right as in reference. Benches and table align to these SAME two ground axes. Keep generous clear transparent border. No grid or text or coordinate markers. Simplified painted style, not photorealistic.

Prompt constraints describe the requested output; the camera section records the actual limits of the delivered raster assets.

## Land and supplies

The revised six-sprite atlas in [economy-proportions-prompts.json](economy-proportions-prompts.json) keeps the warm painted Brazilian palette while removing solid orange ground islands and correcting tools, beams, crates and reclaimed-material proportions. The original atlas remains a reference in the artwork studio. [economy-art.js](../../web/economy-art.js) shares measured crops, ground anchors, actual source-pixel aspect and contact shadows between the game and workbench. Active widths are 62–90 px at zoom 1, calibrated to resident height, a full-size reclaimed door and waist-high furniture. The rectangular source is 1536×1024. Resource sites retain the actual meadow under their full contact area at the property edge, with a feathered transition; positions and collection behaviour stay unchanged. Empty sites fade and desaturate, and shared unlit brightness/saturation apply at night. No alternate night atlas is needed for these unlit props.

Local construction recipes use the existing veranda house and a stone-colored plot edge; they retain the same exact footprint and calibrated projection. Construction posts and beams follow the two ground axes, with low foundation stakes before taller structure scaffolding. Blueprints and unfinished equipment remain dim until installation is complete.

## Follow-up playtest

See the [completed gameplay and artwork playtest](../../playtest.md) for current coverage. Runtime corrections preserve house variations after cancellation, match unlit resource shading to buildings, and use digging poses for earth/stone collection. Workspots use actual tile bounds and valid land, so characters stand beside their task rather than inside a neighbouring plot or on an unreachable riverbank. No production PNG replacement was required in this pass.
