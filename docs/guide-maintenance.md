---
description: Keep the diagram-first in-game Guide consistent with current simulation behavior.
---
# Guide maintenance

## Why

Players use the Guide to make resource decisions. A diagram that promises an unavailable output or misses an import requirement can invalidate those decisions.

The Guide button opens a paused desktop dialog. Its current-system diagrams and autonomy tips are in [topics.json](../web/v02/weekend/guide/topics.json). Crop durations, shelf lives, compost recipe quantities and grid facts read the simulation definitions through [guide-facts.js](../web/v02/weekend/guide-facts.js). Planned mechanics belong in the [implementation plan](autonomy-implementation-plan.md), not as available actions in the Guide.

## Changing a mechanic

1. Read the affected topic diagrams, concise explanation, autonomy tip and boundary against the changed source and scenario tests. Add a topic or map a new system to an existing topic. Update its source/test references.
2. Run `npm run guide:refresh -- --reviewed`. This uses the pinned development-only Mermaid renderer and a muted Chromium browser to generate bundled SVGs and record the reviewed source/content/asset fingerprints. Install Chromium with `npx playwright install chromium` if needed.
3. Run `npm run guide:check`, `node scripts/verify-v02-guide.mjs` and `node scripts/verify-v02-guide-browser.mjs`. Inspect the affected chart at desktop gameplay scale. Commit content, generated assets and review record alongside the mechanic.

The checker covers all runtime JavaScript modules in the active game directory and follows local JavaScript imports into shared definitions. New runtime modules are detected. Guide content, generated SVGs, the renderer and the dependency lockfile are also checked. Ordinary site builds and CI verify the record; they never refresh it automatically. The dependency scan is deliberately conservative, so some presentation-only changes also require a review.

A fingerprint detects an unreviewed change; it cannot prove that prose is true. The `--reviewed` acknowledgement must follow actual source review. Do not update fingerprints merely to silence CI. No external diagram CDN or renderer is loaded by the game.
