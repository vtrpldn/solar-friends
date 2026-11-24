# Solar Friends

A low-poly 3D ecovila simulation about friends building a community in the Brazilian countryside.

## Why

The game focuses on village planning and resource tradeoffs. Residents do the physical work while balancing their own needs.

## Play and run locally

- [Play Solar Friends](https://solar-friends.paladini.dev/v2/)

```sh
npm install
npm run dev
```

Open http://127.0.0.1:4173/v2/. `npm run dev` reloads the page when game files change and swaps edited stylesheets into the running page without a reload; `npm run dev:serve` is a plain static server. The playable game has no `/weekend` prefix; source directories retain their historical names, including `web/v02/weekend`.

The game is plain JavaScript and needs no build step to run. `npm run build:site` packages the web files into `dist/v2` for Netlify.

## Current v2

- Story uses resources, money for purchases and utility bills, resident labor and autonomous needs. Sandbox has separate saves, replenishing supplies and optional instant construction.
- New-game settings control biome, terrain, water, resource abundance, starting savings/supplies and town distance. Procedural maps are 128×128 cells; three Brazilian biomes are available.
- Construction uses physical materials, hauling and assembly. Residents drive to town for purchases. Blueprint auto-buy is optional; roads also require construction.
- Local extraction, selected tree cutting, cultivation, manufacturing, farming and individual animals support the economy. Water collection/treatment, sanitation, grid electricity and renewable generation support the village.
- Resources → **Village work & trade** configures protected surplus sales, work priorities and reserved workers. Production sites have stock targets. Residents still meet their needs first.
- Named saves, recovery/export, management dialogs, resource trends, terrain tools, rotatable placement previews and contextual building controls support planning.
- The UI reflows for smaller and shorter windows. Desktop remains the primary platform; current layout checks cover 800×600, 1000×750 and 1280×720, not touch or phone gameplay.

See the [v2 gameplay and development guide](web/v02/weekend/README.md) for details and limitations.

## Tools and code

| Route | Purpose | Source |
| --- | --- | --- |
| `/v2/` | Playable game and menu | `web/v02/weekend/` |
| `/v2/library/` | Search the 3D collection | `web/v02/library/` |
| `/v2/workshop/` | Inspect models, rotations and exports | `web/v02/workshop/` |
| `/v2/land/` | Editable asset garden and interaction rehearsals | `web/v02/land/` |
| `/v2/residents/` | Resident model and animation studies | `web/v02/residents/` |
| `/v2/lab.html` | Isolated accelerated balance lab | `web/v02/weekend/lab*` |

The playable game is JavaScript with Three.js rendering. `simulation.js` owns serializable simulation rules; `catalog-rules.js` owns recipes; the infrastructure modules own water, power and sanitation. `responsive.css` adjusts layout without changing simulation behavior. Model recipes and articulated rigs are shared with the art tools.

## Validation and deployment

```sh
node scripts/verify-v02-economy-policies.mjs
node scripts/verify-v02-economic-recovery.mjs
node scripts/verify-v02-urgent-needs.mjs
node scripts/verify-v02-playtest-fixes.mjs
node scripts/verify-v02-lab.mjs
npm run build:site
git diff --check
```

`npm run check:changed` runs, in parallel, only the `verify-*` checks whose imports reach the files you changed (every browser check when game files changed) and reports all failures together. `npm run check` runs the whole suite the same way, as CI does; add words to filter by name (`npm run check -- needs trade`), `--no-browser` to skip Playwright checks, or `--list` to preview the selection.

Choose additional `scripts/verify-v02-*.mjs` checks for the changed subsystem. Historical checks may encode older design assumptions; investigate failures rather than claiming the entire suite passes. The recovery replay uses an existing normal-game save and automated ticks; it is not a manual browser playthrough. UI changes need rendered browser checks.

Netlify deploys `main` through the GitHub integration using `netlify.toml`. A push is not proof of publication: verify the deployed files and live UI after the build finishes. Never merge a PR without explicit approval.

## Documentation

Start with the [documentation index](docs/README.md). The [realistic economy plan](docs/realistic-economy-plan.md) records the implemented model and its deliberate boundaries; the [calibration validation report](docs/balance/2026-11-17-economy-validation.md) separates current-price fresh starts, normal-command catalog progression, diagnostic cycles and browser observations. Dated audits preserve earlier decisions and evidence; they are not the current specification. The calibration register distinguishes researched price references from engineering and gameplay assumptions; these are not real-world construction or agricultural instructions.
