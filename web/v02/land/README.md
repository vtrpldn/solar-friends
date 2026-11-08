# v0.2 asset garden

## Why

A live 64×64 plot lets us judge the complete collection at one real scale and compose scenes with the same models used in the workshop. It is separate from v0.1 and its simulation.

Open `/v02/land/`. The initial gallery places all 223 model types on the 128×128 metre plot. The asset library can search/filter and focus a model, or place it again after deletion. The collection link opens a visual contact sheet; each card opens that model in the orbitable workshop.

## Controls

- Drag to pan; scroll or ± to zoom. Q/E rotate the orthographic camera; Home returns to the first model; Whole plot frames the map.
- Select a model. **Move / M** starts a placement preview; click the land or Enter to commit. R rotates the selected model or preview by 90°. Escape cancels placement without changing the scene.
- **Duplicate** (Command/Ctrl+D) starts a new copy preview. **Place another** starts another copy of that asset. Delete/Backspace removes the selected model.
- Column/Row fields provide exact one-based cell placement. Bounds are validated using rotated footprints. Roof and foliage overhangs are preserved. Overlapping props are allowed deliberately for art composition.
- Undo/redo buttons or Command/Ctrl+Z / Shift+Z reverse up to 100 edits. Restore gallery is also undoable.
- Grid and Night are inspection options. Windows and streetlamp heads glow at night; streetlamp light originates at the lamp head.

## Storage

Edits save to localStorage under `solar-friends-v02-scene-1`, separate from every v0.1 save. Export/import use a versioned JSON document with up to 1,000 props. Imports validate known asset IDs, unique instance IDs, integer cells, quarter turns and map bounds before replacing the scene. Failed imports leave the scene intact. The browser reports storage failure and offers export. Undo history resets on reload; scene contents persist.

`editor.js` owns pure scene validation/history; `layout.js` owns map coordinates and the original five-prop reference fixture; `land.js` owns rendering and interaction. Rendering is on demand. The asset library batches each model by material, while the terrain remains one continuous mesh. There are no platform sprites or v0.1 simulation systems. Residents use articulated animation rehearsals.

Run `node scripts/verify-v02-library.mjs`, `node scripts/verify-v02-models.mjs`, and `node scripts/verify-v02-land.mjs`. The last checks map math and the original centered five-prop reference layout; the library test covers the full gallery and editor transactions.

## Connected growing areas

Gardens, solar farms and orchards automatically join when their footprints share an edge. Gardens use continuous soil/crop rows with only an outside border; solar modules line up on extended rails and share one inverter; orchards share an outside fence. L-shapes, partial edges and holes follow the actual occupied cells. Corner contact does not join. Overlapping same-type sections stay independent, avoiding ambiguous ownership.

Each section remains selectable and editable. Moving, rotating, deleting, undoing or loading a scene recomputes the connections; saved files keep the original placement records. The inspector shows connected section count and occupied cell area. Other building types retain their individual models. Run `node scripts/verify-v02-connections.mjs` for topology, rotated geometry, split/rejoin and persistence checks.

## Resident rehearsals

Select a supported prop to choose a resident and action. **Send resident** walks from their authored location; **Preview nearby** starts a short approach for close inspection. Pause animations or use **Stop / reset pose** to restore the resident. Benches, the shed, picnic table, hammock, gardens, seedling bench, workshop, kitchen, wash station and crates have authored contact points, including rotated placements. One rehearsal runs at a time and edits cancel it. Rehearsals do not alter saved placements or inventories. See [resident implementation](../residents/README.md) and run `node scripts/verify-v02-residents.mjs`.

## Biome terrain

The Terrain selector includes the three v0.1 regions: Mata Atlântica (forest hills), Cerrado (broad savanna rises), and Caatinga (dryland ridges), plus the flat comparison gallery. Each 64×64 terrain uses biome soil colors and a deterministic elevation field, closed soil edges and a surface-following grid. Heights are sampled from the rendered triangles for props, placement previews and resident movement. Structures form level terraces; touching footprints share a height so connected gardens, orchards and solar arrays meet.

**Load biome landscape** replaces the current props with an editable selection of the region's existing plant/rock models; Undo restores the prior props. The forest study is denser than the savanna and dryland studies. The central clearing remains open. Terrain selection and scene exports preserve the biome. Prop undo does not change the biome selector.

Open `/v02/land/?biome=mata-atlantica`, `?biome=cerrado`, or `?biome=caatinga` for an isolated study. These studies do not overwrite the saved gallery; export to retain edits. This is an art/placement foundation, not erosion, water flow, slope-aware route planning or a climate simulation.

Run `node scripts/verify-v02-terrain.mjs` for height ranges, rendered-triangle raycast agreement, joined terraces, native landscape validation and biome export roundtrips.

The shared Art Preview navigation connects Collection, 3D inspector, Scene editor, Biome landscapes and Resident animations. The current view is highlighted; the inspector remembers the last selected model for the browser session. Model selection updates the inspector URL for direct links.
