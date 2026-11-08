# v0.2 3D collection

## Why

The approved house establishes a repeatable material and modeling language. This collection replaces active v0.1 painted asset subjects with authored geometry, so rotations, shadows and proportions come from the same 3D objects.

There are **105 models**, covering **127 active entries** in `web/artwork/catalog.js`. `catalog.js` records the exact legacy IDs beside each recipe. The automatic coverage check fails when an active old catalog entry has no replacement.

- 22 building models, including the empty pasture; 6 houses including the approved house and adobe variants.
- 17 vegetation models, 4 geological clusters, 5 ground/path samples, 7 supply props.
- 16 everyday props: garden tools, water equipment, furniture, bicycle, laundry, crates, signs and a fire circle.
- 18 crop models: six crops at three growth stages.
- The five named residents plus the existing scale study; three hens and a goat.

Day/night images use the same geometry with scene lighting. Portrait, idle and activity atlas entries refer to the same authored resident. These are static art studies: this pass does not recreate animation clips, simulation or production behavior. Residents retain the approved scale-study body as requested; they are not a character creator. Species are stylized representations, not botanical models.

Archived references, rejected images and earlier prototypes are deliberately excluded. All v0.1 source files and the original five model recipes remain intact. House study 03 is unchanged. New housing uses authored structural variations; randomized accessories remain deferred.

## Review

- `/v02/library/`: the complete collection, category filters, four rotations, shared scale and optional enlarged detail previews. Click a card to inspect the live model.
- `/v02/workshop/`: all 105 models, orbit, wireframe, scale reference, day/night and four-view sprite proof. Export remains optional; the land uses live geometry.
- `/v02/land/`: all models placed on a 64×64-cell editable plot. See its README for controls and scene storage.

Geometry uses metres, two metres per cell, the existing warm palette, faceted foliage and the approved barrel-tile recipe. Static meshes are combined by material in the land/gallery to reduce draw calls without changing geometry. Transparent greenhouse panels keep separate materials. New models remain studies open to art direction; inventory coverage is not a claim of final art approval.

Run `node scripts/verify-v02-library.mjs` and `node scripts/verify-v02-models.mjs` for inventory coverage, finite geometry, ground bounds, geometry-preserving batching, serialization, all four camera projections and edit history. `verify-v02-exports.mjs` checks the five existing exported reference sheets, not new PNG exports.

See [art revision 02](../../../assets/art-direction/v02/art-revision-02.md) for proportions, species references and whole-map shadows. Run `node scripts/verify-v02-art-revisions.mjs` and `node scripts/verify-v02-consistency.mjs` for the corresponding geometry gates.
