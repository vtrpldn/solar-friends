# Collection art revision 02

## Why

Player feedback reopened the proportions, identity and shadow review. Inventory completeness alone did not make the first recreation pass visually convincing.

## Changes

- All six houses use a 2×2 footprint. Porches are recessed into the same four-metre square; the original approved house is unchanged. Other houses now share its arched doors, framed crossbar windows, shutters, sills and clay-roof detailing. Adobe variants use masonry corner courses.
- Goats have a connected torso/neck/muzzle, slimmer jointed legs, dark hooves, lateral ears, swept-back horns and a beard. The pasture uses the same goat model.
- Solar farm: 3×2 cells, six tilted modules in two braced rows, shared rails, wiring and inverter. Compost: 3×1 cells and three distinct bins.
- Square: circular tile mosaic, three benches, flowering pots and noticeboard. No pergola or artificial foundation platform.
- Shed remains the open reference shelter. Workshop is an enclosed carpentry shop with wide doors; kitchen has masonry worktops, an oven and tall chimney.
- Greenhouse has visibly tinted transparent wall, roof and gable panels. Transparent panels remain separate during batching for depth sorting and do not cast opaque slab shadows.
- River generator has a supported platform, open-spoke wheel with radial paddles, axle, finned generator and electrical cabinet.
- Cistern replaces the narrow blue tank with a broad whitewashed plate-built form, shallow cover, hatch and plumbing. Its visible body uses the reference's 1.73 m radius and 1.20 m above-ground height; buried construction is not modeled. It occupies 2×2 cells.
- Named trees have distinct branching and leaf structures: pinnate juçara fronds, open embaúba branches with lobed leaves, high jequitibá crowns, low spreading umbu crowns, crooked cerrado trunks and finer jurema branches. Tree heights remain stylized for the art preview rather than full mature botanical scale.

## References

- [MDS plate-cistern construction reference](https://www.mds.gov.br/webarquivos/legislacao/seguranca_alimentar/cisternas_marcolegal/ModeloTecSocial_n01_Cisterna16millt_062015.pdf), page 7 dimensions and pages 13–14 whitewash/roof/plumbing. Used for visual form and scale, not engineering simulation.
- [Jequitibá-rosa species description](https://arvores.pequiambiental.com.br/especie/jequitiba-rosa-cariniana-legalis/): straight trunk, broad high crown and bark.
- [Embaúba species description](https://arvores.pequiambiental.com.br/especie/embauba-cecropia-pachystachya/): pale ringed trunk, open branches and lobed leaves.
- [Embrapa ornamental Caatinga plants](https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/969169/1/Plantas-ornamentais-da-caatinga.pdf): umbu umbrella crown.
- [Embrapa Jurema-preta](https://www.embrapa.br/en/web/agencia-de-informacao-tecnologica/tematicas/bioma-caatinga/flora/madeireiras/jurema-preta): small tree habit. These are stylized species cues, not a botanical identification key.

## Shadow correction

The old directional shadow camera covered a 50 m square centered on the camera target. Visible models beyond that square stopped casting shadows. The new fixed sun camera encloses the entire 128 m plot and canopy height, with a 4096-pixel shadow map. Panning and zooming no longer move the shadow boundary.

## Checks

`verify-v02-art-revisions.mjs` checks all house footprints and foundation bounds, six panels, three bins, independently sorted transparent panels and map-wide shadow-camera coverage at ground and canopy height. The existing full-collection geometry checks cover all four rotations and JSON roundtrips. Browser review covers houses, goats, utility buildings, trees, clear greenhouse glazing and off-center shadows. This revision is ready for player review; that does not imply player approval.

## Full collection consistency pass

Reviewed every category at shared scale, with enlarged views for small props. Measured all 89 models. Reduced jurema from 3,476 to 1,856 triangles by removing unnecessary subdivision from its small leaf clusters; its branching silhouette stays intact. Banana blades now have tapered, curved midribs (16 triangles per blade instead of four flat triangles). Rebuilt the storage house to use its full 2×2 depth; the coop is 2×2 so its access ramp is included in placement.

`verify-v02-consistency.mjs` checks role-based triangle budgets, footprint overhang limits, grounded geometry, comparable house/resident heights and increasing crop stages. Houses range from 4,160 to 4,652 triangles. Budgets differ by visual role: roofs need more geometry than ground tiles or individual crops. These checks prevent measurable drift; they do not replace visual judgment. Use `--json` for the full dimensions and triangle inventory.

## Everyday props extension

Added 16 independently placeable models in the **Props** category: rainwater barrel, watering can, wheelbarrow, tool rack, seedling bench, firewood, picnic table, garden bench, clothesline, hammock, bicycle, produce crates, wayfinding sign, wash station, farm gate and unlit fire circle. These use the existing material palette, metric scale and coarse geometry. No automatic house decoration or simulation behavior is introduced.

The collection now contains 105 assets. The gallery uses 12 columns at five-cell spacing to fit all assets inside the 64×64 plot. Existing saved compositions retain their coordinates; Restore gallery loads the expanded arrangement and is undoable. New models are always available in the asset library. Full-collection checks pass at 420 cardinal rotations; browser review includes the Props contact sheet at shared scale and enlarged detail from two angles.
