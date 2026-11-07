# v0.2 asset workshop

## Why

Prove a repeatable model-to-sprite workflow before adding more game systems. The v0.1 code and art remain unchanged. These five models are reviewable material studies, not approved final artwork.

Open http://127.0.0.1:4173/v02/workshop/ after `npm run dev:serve`.

## Source of truth

- `models.js` contains deterministic metre-based model recipes, shared materials and the reusable roof/window/beam kit.
- House 2×2 cells, shed 2×1, tree 2×2, path 1×1. A cell is 2 metres. The resident is approximately 1.70 m tall without the hat.
- Orthographic sprite camera: 45° azimuth, 30° elevation, producing 2:1 ground axes. Vertical lines stay vertical. Orbiting is inspection only.
- Export: four 512×512 transparent views at 0°, 90°, 180°, 270°, arranged left to right. 48 pixels per metre; local ground origin at pixel (256,384) in every frame. Non-square footprints swap dimensions at quarter turns. Shadows use a transparent receiver, never an opaque foundation.
- The camera and light stay fixed as the model rotates. All frames use the same scale and crop; no per-asset auto-fit. PNG export ignores inspection surfaces, orbit, zoom, grid and scale figure.
- Placement JSON records the frame rectangles, anchors, footprints, camera and light. 3D JSON is compatible with Three.js ObjectLoader. The editable authoritative recipe remains models.js.
- Night is a lighting study, not powered windows. Resident animation, botanical specificity, painted textures, normal/depth passes and game integration are subsequent decisions, not delivered here.

## Inspection

Select an asset, orbit it, compare clay/wireframe/materials, add the human reference and inspect all four rotations. View together checks proportions and road contact at one shared scale. Sprite proof shows the exact transparent frames that PNG export generates. Day/night exports retain identical registration.

## Art review status

All five models: material study, awaiting player review. Warm terracotta, cream plaster, restrained turquoise and timber follow the old palette, but these deliberately use a new geometry-led approach. Do not treat mechanical geometry checks as artistic approval. The shade tree is a generic canopy study. The resident is an authored scale figure, not the removed character creator.

## Dependencies

Three.js 0.187.0, MIT. The local browser modules and OrbitControls are copied from the exact npm package; no CDN or network requests are needed at runtime. Keep `vendor/LICENSE`. To update, change the pinned package and recopy `build/three.module.js`, `build/three.core.js`, and `examples/jsm/controls/OrbitControls.js` together.

## Checks performed for study 01

- `node scripts/verify-v02-models.mjs` checks five model JSON roundtrips, 20 rotated geometry bounds, exact 2:1 projection, shared anchor, road edge dimensions and rotated shed dimensions.
- `node scripts/verify-v02-exports.mjs` checks actual browser-exported samples in `exports/`: 40 frames across five assets and two lights, nonempty transparent silhouettes including shadows, no edge clipping, identical day/night alpha, and placement metadata.
- In-app browser review exercised asset switching, free orbit, materials/clay/wireframe, the scale figure, shared yard, sprite proof, and PNG/placement/source downloads. A house export after orbiting, adding a scale figure and selecting clay was byte-identical to the clean export. The actual downloaded 3D JSON reloaded with matching bounds.
- These studies are intentionally faceted and simplified. They demonstrate the pipeline; the painted visual direction and final character design still need player review.

## House direction study 02

The house alone now uses a broader low-poly roof, a lower wall silhouette, a faceted arched turquoise entrance, large open shutters and a single small doorstep plant. Fine tile rows, shutter slats and exposed-brick decoration were removed from this candidate. The original house recipe and r01 exports remain available as references; the other four models are unchanged.

The house uses 1,020 triangles across 75 meshes, down from 4,796 triangles across 293 meshes. The original camera, shared scale and 2×2-cell footprint remain. Study 02 is an art-direction candidate awaiting player feedback, not approval to apply this style to the other props. Its day/night sprites and manifests are saved as `exports/house-*-r02.*`.

## House direction study 03

Restores recognizable clay roofing with four overlapping courses of chunky, six-facet hollow barrel tiles and a matching ridge cap. The study 02 walls, entrance, windows and plant are unchanged. Other props remain unchanged. All four rotations were visually inspected in the in-app browser; the r03 day/night exports pass the same alpha, clipping, footprint and anchor checks.
