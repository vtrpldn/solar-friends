---
description: Canonical sprite sizes, camera calibration, and prompts for the artwork consistency pass.
---

# Artwork consistency

## Why

Small utility structures need to read at a plausible size beside homes and residents. The game, placement ghosts, and artwork studio use [building-art.js](../../web/building-art.js) for source crops, widths, ground anchors, and camera calibration. Library thumbnails use one common scale; the focus bench defaults to game scale.

## Canonical assets

The library contains 28 entries backed by 16 source images. Obsolete village and mango variants are removed; Git retains their history. Unused garden and cistern cells remain embedded in atlases needed by active assets, but have no library entry. Portraits and animated residents have different active uses.

| Structure | Source-cell width at zoom 1 |
| --- | ---: |
| Home / kitchen | 179.36 px |
| Community square | 172 px |
| Workshop | 158 px |
| Garden | 140.42 px |
| Banana grove | 123.9 px |
| Coop | 100 px |
| Compost | 78 px |
| Cistern | 77 px |

Widths include transparent padding. Compare painted objects in the studio at game scale. A compost bin is about waist high beside a resident; a coop is smaller than a home.

## Camera calibration

The map uses a 2:1 orthographic game projection, with ground axes at slopes +0.5 and -0.5. This is the conventional game projection, not mathematical 30-degree isometry. Source `axes` values approximate the dominant painted ground-edge slopes. The shared Canvas transform preserves verticals and maps those two directions to the map axes. It does not prove that every painted edge is parallel: individual roof tiles, irregular timber, and the pergola still have local deviations. Exact architectural geometry would require a constrained model or a manually constructed source.

Run `node scripts/verify-artwork.mjs` for duplicate-file hashes, duplicate catalog crops, coverage, shared dimensions, relative-size bounds, and calibration arithmetic. The arithmetic check verifies the declared axes, not pixel-level geometry; inspect the artwork visually after replacing a PNG.

## Generation prompts

The built-in image-generation tool edited compost, workshop, coop, and square PNGs in [web/art](../../web/art/). Workshop, compost, and coop used their old sprite as edit target and the village atlas as style reference.

Shared prompt:

> Edit target image 1. Preserve this exact subject and its warm painted Brazilian ecovila style, terracotta/cream/teal palette, materials and upper-left illumination, matching reference image 2. Correct the camera to a rigorous 2:1 orthographic isometric GAME projection: all ground-plane rectangular edges parallel to screen vectors (2,1) and (-2,1), vertical posts perfectly vertical, no vanishing points, no perspective convergence. Equal axis foreshortening. Reconstruct geometry rather than keeping the current asymmetric perspective. Roof ridges, eaves, wall bases, furniture and horizontal beams must share these axes (sloped roof edges follow the pitched roof geometry). Single isolated object centered on square transparent canvas, entire silhouette within 8% padding. No text, grid, outlines, cast shadow outside footprint or added objects. Keep the same subject details, with slightly simplified small textures for readability.

Workshop suffix:

> Subject: the open-front woodworking workshop. Its ground foundation must be a symmetric diamond; the two visible ground axes have slopes exactly +0.5 and -0.5.

Compost suffix:

> Subject: two small waist-high wooden compost bays side by side with compost, scraps, a teal pail and garden fork. Strong symmetrical 2:1 ground axes. Simplify photorealistic wood grain to the softly painted cottage reference. Ground edge slopes +0.5 and -0.5. Do not make a building; these are small open bins.

Coop suffix:

> Subject: a small raised chicken coop with a short ramp. Rotate the building to equal 45-degree azimuth, showing equal foreshortening of the left and right walls. Ground axis slopes exactly +/-0.5, not the current asymmetric view. Retain the tiny doorway, teal shutter, terracotta roof and cream walls.

Final square prompt (old square as edit target):

> Rebuild this pergola sprite with CORRECT GEOMETRY, preserving the warm illustrated Brazilian palette, bunting, vines, two benches and table. Transparent square canvas. Essential change: FOUR posts form a perfect rectangular prism in 2:1 orthographic game isometric projection. On a nominal 1000x1000 canvas place four post FEET at back (500,450), left (180,610), right (820,610), front (500,770). Their TOPS are back (500,150), left (180,310), right (820,310), front (500,470). All four straight upright posts exactly same height. Join their tops with four straight horizontal wooden beams; all beam edges slopes +0.5 or -0.5, no perspective convergence. Front post must be centered x=500, NOT shifted right as in reference. Benches and table align to these SAME two ground axes. Keep generous clear transparent border. No grid or text or coordinate markers. Simplified painted style, not photorealistic.

Prompt constraints describe the requested output; the camera section records the actual limits of the delivered raster assets.

