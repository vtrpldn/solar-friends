# Bunchgrass contrast correction

## Why

The minimum Cerrado bunchgrass disappeared into detailed yellow-green ground. A contact-shadow trial failed. Preserve the original size and ground anchor while correcting the painted silhouette.

## Inputs and output

- Style and subject reference: `web/art/cerrado-vegetation-v1.png`, bottom-left tuft; other atlas members are not edit targets.
- Tool: built-in image generation, true transparency.
- Generated source: `/Users/paladini/.codex/generated_images/01a11850-aab0-75a0-b902-a89978581239/exec-c4cf9f54-121d-42f9-9bc7-4755c863795d.png`.
- Candidate: `candidate.png`, copied unchanged into `web/art/cerrado-bunchgrass-v2.png`.
- Integration uses independent crop and uniform scale, no raster warping or recoloring.

## Prompt

Use case: precise-object-edit / game sprite correction. Input image is a STYLE AND SUBJECT REFERENCE: an existing Solar Friends painted Cerrado vegetation atlas. Produce ONLY the bottom-left Cerrado bunchgrass tuft as a SINGLE standalone sprite, centered on a truly transparent square canvas. Do not include either tree or the shrub or any labels. Preserve its natural rounded grass clump, arching slender leaves, several golden seed heads, Brazilian countryside warm painted illustration, upper-left light, and elevated 2:1 isometric game camera. Correct ONE issue: at tiny gameplay scale the yellow-green tuft disappears into yellow-green terrain. Group the lower leaves into legible deep olive green masses, give a few outer leaves rich dark olive edges and keep restrained warm gold highlights/seed heads. Broad readable painted shapes, fewer distracting micro-strands, same natural proportions; do not make a giant ornamental bush. Keep the whole tuft and seed heads visible with generous transparent margin. NO ground mound, dirt island, stone, pot, outline sticker, glow, platform, cast shadow disk, photorealism, 3D plastic or background. It must feel painted by the same artist as the referenced trees. This is a separate candidate sprite, not a replacement atlas.

## Review

See `assets/validation/bunchgrass-contrast-v2/review.json`: all 27 boards individually inspected, 81 compositions. Accepted as an incremental contrast correction, not closure of all low-plant readability.
