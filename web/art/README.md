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
