# v0.2 land preview

## Why

Provide a fresh, direct-3D counterpart to the old artwork preview: a real 64×64 plot with the approved v0.2 props, before designing the new game's simulation.

Open `/v02/land/` on the local server. The asset workshop links here and this preview links back. No v0.1 simulation, saved villages or sprites are loaded.

## Scene and controls

- 64×64 cells, each 2 metres, on a flat 128×128 metre continuous land mesh. Quiet vertex colors avoid noisy per-cell texture repetition. Grid lines and plot edges use the same dimensions.
- The house, shed, tree, resident and ten connected path tiles are placed around the middle of the plot. Models come directly from the approved workshop recipes. This is a fixed preview arrangement, not a construction or simulation system.
- Left/right drag pans; wheel or buttons zoom; Q/E or arrow buttons rotate the camera in quarter turns. The orthographic camera stays at 30° elevation, preserving 2:1 ground axes. Home returns to the clearing; Whole plot fits the land boundary.
- Grid and Night toggle inspection aids. Clicking a prop outlines its logical footprint; the prop buttons focus individual assets. Coordinates shown to players are 1–64; stored layout coordinates are 0–63.
- Rendering happens on changes, rather than continuously repainting a static scene. Shadow coverage is focused on the central reference clearing. This small scene does not establish performance for a populated game.

## Checks

`node scripts/verify-v02-land.mjs` checks all 4,096 cell centers, map boundaries, centered placement, non-overlapping solid footprints, connected paths and exact 2:1 projection for all four camera bearings. The resident can stand on a path.

The in-app browser was used to inspect both the full plot and the close clearing, select props, pan, zoom, rotate and switch lighting. No browser errors or warnings were observed in that review. Existing assets and the sprite workshop remain available.
