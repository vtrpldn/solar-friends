---
description: Provenance and generation prompts for the Solar Friends prototype sprites.
---

# Village sprites

## Resident motion and standing idles

The five `animations/*-idle.png` sheets add four standing activities: looking around, stretching, waving, and hands-on-hips weight shifts. Each sheet has four columns and four rows, in that order. They were generated with the built-in image tool using the corresponding original resident sheet as the identity reference.

The shared [resident animation renderer](../resident-animation.js) blends adjacent keyframes and eases activity changes over 180 milliseconds. An isolated additive blend preserves opacity; the original four walk keyframes remain the source. Gestures play once and settle into a neutral pose between activities. Idle selection is staggered by resident ID and saved village time. Walking retains its last facing when the resident stops. Meals, rest, and sleep keep seated poses; socializing and gatherings use standing gestures. Pause and open dialogs stop the visual clock, and high simulation speeds cap visual playback at 2×.

The studio previews the same clips, with named standing-action controls. [Resident preview](http://127.0.0.1:4173/?resident-preview) starts paused with five idle residents; press Play to watch. It uses an isolated fixture and never writes the village save. Run `node scripts/verify-resident-animation.mjs` to check pose selection, interpolation weights, transitions, facing, pause behavior, and fixture restoration.

Generation prompt (one call per resident):

> Create an additional IDLE ANIMATION SPRITE SHEET for the SAME resident in the reference. Preserve exact face, skin tone, clothing, hair/headwear, footwear, painted style, elevated orthographic view and screen-right facing. Square transparent PNG, strict FOUR columns by FOUR rows, 16 full-body poses, one figure centered inside each equal square cell. Consistent size and foot baseline at 94% cell height, head height about 20% leaving space for raised arms, 12% side padding. NO cropped heads/limbs, no overlapping cells, no shadows or backdrop or labels. Each row is a coherent animation of the same action, four sequential poses, with grounded feet and small movement increments. Row 1: standing, calmly looking around (forward, turn head slightly left, look slightly up, return forward). Row 2: gentle shoulder/arm stretch (hands relaxed, hands lift to shoulder level, arms reaching upward, relax). Row 3: friendly one-hand wave (arm at side, hand raising, hand open greeting at shoulder height, hand returning). Row 4: relaxed hands-on-hips weight shift (arms relaxed, hands to hips, slight comfortable shift, return). All poses STANDING. No stools, chairs, tools, objects, scenery or text. Match identity absolutely. Warm softly painted Brazilian ecovila game character. True transparent background outside figures, broad clear gutters.


Generated using OpenAI's built-in image generation tool with the approved Brazilian ecovila concept in `assets/art-direction/brazilian-ecovila-approved.png` as the reference. Both PNGs have transparent backgrounds. The browser draws the atlas quadrants directly, without modifying the original generated pixels.

## Village atlas prompt

Create a production game sprite atlas with transparent background, based on the Brazilian ecovila illustration reference. Canvas exactly square, arranged as 2 columns and 2 rows of equal-size cells. Four fully isolated objects, one object per cell, with ample transparent padding and no overlap between cells. TOP LEFT: one modest Brazilian cream limewashed cottage, orange clay tile roof with small blue solar panel, shaded veranda on timber posts, turquoise door. TOP RIGHT: one Brazilian open-sided communal kitchen pavilion, orange clay tile roof, timber posts, a table underneath. BOTTOM LEFT: small rectangular vegetable plot with simple timber edging and rows of lush vegetables growing on reddish soil. BOTTOM RIGHT: one lush banana plant clump, large graphic paddle leaves and brown stems. Each object centered in its quadrant, consistent orthographic isometric view facing the same direction, warm softly painted 2D illustration, clean silhouettes, simplified details but match the reference palette and charm. NO people, no surrounding scenery, no background ground beyond each object's footprint, no shadows beyond footprint, no labels, no borders, no text. Objects must be fully visible and separated by transparent gutters; a usable game atlas.

## Mango tree prompt

A single isolated mature Brazilian mango shade tree as a production sprite for the isometric 2D ecovila game in the reference. Fully visible tree centered on a transparent square canvas with 8 percent padding around all edges. Thick branching warm brown trunk, broad rounded canopy of simplified large leaf clusters, a few subtle golden mangoes, small patch of grass at the roots. Same warm illustrated style and muted green palette as the reference, painterly but simplified crisp silhouette. Orthographic isometric game view looking down about 30 degrees. No other objects, no people, no house, no scenery, no text, no ground plane, transparent background.

## Terrain and resident style pass

`terrain-atlas.png` contains two overhead material swatches: a patchy Brazilian meadow and worn red earth. The terrain renderer projects these into the same isometric coordinates as buildings. Paths connect building entrances, and an irregular feathered perimeter replaces the hard diamond edge. Terrain is painted into a cached canvas only when the building layout changes.

`residents-cistern.png` contains five residents and a cistern in a three-column, two-row atlas. The same resident artwork supplies the community portraits. All scene assets use the approved concept's warm light, painted materials, and earthy palette; contact shadows use a shared soft treatment. The HTML panels retain quiet cream surfaces for legibility.

Terrain generation prompt: Production texture atlas for the Brazilian ecovila game. Exactly two equal square panels side by side, overhead ground surfaces. Left: warm meadow, softly painted olive and leafy-green grass clumps, patchy ochre/reddish soil, small leaves and pebbles. Right: compacted terracotta/ochre earth, mottled brushwork, tiny gravel and sparse blades. Match the approved buildings' painterly material richness. No objects, horizon, cast shadows, grid, borders or text. Low-to-medium contrast, even lighting.

Resident generation prompt: Transparent three-column, two-row atlas matching the approved illustration, with five full-body Brazilian residents and one teal cistern. Iara wears a straw hat and mustard shirt; Bento a teal shirt and cream trousers; Luz a terracotta shirt and apron; Cauã a straw hat and sage shirt; Nina a lavender shirt and olive trousers. Use varied brown skin tones, warm painted shading, isometric view, consistent scale and baseline, isolated silhouettes. No background, labels or cell borders. A subsequent background-extraction edit preserved the objects and removed pixels outside their silhouettes.

## Resident animations

`animations/{iara,bento,luz,caua,nina}.png` were generated with the built-in image tool using `residents-cistern.png` as the character reference. Each transparent 4×4 sheet contains four frames per row: walking, building with a wooden mallet, quiet idle poses, and sitting on a wooden stool. The fourth seated pose closes the eyes for outdoor sleep.

Generation prompt: match the corresponding resident's face, clothing, palette, and painted Brazilian ecovila style. Use a uniform four-column, four-row grid, consistent foot baselines, transparent background, no labels, scenery, or glow. Walking alternates strides; building raises and swings a mallet; idle uses subtle breathing and head turns; sitting shifts between relaxed poses. Runtime selects rows by task and mirrors the sheet for travel direction.

## Isometric alignment pass

The active building atlas and tank are `village-atlas-isometric.png` and `cistern-isometric.png`. They were edited with the built-in image generation tool from the original sprites. Obsolete village and mango variants are retained only in Git history. `web/projection.js` defines the scene's 2:1 orthographic ground axes, also used by placement and construction scaffolding. The renderer uses shared scale, ground anchors, and camera calibration from `web/building-art.js`. See [artwork consistency](../../assets/art-direction/artwork-consistency.md) for the current sizes, replacement prompts, and limits of painted geometry.

Atlas edit prompt: Preserve the four Brazilian painted subjects in the same 2×2 layout. Correct ground edges to parallel vectors (2,1) and (-2,1), upright verticals, no vanishing points, one shared elevated orthographic camera. Align foundations, eaves, roof ridges, furniture, and garden rows. Keep solar panels coplanar with roofs. Show upper banana leaf surfaces. Preserve warm upper-left lighting, transparent background, and no external shadows. A second layout-only pass reduced each object uniformly to provide transparent gutters inside every quadrant.

Tree edit prompt: Change the front-facing mango illustration to an elevated orthographic view, looking down onto a rounded crown with rear branches occluded. Keep trunk upright, visible upper leaf surfaces, brown branching wood and golden fruit. A circular root patch projects to a 2:1 ellipse. Preserve the painted style and transparent background, with no scenery or glow.

Cistern edit prompt: Isolate the original teal rainwater tank. Correct its top and bands to concentric 2:1 ellipses with vertical cylinder sides, and align the stone foundation with the ground axes. Preserve the brass tap, plants, warm painted materials, upper-left light, and true transparency.

## Mata Atlântica perimeter vegetation

`mata-atlantica-atlas.png` replaces the repeated mango/banana perimeter scenery with four stylized native silhouettes: jequitibá-rosa, juçara, embaúba, and pau-brasil. The planted food-forest building remains cultivated vegetation. Species have different crown shapes, leaf textures, widths, and deterministic size variation. These are illustrative game sprites, not botanical identification plates.

Generated with the built-in image tool, using the previous isometric mango sprite only as a style reference. Prompt: transparent equal-cell 2×2 atlas, top-left jequitibá with broad layered crown and thick grey-brown trunk; top-right single-stem juçara with pinnate fronds and dark fruit; bottom-left embaúba with pale branches and large silvery palmate leaves; bottom-right pau-brasil with reddish trunk, small compound foliage and restrained yellow flowers. Match the warm painted palette, upper-left light, elevated 2:1 orthographic camera and root anchors. No backdrop, labels, shadows outside the footprint or grid. A second layout pass uniformly shrank each tree to provide transparent gutters.

Species context: [WWF Brasil’s Mata Atlântica overview](https://www.wwf.org.br/nossosconteudos/biomas/mata_atlantica/), [juçara and Atlantic Forest restoration](https://www.worldwildlife.org/news/perspectives/sustainability-works-hub/sustainability-works-index/thanking-our-forest-mothers-the-role-of-mother-trees-in-restoring-the-atlantic-forest/), and [UFSCar’s forest education guide](https://repositorio.ufscar.br/server/api/core/bitstreams/b21fb30c-aa45-4e8f-80b7-5253229d3f64/content).

## Simplified garden

`garden-simple-isometric.png` is the active garden artwork for the map, placement preview, and toolbar. Generated with the built-in image tool using the village atlas as a style reference. It removes fences, tall posts, trellises, fruit detail and the decorative grass border, leaving a low timber bed, open red soil, and a few broad leafy plants. Rendering calibrates the painted footprint's approximate 20:11 diagonals to the map's 2:1 ground axes and anchors it at the bed center.

Prompt: create only a simple square vegetable bed on transparency, warm painted Brazilian ecovila colors, low plain timber edging, three sparse planting rows and generous open soil. No fences, posts, tomatoes, trellises, flowers or tools. Ground corner targets on a 1000-pixel canvas: left (100,550), back (500,350), right (900,550), front (500,750), parallel lines, no convergence. Broad leaf shapes readable at game scale, restrained texture, upper-left light and no external shadow.


## Quest reward buildings

`compost-isometric.png`, `square-isometric.png`, and `workshop-isometric.png` are transparent sprites generated with the built-in image tool. The map, placement previews, toolbar, and journal reuse the same files. They follow the approved Brazilian palette and elevated orthographic camera. The [complete prompt set](../../assets/art-direction/quest-building-prompts.md) records each asset's subject and constraints. Starter buildings and the food forest reuse the existing artwork.

The chicken coop (`coop-isometric.png`) is generated with the built-in image tool, using the workshop and village atlas as direct style references for painted materials, terracotta tiles, warm lighting, and isometric perspective. The generation prompt is recorded in `assets/art-direction/chicken-coop-prompt.md`. Its three hens use `chickens.png`, a transparent three-column/two-row painted atlas, rendered through `web/chickens.js`. Columns are cream, ochre, and brown hens; rows are standing and pecking. Per-pose foot anchors keep both poses grounded. The simulation clock controls pecking and daytime roaming.

## Painted hens

The built-in image-generation tool produced `chickens.png` using the coop and village atlas as style references. The game and studio share its crop selection and drawing code. Each 512-pixel cell renders at a 26-pixel source width, including transparent padding.

Prompt: Create a production game animation sprite sheet of chickens matching the warm painted Brazilian ecovila style of the reference buildings. Only chickens, no buildings. Wide canvas 1536×1024, exactly three equal columns by two equal rows, each cell 512×512. One isolated hen per cell, transparent background and broad gutters. Columns: cream with buff shadows, ochre/rust, dark warm brown. Top row: standing. Bottom row: corresponding hen pecking. Face screen-right in the same elevated orthographic 2:1 camera, with visible back and side. Preserve body size and identity between poses. Small red comb and wattle, short golden beak, thin golden legs, simple tail and wing shapes. Soft painted feather masses, readable silhouettes at 16–22 screen pixels, upper-left lighting, earthy colors. No outlines, toy rendering, microtexture, chicks, eggs, straw, plants, nests, ground patches, cast shadows, text, grids, borders or scenery. Keep each bird inside its cell.

Open [the in-game artwork preview](http://127.0.0.1:4173/?artwork-preview) to compare all nine building types and three hens. It starts paused, restores its own fixture, and skips village saves and restart backups. Return to the normal game using the banner link.

## Night building variants

Why: buildings need readable nighttime identities, with warm occupied interiors and cool outdoor surfaces. Seven sibling `*-night.png` files cover all nine building types through the same atlas crops, widths, anchors, and camera calibration as their day sprites. The game fades them in using its existing sunrise/sunset curve. The coop stays dark inside for roosting hens.

Generated with the built-in image generation tool, editing each corresponding daytime PNG with transparency enabled. Original artwork is retained. Inspect all variants in the artwork studio or `/?night-preview`; the preview does not overwrite the saved village.

Prompt used for each source:

> Use case: lighting-weather. Edit target: the supplied transparent isometric game sprite. Create its nighttime lighting alternative. Preserve EXACT canvas layout, object positions, size, silhouette, padding, camera angle, geometry, all props and ground contact. Change lighting only: dim cool blue moonlight from upper left, readable deep blue shadows, subdued terracotta. No sky, background, text, moon, stars, people or new structures. Real transparent background. Keep painterly game style. For inhabited interiors only, gentle warm amber light from existing windows/openings; do not illuminate plants or storage bins internally.

Per-source additions:

- Village atlas: Keep the exact 2 by 2 atlas layout: home top left, kitchen top right, garden bottom left, banana grove bottom right. Warm home window slats and kitchen oven embers.
- Garden, cistern, compost: Moonlight only; no lamps or glowing objects.
- Square: An open seating area with two benches and a table. Its portable table lantern provides restrained warm night lighting. The pergola was removed with the built-in image tool; the [edit prompts](../../assets/art-direction/open-square-prompts.json) record the day and night changes.
- Workshop: Warm light on workbench from inside.
- Coop: Coop interior stays dark for sleeping chickens; moonlight only.

The selected compost revision used this corrective prompt:

> Edit the supplied DAYTIME compost station into a NIGHT variant. Change lighting only: uniformly cool dim blue moonlight. NO orange or yellow light ANYWHERE. Compost and spaces between wooden boards are dark brown/blue, completely unlit. There is no fire, electricity, lamp, ember, bioluminescence or internal light in this object. Keep exact silhouette, layout, scale, padding, isometric camera, all props and canvas dimensions. Real transparent background. Painterly game sprite.


## Solar power assets

The built-in image-generation tool produced `solar-farm.png`, `solar-farm-night.png`, `streetlight.png`, and `streetlight-night.png` using existing village buildings as style references. Exact prompts and source paths are in [solar-power-prompts.json](../../assets/art-direction/solar-power-prompts.json). They share calibrated day/night geometry, transparent backgrounds, and the village palette. The farm renders at 188 px source width; the street light at 80 px, including transparent padding. The lamp is dark during the day and emits warm light only when shared power is available at night.
