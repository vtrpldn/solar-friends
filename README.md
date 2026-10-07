---
description: Run and develop the Solar Friends browser ecovila prototype.
---

# Solar Friends

An isometric Brazilian ecovila where five residents balance community work with energy, hunger, interests, and social needs.

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

Gardens use water to produce food. Residents gather fallen timber, refill water, cook, rest, and socialize. Food forests add fruit to gathering. Multiple builders accelerate shared construction. The arrival tutorial starts on an empty 28×28 lot (784 tiles, roughly twice the previous 400). Build a cistern, two homes, a garden, and a kitchen, bring in a harvest, serve a prepared meal, and reach the next morning.

Open Settings (the gear button) to enable the placement grid. Tile guides appear only while a building tool is selected. Preferences are stored separately from village saves and survive a new tutorial. The forest edge mixes stylized Mata Atlântica species: jequitibá, juçara, embaúba, and pau-brasil.

Drag to pan, scroll to zoom, press Space to pause, and use the bottom controls for speed. Escape cancels placement. Saves stay in this browser's local storage and happen every 15 seconds, after placement, and on leaving the tab. Save village writes immediately.

A day lasts eight minutes at 1×. Breakfast starts at 06:30, lunch at noon, dinner at 18:00, and staggered bedtimes begin at 21:30. Residents work in morning and afternoon blocks, with evenings for rest and company. The lighting changes continuously at dawn and dusk. Five individual sprite sheets animate walking, building, idling, and sitting. These are game-scaled routines, not a detailed biological model.

New tutorial restarts the scenario after confirmation and retains one backup under `solar-friends-v2-backup`. Earlier prototype saves remain untouched under `solar-friends-v1`.

Existing 20×20 saves expand in place. A meandering river runs along the eastern edge, with animated currents, shallow banks, and stones. Construction is blocked along the riverbank so buildings and their approach points remain on the village side.

## Implementation

Rust owns simulation and validated saves. Bevy App and ECS schedule systems and store resident entities. `wasm-bindgen` exposes the game to the browser. Canvas 2D draws the isometric world; HTML provides the controls and resident details. This slice uses Bevy's simulation modules, not its GPU renderer.

- `src/lib.rs`: simulation, requests, construction, saves, and tests.
- `web/main.js`: canvas rendering, input, and browser persistence.
- `web/style.css`: desktop interface.
- `web/art/`: generated transparent game sprites.
- `assets/art-direction/`: approved concept and visual constraints.

Run `cargo test --locked` for resource accounting, refusal, construction/harvest progression, and save validation. Run `cargo fmt --check` and `cargo clippy --locked -- -D warnings` before pushing. GitHub Actions builds and tests the same WASM artifact.

## Prototype scope

This is a small playable slice. Resident movement follows direct paths; collision-aware navigation, relationship histories, skill progression, weather, budgets, and the full first-year scenario are future work. Each home provides three beds; residents without a bed sleep outdoors and recover more slowly. Socializing currently restores the acting resident's social need. No multiplayer or cloud saves.

Artwork was generated with OpenAI's built-in image generation tool using the user-approved Brazilian ecovila concept. The browser game uses separate sprites rather than displaying the concept as a background.
