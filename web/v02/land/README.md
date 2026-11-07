# v0.2 asset garden

## Why

A live 64×64 plot lets us judge the complete collection at one real scale and compose scenes with the same models used in the workshop. It is separate from v0.1 and its simulation.

Open `/v02/land/`. The initial gallery places all 89 model types on the 128×128 metre plot. The asset library can search/filter and focus a model, or place it again after deletion. The collection link opens a visual contact sheet; each card opens that model in the orbitable workshop.

## Controls

- Drag to pan; scroll or ± to zoom. Q/E rotate the orthographic camera; Home returns to the first model; Whole plot frames the map.
- Select a model. **Move / M** starts a placement preview; click the land or Enter to commit. R rotates the selected model or preview by 90°. Escape cancels placement without changing the scene.
- **Duplicate** (Command/Ctrl+D) starts a new copy preview. **Place another** starts another copy of that asset. Delete/Backspace removes the selected model.
- Column/Row fields provide exact one-based cell placement. Bounds are validated using rotated footprints. Roof and foliage overhangs are preserved. Overlapping props are allowed deliberately for art composition.
- Undo/redo buttons or Command/Ctrl+Z / Shift+Z reverse up to 100 edits. Restore gallery is also undoable.
- Grid and Night are inspection options. Windows and streetlamp heads glow at night; streetlamp light originates at the lamp head.

## Storage

Edits save to localStorage under `solar-friends-v02-scene-1`, separate from every v0.1 save. Export/import use a versioned JSON document with up to 1,000 props. Imports validate known asset IDs, unique instance IDs, integer cells, quarter turns and map bounds before replacing the scene. Failed imports leave the scene intact. The browser reports storage failure and offers export. Undo history resets on reload; scene contents persist.

`editor.js` owns pure scene validation/history; `layout.js` owns map coordinates and the original five-prop reference fixture; `land.js` owns rendering and interaction. Rendering is on demand. The asset library batches each model by material, while the terrain remains one continuous mesh. There are no platform sprites or simulated residents.

Run `node scripts/verify-v02-library.mjs`, `node scripts/verify-v02-models.mjs`, and `node scripts/verify-v02-land.mjs`. The last checks map math and the original centered five-prop reference layout; the library test covers the full gallery and editor transactions.
