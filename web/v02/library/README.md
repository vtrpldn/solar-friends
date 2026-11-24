# v2 3D collection

## Why

The approved house establishes a repeatable material and modeling language. This collection replaces active v1 painted asset subjects with authored geometry, so rotations, shadows and proportions come from the same 3D objects.

`catalog.js` exports the current `ASSETS` collection and legacy coverage IDs. Use that collection and the coverage check for current counts; the catalog has expanded beyond the original 105-model milestone. It includes buildings, house variants, vegetation, geology, roads, supplies, residents, livestock, crops and construction/growth stages.

Day/night images use the same geometry with scene lighting. Portrait, idle and activity atlas entries refer to the same authored resident. The collection cards and sprite proofs remain static art studies. The land preview now has articulated resident motion and prop interaction rehearsals; it does not recreate v1 simulation or production behavior. Residents retain the approved scale-study body as requested; they are not a character creator. Species are stylized representations, not botanical models.

Archived references, rejected images and earlier prototypes are deliberately excluded. The original five model recipes remain intact. House study 03 is unchanged. New housing uses authored structural variations; randomized accessories remain deferred.

## Review

- `/v2/library/`: the complete collection, category filters, four rotations, shared scale and optional enlarged detail previews. Click a card to inspect the live model.
- `/v2/workshop/`: the full catalog, orbit, wireframe, scale reference, day/night and four-view sprite proof. Export remains optional; the land uses live geometry.
- `/v2/land/`: all models placed on a 64×64-cell editable plot. See its README for controls and scene storage.

Geometry uses metres, two metres per cell, the existing warm palette, faceted foliage and the approved barrel-tile recipe. Static meshes are combined by material in the land/gallery to reduce draw calls without changing geometry. Transparent greenhouse panels keep separate materials. New models remain studies open to art direction; inventory coverage is not a claim of final art approval.

Run `node scripts/verify-v02-library.mjs` and `node scripts/verify-v02-models.mjs` for inventory coverage, finite geometry, ground bounds, geometry-preserving batching, serialization, all four camera projections and edit history. `verify-v02-exports.mjs` checks the five existing exported reference sheets, not new PNG exports.

See [art revision 02](../../../assets/art-direction/v02/art-revision-02.md) for proportions, species references and whole-map shadows. Run `node scripts/verify-v02-art-revisions.mjs` and `node scripts/verify-v02-consistency.mjs` for the corresponding geometry gates.

## Local gathering patches

The **Gathering** category contains five low-poly subjects and their gathered states: fruit thickets, fallen wood, bamboo, forage grasses and loose stones. They share the existing material pool, metre scale and shadows; no ground platforms or raster textures are added. The regular game generates biome-appropriate patches and uses resident production, tending animation and physical return hauling. Supplies enter the existing ingredients, raw wood, bamboo, fodder and stone inventories.

Fruit, bamboo and grass recover after 30, 365 and 14 game days respectively. Fallen wood and loose stones have finite quantities. These are authored game estimates, not botanical yield claims. Select a patch and choose **Gather resources**, or find it in Resources; repeat-to-stock-target uses the existing production policy. Old villages gain patches in free locations on their next simulation tick without moving existing objects.

Validation: `node scripts/verify-v02-gathering.mjs` covers three-biome placement, additive migration, resident labor, physical hauling, finite supply, cooldowns, duplicate jobs and saves. Library/model/consistency checks cover all ten models. Initial gallery silhouettes were reviewed in the in-app browser; subsequent branch scattering and bamboo ground-clearance corrections have geometry verification only. A regular-game visual gathering check remains pending because browser control became unavailable during review.
