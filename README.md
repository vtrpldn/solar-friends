---
description: Run and develop the Solar Friends browser ecovila prototype.
---

# Solar Friends

An isometric Brazilian ecovila where five residents balance community work with energy, hunger, interests, and social needs.

## Contents

- [Run locally](#run-locally)
- [Play](#play)
- [Village quests](#village-quests)
- [Implementation](#implementation)
- [Prototype scope](#prototype-scope)

## Run locally

Install Rust through [rustup](https://rustup.rs/), then run:

```sh
cargo install wasm-bindgen-cli --version 0.2.100 --locked
./scripts/build.sh
python3 -m http.server 4173 --bind 127.0.0.1 --directory web
```

Open [the village](http://127.0.0.1:4173). The pinned Rust toolchain includes the WebAssembly target. Reload the browser after rebuilding.

## Play

Choose a building in the bottom toolbar and click a clearing. Residents construct it autonomously, or you can select a resident and ask for help. People can refuse based on their energy or hunger. Explaining the community need can overcome reluctance, but never exhaustion.

Gardens need planting, watering, three game hours of growth in moist soil, and harvesting. Each watering costs two water and keeps soil moist for four game hours. Dry crops pause without dying. Residents gather fallen timber, carry river water, cook, rest, and socialize. Food forests add fruit to gathering. Multiple builders accelerate shared construction. The arrival tutorial starts on an empty 28×28 lot (784 tiles, roughly twice the previous 400). Build a cistern, two homes, a garden, and a kitchen, bring in a harvest, serve a prepared meal, and reach the next morning.

Arrival barrels store 40 water. Each completed cistern adds 75 capacity and catches rain. Afternoon rain runs from 14:00 to 17:00 on two days out of every three; every third day stays dry. Rain also waters planted gardens. Residents can collect 18 water per river trip even before a cistern exists. The resource panel shows capacity, weather, and garden needs; beds show crop stages and cisterns show the shared storage level. Older saves keep their supplies and start existing gardens as empty beds.

Open Settings (the gear button) to enable the placement grid. Tile guides appear only while a building tool is selected. Preferences are stored separately from village saves and survive a new village. The forest edge mixes stylized Mata Atlântica species: jequitibá, juçara, embaúba, and pau-brasil.

Drag to pan, scroll to zoom, press Space to pause, and use the bottom controls for speed. Escape cancels placement. Saves stay in this browser's local storage and happen every 15 seconds, after placement, and on leaving the tab. Save village writes immediately.

A day lasts eight minutes at 1×. Breakfast starts at 06:30, lunch at noon, dinner at 18:00, and staggered bedtimes begin at 21:30. Residents work in morning and afternoon blocks, with evenings for rest and company. The lighting changes continuously at dawn and dusk. Five individual sprite sheets animate walking, building, idling, and sitting. These are game-scaled routines, not a detailed biological model.

New village restarts the scenario after confirmation and retains one backup under `solar-friends-v2-backup`. Earlier prototype saves remain untouched under `solar-friends-v1`.

Existing 20×20 saves expand in place. A meandering river runs along the eastern edge, with animated currents, shallow banks, and stones. Construction is blocked along the riverbank so buildings and their approach points remain on the village side.

## Village quests

The journal starts with **A Shared Beginning**: arrive, build water and shelter, harvest, serve a cooked meal, and reach the next morning. Completion unlocks food forests and three parallel quests. Follow one quest on screen; all available quests progress together. Recorded earlier efforts count, and completed quests remain complete.

| Quest | Objectives | Reward |
| --- | --- | --- |
| Roots for Tomorrow | Finish a food forest and gather six fruit. | Compost station (20 timber). Cooking produces scraps; two scraps make one compost, which adds three food to the next garden harvest. |
| A Place to Gather | Serve five meals, complete a social break with each neighbour, and host a welcome supper at the kitchen. | Community square (36 timber) for repeat gatherings. |
| Made by Our Hands | Gather 40 timber, contribute 24 timber to a tool library, and finish a building with at least two contributors. | Workshop (48 timber). Eight timber makes twelve tool uses. |

Gatherings cost five prepared meals and require at least three rested, fed neighbours. Start between 08:00 and 18:00, at most once per day. They last two game hours; at least three neighbours must reach the venue. Attendees gain connection, fullness, and mutual friendship memories visible in resident details. The welcome supper uses the kitchen; later gatherings use the square.

Tools add two timber or food per timber-gathering or gardening task, or make construction 25% faster. Each finished task or building consumes one use. The community panel lets you conserve tools, inspect compost supplies, and host gatherings. Residents can make compost and tools autonomously or on request. Tool stock is capped at 36 uses.

Existing saves keep their buildings and arrival milestones. New activity counters start at zero when absent from an older save; the journal, unlocks, tools, and friendships persist in the same village save.

## Implementation

Rust owns simulation and validated saves. Bevy App and ECS schedule systems and store resident entities. `wasm-bindgen` exposes the game to the browser. Canvas 2D draws the isometric world; HTML provides the controls and resident details. This slice uses Bevy's simulation modules, not its GPU renderer.

- `src/lib.rs`: simulation, requests, construction, saves, and tests.
- `src/progression.rs`: persistent quest milestones and building unlocks.
- `web/quests.js`: quest stories, objectives, and reward descriptions.
- `web/main.js`: canvas rendering, input, and browser persistence.
- `web/style.css`: desktop interface.
- `web/art/`: generated transparent game sprites.
- `assets/art-direction/`: approved concept and visual constraints.

Run `cargo test --locked` for resource accounting, refusal, construction/harvest progression, and save validation. Run `cargo fmt --check` and `cargo clippy --locked -- -D warnings` before pushing. GitHub Actions builds and tests the same WASM artifact. After building, `node scripts/verify-quests.mjs` (Node 22+) completes all four quests through the public game API and checks the reward mechanics. Pass an output directory to save its playthrough checkpoints for browser testing.

## Prototype scope

This is a small playable slice. Resident movement follows direct paths; collision-aware navigation, deeper relationship stories, skill progression, weather, budgets, and the full first-year scenario are future work. Each home provides three beds; residents without a bed sleep outdoors and recover more slowly. Socializing currently restores the acting resident's social need. No multiplayer or cloud saves.

Artwork was generated with OpenAI's built-in image generation tool using the user-approved Brazilian ecovila concept. The browser game uses separate sprites rather than displaying the concept as a background.

## Artwork studio

Open [the artwork studio](http://127.0.0.1:4173/artwork/) on the same local server. It works without a WebAssembly build. Browse all 18 artwork files as 36 individual sprite entries, including atlas cells, resident animations, archived references, and the game's procedural chickens.

Select a sprite, pin up to three comparisons, and inspect transparency, palette, ground alignment, and relative game scale. Use the action and frame controls to compare resident poses. Reviews and notes are saved in this browser separately from village saves; **Export review** downloads a JSON handoff. This is a review tool: it does not alter artwork or renderer settings.

Add new sprites and their crop/scale metadata to `web/artwork/catalog.js`. Run `node scripts/verify-artwork.mjs` to catch uncatalogued files, missing sources, duplicate IDs, and invalid crop bounds. Runtime sprite dimensions are recorded in the catalog; update them when the game renderer changes.
