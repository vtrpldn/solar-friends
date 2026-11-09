# Solar Friends

A low-poly 3D ecovila simulation about friends building a community in the Brazilian countryside. **v2 is the active game.** The original painted, Rust-based exploration remains available as v1; its code and documentation are preserved.

## Why

The game focuses on village planning and resource tradeoffs. Residents do the physical work while balancing their own needs. v2 is a new implementation informed by v1, not a refactor of its simulation.

## Play and run locally

- [Play v2](https://solar-friends.paladini.dev/v2/)
- [Play v1](https://solar-friends.paladini.dev/v1/)

```sh
npm install
npm run dev:serve
```

Open http://127.0.0.1:4173/v2/. The local server and production use `/v1/` and `/v2/`; the playable v2 has no `/weekend` prefix. Source directories retain their historical names, including `web/v02/weekend`.

For changes to the v1 Rust engine, install the pinned Rust toolchain and `wasm-bindgen-cli` 0.2.100, then run `bash scripts/build.sh`. Serving v2's JavaScript does not require rebuilding v1. `npm run build:site` packages the web files into `dist/v1` and `dist/v2`; the Netlify build also compiles the Rust engine.

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
| `/v1/` | Original exploration | `src/` and other `web/` files |

The playable game is JavaScript with Three.js rendering. `simulation.js` owns serializable simulation rules; `catalog-rules.js` owns recipes; the infrastructure modules own water, power and sanitation. `responsive.css` adjusts layout without changing simulation behavior. Model recipes and articulated rigs are shared with the art tools.

## Validation and deployment

```sh
node scripts/verify-v02-economy-policies.mjs
node scripts/verify-v02-economy-soak.mjs
node scripts/verify-v02-urgent-needs.mjs
node scripts/verify-v02-playtest-fixes.mjs
node scripts/verify-v02-lab.mjs
npm run build:site
git diff --check
```

Choose additional `scripts/verify-v02-*.mjs` checks for the changed subsystem. Historical checks may encode older design assumptions; investigate failures rather than claiming the entire suite passes. The three-day economy replay uses an existing normal-game save and automated ticks; it is not a manual browser playthrough. UI changes need rendered browser checks.

Netlify deploys `main` through the GitHub integration using `netlify.toml`. A push is not proof of publication: verify the deployed files and live UI after the build finishes. Never merge a PR without explicit approval.

## Documentation

Start with the [documentation index](docs/README.md). The [v1 reference](V1.md), root plans, and dated audits preserve earlier decisions and evidence; they are not the current v2 specification. Prices, timings and production yields are game-balance assumptions, not real-world engineering guidance.
