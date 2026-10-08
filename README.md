---
description: Run and develop the Solar Friends browser ecovila prototype.
---

# Solar Friends

An isometric Brazilian ecovila where five residents balance community work with energy, hunger, interests, and social needs.

## Contents

- [Run locally](#run-locally)
- [Play](#play)
- [Village quests](#village-quests)
- [Village situations](#village-situations)
- [Development tools](#development-tools)
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

Chicken coops cost 24 timber and shelter three hens each once residents finish construction. Hens roam and peck near their coop from 06:00 to 18:30, then roost indoors. Their movement follows game speed and pauses with the village; coops and their flocks return when loading a save. Each completed coop consumes three ingredients, while reserving six for residents, and produces three eggs after twelve daylight hours. Night pauses production. Hungry hens wait safely. Feeding reserves room for at most twelve eggs across all coops, including batches underway. Larger egg stocks from older saves remain available to use.

Gardens need planting, watering, moist growth, and harvesting. Lettuce takes three game hours; beans take six; tomatoes take five before the first of three harvests. Each watering costs two water and keeps soil moist for four game hours. Dry crops pause without dying. Residents gather fallen timber, carry river water, cook, rest, and socialize. Food forests add fruit to gathering. Multiple builders accelerate shared construction. The arrival tutorial starts on an empty 28×28 lot (784 tiles, roughly twice the previous 400). Build a cistern, two homes, a garden, and a kitchen, bring in a harvest, serve a prepared meal, and reach the next morning.

Arrival barrels store 40 water. Each completed cistern adds 75 capacity and catches rain. Afternoon rain runs from 14:00 to 17:00 on two days out of every three; every third day stays dry. Rain also waters planted gardens. Residents can collect 18 water per river trip even before a cistern exists. The resource panel shows capacity, weather, and garden needs; beds show crop stages and cisterns show the shared storage level. Older saves keep their supplies and start existing gardens as empty beds.

Open Settings (the gear button) to enable the placement grid. Tile guides appear only while a building tool is selected. Preferences are stored separately from village saves and survive a new village. The forest edge mixes stylized Mata Atlântica species: jequitibá, juçara, embaúba, and pau-brasil.

Drag to pan, scroll to zoom, press Space to pause, and use the bottom controls for speed. Escape cancels placement. Saves stay in this browser's local storage and happen every 15 seconds, after placement, and on leaving the tab. Save village writes immediately.

A day lasts eight minutes at 1×. Breakfast starts at 06:30, lunch at noon, dinner at 18:00, and staggered bedtimes begin at 21:30. Autonomous chores run from 09:00 to noon and 15:00 to 16:00; urgent foraging can interrupt free time while residents are awake. Requested work can continue outside those windows, subject to their needs. Residents spend free time on nature walks, birdwatching, gentle stretches, daydreaming, and stargazing after 20:00. Hobbies restore energy, use individual quiet spots, and survive reloading. The lighting changes continuously at dawn and dusk. Existing walking, looking, stretching, and sitting animations accompany these activities.

New village restarts the scenario after confirmation and retains one backup under `solar-friends-v2-backup`. Earlier prototype saves remain untouched under `solar-friends-v1`.

Existing 20×20 saves expand in place. A meandering river runs along the eastern edge, with animated currents, shallow banks, and stones. Construction is blocked along the riverbank so buildings and their approach points remain on the village side.

## Solar power

Why: shared buildings and street lights need a player-built source of energy. Build a **solar farm** for 48 timber and **street lights** for 6 timber each. Residents finish construction as usual. Each completed farm starts with an empty battery, generates up to 6 energy per game hour in daylight, and adds 36 energy of storage. Batteries supply lighting after sunset; an empty battery turns shared lights off until sunshine returns. More farms increase generation and storage.

Open **Power** for generation, demand, stored energy, and an estimate of remaining nighttime lighting. Switch individual shared lights off to save energy. Connections span the village automatically. Homes with rooftop panels use their own batteries; gardens, food forests, and compost need no electricity. Residents can still cook on the kitchen stove and work by hand during outages. Charge and switches are saved; older villages start without shared power.

The developer scenarios **Stored sunshine** and **Empty battery** provide matching nighttime views for checking lighting and controls.

## Farming

Select a garden or greenhouse in **Buildings** to choose its next crop, pause replanting, and inspect growth, soil moisture, and expected yield. Crop changes wait until the current cycle ends; paused replanting still allows watering and harvesting existing plants. Existing gardens migrate to lettuce with their growth intact.

| Crop | Moist growth | Base food | Tradeoff |
| --- | --- | --- | --- |
| Lettuce | 3 hours | 5 | Quick single harvest |
| Beans | 6 hours | 10 | Soil dries half as fast |
| Tomatoes | 5 hours, then 3 hours between harvests | 6 per harvest | Three harvests; later harvests yield 4 without compost |

Iara adds three food to a harvest. Available compost adds three food and prevents the tomato penalty; available tools add two. Harvests share the pantry ingredient stock. Dry crops pause without dying. Beds visibly show seedlings, growth, and mature plants; tomatoes develop colored fruit.

A **greenhouse** costs 60 timber and supports the same crops and resident interactions. Each two-water watering lasts eight hours instead of four, and rain does not reach its soil. While a planted greenhouse is moist, its nursery produces one seedling every eight game hours, up to twelve stored. Outdoor beds automatically use one seedling for a 25% growth head start when planted. Greenhouse planting does not consume seedlings.

## Building interactions

Click a building on the map or open **Buildings**, select a building, and ask a named neighbour to visit. They walk there before using it. Free time is reserved for hobbies and company. Visits respect bedtime, hunger, and energy needs, and their target survives saving and reloading.

Residents use separate spots around shared buildings, along the river, and in foraging areas. Walkers steer around nearby neighbours. Construction and garden work spread across available sites in small teams; helpers at the same project still contribute together. Approach spots avoid neighbouring buildings and the riverbank. A resident takes a break if a tightly packed site has no room for their spot.

Homes restore energy; gardens are tended; kitchens cook with available supplies; cistern drinks use one water to restore energy and ease hunger; food forests provide two fruit. Coop care improves connection and advances an already-fed egg batch by thirty daylight minutes. Compost stations convert two scraps to one compost; workshops consume eight timber for twelve tool uses. Production visits share a sixty-game-minute cooldown per building.

The community square is 1.5 times its original width and height, with a larger placement footprint for new construction. Residents use separate meeting spots, recover connection and energy, and build mutual friendship when visiting together. Existing squares keep their saved locations. Gatherings remain available through People.

## Village supplies

Open **Supplies** for ingredients, eggs, prepared meals, today's production and use, and the weather outlook. Gardens and foraging share the ingredient stock. The pantry estimates food days at fifteen portions per day for five residents; cooking gains, hen feed, future harvests, and extra hunger are excluded from that estimate.

Kitchens make five meals from three ingredients and one water. With egg cooking enabled and eggs available, they make seven meals from two ingredients, two eggs, and one water. Simple meals remain the fallback. Both recipes produce compost scraps. Turn egg cooking or automatic hen feeding off in Supplies to conserve resources. Already-fed coops finish their current batch.

When ingredients and meals run low, residents prioritize gathering wild food even without a food forest. Water remains available from the river. Shortages pause hen production and crop growth without killing hens or crops. Existing saves start with no eggs and retain their ingredients, buildings, and village progress.

Autonomous food work tops up ingredients only below eighteen ingredients and thirty ingredients plus meals. Cooking resumes below eight prepared meals, with kitchen duty rotating across residents. Completed harvests and pots can exceed those thresholds by one batch; workers recheck the pantry before adding more. Timber trips stop adding unwanted fruit. Explicitly requested production still works when the pantry is full. Old surpluses are consumed normally rather than discarded.

The **A relaxed afternoon** developer scenario demonstrates hobbies with a modest pantry. Run `node scripts/verify-leisure.mjs` after rebuilding to check two weeks each of arrival, established, hungry, and surplus villages, including food bounds, individual free time, and save compatibility.

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

## Village situations

Open **Situations** in the bottom controls to hear concerns that emerge from daily life. Situations progress alongside every quest and can also be opened from the journal.

The first situation, **More than the cook**, appears when one neighbour finishes at least six cooking tasks across two or more of the last three calendar days and carries at least 60% of the cooking. The resident can be anyone. A busy afternoon alone does not trigger it.

The collective can share kitchen shifts or protect a day off. Sharing shifts takes the resident off cooking and gives them a break while other neighbours prioritize meals over their projects. A day off protects them from all work until recovery is complete. Requests cannot override either agreement. Food, water, sleep, and rest needs still apply to helpers.

Recovery requires two other cooks (one for a day off), 72 game minutes of rest, company, or hobbies at their destination, and a full game day after the agreement. Choosing a response does not complete the situation. Without an agreement, actual help and recovery can also settle the concern after a day. More cooking by the affected resident reduces recovery by 36 minutes per batch. Sleep does not count as personal free time.

An unresolved concern can lower that resident's wellbeing by up to 12 points. Rest and company ease it. Resolved situations remain visible for three game days, then make room for another concern. Cooking history resets on resolution. Situation history, agreements, and recovery persist in village saves; older saves begin with no recorded cooking.

Run `node scripts/verify-situations.mjs` after building to trigger a concern from a fresh village and play both agreements through autonomous resolution and save/reload. An optional output directory stores earned checkpoints for browser playtesting.

## Development tools

Open **Dev Tools** in the game header. The desktop workbench contains simulation tools, artwork links, captures, and the local check report.

### Why

Repeatable scenarios and shared rendering controls shorten gameplay debugging and make artwork changes easier to compare at the scale players see.

### Simulation workbench

Load a fresh arrival, established village, hungry village, mature harvest, overworked cook, full coop, night scene, or a copy of the current village. These are staged fixtures: subsequent time steps run the real simulation. The cook fixture seeds history and raises its concern on the first tick.

The sandbox holds the original game in memory and disables village autosaves, imports, and restarts. **Return to village** restores that game; reloading returns to the last saved village. Export a scenario before leaving if it should be kept. A quarter-second tick advances 0.75 game minutes. Longer advances use the same bounded ticks, up to one game day per action.

Resident diagnostics show the current task and destination, the real chooser's prediction on a copy, request eligibility and refusals, and the latest 150 activity changes across all residents while observation is enabled. An ongoing task can finish before the predicted decision applies. These observations are excluded from village saves.

### Artwork workbench

The **Artwork** tab opens the existing studio with three additional tools:

- **Calibrate** adjusts width, vertical ground anchor, and building camera slopes. Drag the anchor marker or use the numeric fields. Compare against a home and Iara with game-scale and lighting controls; export configuration for a source change. Building drafts can open in the real village renderer.
- **Review replacement** accepts a complete PNG source image, including all cells when replacing an atlas. Compare at game size, overlay silhouettes, inspect pixel differences, and open the candidate in a separate game preview. Alpha checks flag dimension changes, empty or clipped cells, tight gutters, silhouette changes, and animation baseline spread. Pixel measurements are sampled at 256 pixels per cell; pose changes and artistic quality require visual review.
- **Recipe card** collects current reference images, a working generation brief, original prompt records, and local revision notes. Saved revisions include the prompt, calibration, and image hash. Export recipes to keep with the source artwork. The tool prepares generation input; it does not generate images itself.

Draft images and calibration proposals apply only to preview URLs containing `art-draft`. They never replace production files. Local storage can fill with large images; the studio reports a failed preview instead of silently losing the proposal. Recipe notes remain in this browser until exported. Original prompt records are generated from repository documents by `node scripts/sync-art-prompts.mjs`; the development check detects stale copies.

### Repeatable checks and captures

Install the browser test dependency once:

```sh
npm ci
npx playwright install chromium
```

Run `npm run dev:check` to check Rust formatting, tests and lint, rebuild WebAssembly, check JavaScript syntax, run the verification scripts, and exercise the desktop tools in Chromium. It produces logs, screenshots, browser errors, a source/build fingerprint, and a machine-readable report in `artifacts/dev-check/`. **Dev Tools → Checks & captures → Open latest local report** opens the copy at `web/dev-report/`. Both locations are ignored by Git. A failed check exits nonzero and records its failure; later checks may not have run.

`npm run dev:browser` runs only browser checks against the existing build. `npm run dev:serve` serves the game on loopback port 4173; set `PORT` to use another port. Reports stay local and can contain a diagnostic village snapshot. CI uses fresh browser storage.

**Fix camera & pause** prepares comparable canvas captures. **Export diagnostic report** includes the current state, resident diagnostics, and errors observed after Dev Tools initialized. Browser checks also capture the complete interface at desktop sizes.

The browser exposes `window.solarDev` for development automation: `loadScenario(id)`, `advance(gameMinutes)`, `snapshot()`, `inspect()`, `fixedView()`, and `returnToVillage()`. Advancing requires a sandbox. The UI calls this same interface.

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

Open [the artwork studio](http://127.0.0.1:4173/artwork/) on the same local server. It works without a WebAssembly build. Browse 28 artwork files as 42 active sprite entries, including atlas cells, resident animations, and the game's painted chickens.

Select a sprite, pin up to three comparisons, and inspect transparency, palette, ground alignment, and relative game scale. Use the action and frame controls to compare resident poses. Reviews and notes are saved in this browser separately from village saves; **Export review** downloads a JSON handoff. This is a review tool: it does not alter artwork or renderer settings.

Add building source crops, scales, anchors, and camera calibration to `web/building-art.js`; the game and studio share these values. Add other sprite entries to `web/artwork/catalog.js`. Run `node scripts/verify-artwork.mjs` to catch uncatalogued files, missing sources, duplicate IDs, and invalid crop bounds. See [artwork consistency](assets/art-direction/artwork-consistency.md) for scale values, generation prompts, and the limits of painted geometry.
