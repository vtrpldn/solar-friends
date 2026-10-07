---
description: Provenance and generation prompts for the Solar Friends prototype sprites.
---

# Village sprites

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

The active scenery files are `village-atlas-isometric.png`, `mango-tree-isometric.png`, and `cistern-isometric.png`. They were edited with the built-in image generation tool from the original sprites. Original files remain available as references. `web/projection.js` defines the scene's 2:1 orthographic ground axes, also used by placement and construction scaffolding. The renderer preserves square sprite proportions and anchors each object at its ground footprint rather than its lowest painted pixel.

Atlas edit prompt: Preserve the four Brazilian painted subjects in the same 2×2 layout. Correct ground edges to parallel vectors (2,1) and (-2,1), upright verticals, no vanishing points, one shared elevated orthographic camera. Align foundations, eaves, roof ridges, furniture, and garden rows. Keep solar panels coplanar with roofs. Show upper banana leaf surfaces. Preserve warm upper-left lighting, transparent background, and no external shadows. A second layout-only pass reduced each object uniformly to provide transparent gutters inside every quadrant.

Tree edit prompt: Change the front-facing mango illustration to an elevated orthographic view, looking down onto a rounded crown with rear branches occluded. Keep trunk upright, visible upper leaf surfaces, brown branching wood and golden fruit. A circular root patch projects to a 2:1 ellipse. Preserve the painted style and transparent background, with no scenery or glow.

Cistern edit prompt: Isolate the original teal rainwater tank. Correct its top and bands to concentric 2:1 ellipses with vertical cylinder sides, and align the stone foundation with the ground axes. Preserve the brass tap, plants, warm painted materials, upper-left light, and true transparency.
