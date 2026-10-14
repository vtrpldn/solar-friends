---
description: Run and develop the Solar Friends browser ecovila prototype.
---

# Solar Friends

An isometric Brazilian ecovila where five residents balance community work with energy, hunger, interests, and social needs.

## Contents

- [Run locally](#run-locally)
- [Play](#play)
- [Game modes](#game-modes)
- [Construction economy](#construction-economy)
- [Village simulation plan](simulator-plan.md)
- [Completed gameplay and artwork playtest](playtest.md)
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

Choose a free blueprint in Build and click a clearing. Open Projects to inspect staged materials, priorities and progress; source local materials or buy missing supplies in Town. Residents construct ready stages during community work hours, or you can select a resident and ask for help. People can refuse based on their energy or hunger. Explaining the community need can overcome reluctance, but never exhaustion.

Chicken coops need stone footings, prepared frames, roof tiles and fittings, and shelter three hens each once residents finish construction. Hens roam and peck near their coop from 06:00 to 18:30, then roost indoors. Their movement follows game speed and pauses with the village; coops and their flocks return when loading a save. Each completed coop consumes three ingredients, while reserving six for residents, and produces three eggs after twelve daylight hours. Night pauses production. Hungry hens wait safely. Feeding reserves room for at most twelve eggs across all coops, including batches underway.

Gardens need planting, watering, moist growth, and harvesting. Lettuce takes three game hours; beans take six; tomatoes take five before the first of three harvests. Each watering costs two water and keeps soil moist for four game hours. Dry crops pause without dying. Residents forage food, collect needed building materials from player-established plots, carry river water, cook, rest, and socialize. Food forests add fruit to gathering. Multiple builders accelerate shared construction. The arrival tutorial starts on an empty 28×28 lot (784 tiles, roughly twice the previous 400). Build a cistern, two homes, a garden, and a kitchen, bring in a harvest, serve a prepared meal, and reach the next morning.

Arrival barrels store 40 water. Each completed cistern adds 75 capacity and catches rain. Afternoon rain runs from 14:00 to 17:00 on two days out of every three; every third day stays dry. Rain also waters planted gardens. Residents can collect 18 water per river trip even before a cistern exists. The resource panel shows capacity, weather, and garden needs; beds show crop stages and cisterns show the shared storage level.

Open Settings (the gear button) to enable the placement grid. Tile guides appear only while a building tool is selected. Preferences are stored separately from village saves and survive a new village. The forest edge mixes stylized Mata Atlântica species: jequitibá, juçara, embaúba, and pau-brasil.

Drag to pan, scroll to zoom, press Space to pause, and use the bottom controls for speed. Escape cancels placement. Saves stay in this browser's local storage and happen every 15 seconds, after placement, and on leaving the tab. Save village writes immediately.

A day lasts eight minutes at 1×. Breakfast starts at 06:30, lunch at noon, dinner at 18:00, and residents have individual preferred bedtimes, adjusted earlier when tired and later when rested (20:00–23:30). Each locks a 6–9 hour sleep target based on energy when settling down; travel and interruptions do not count as sleep. When everyone is actually asleep or working off-site, time automatically advances at 16× and restores the player’s selected speed when someone wakes or begins returning. Pauses and open dialogs still stop time. Autonomous chores run from 09:00 to noon and 15:00 to 16:00; urgent foraging can interrupt free time while residents are awake. Requested household tasks can continue outside those windows, subject to their needs. Material collection and preparation respect community work hours even when requested. Optional outside jobs depart from 09:00 (until 10:00 if morning needs delay departure), run until 17:00 and then return to the village. Residents spend free time on nature walks, birdwatching, gentle stretches, daydreaming, and stargazing after 20:00. Hobbies restore energy, use individual quiet spots, and survive reloading. The lighting changes continuously at dawn and dusk. Existing walking, looking, stretching, and sitting animations accompany these activities.

New villages restart after confirmation and retain a backup for their mode. This economy uses version 3 saves; earlier formats do not import. Old browser keys remain untouched.

## Game modes

The main menu appears on launch. **New game** starts Story; **Sandbox** starts a separate village. Continue either mode from its own saved slot. Click the Solar Friends mark or use Settings → Main menu to return. Reading the menu pauses village life.

**Story** starts with roads, homes, gardens, kitchens and cisterns. Thirteen chapters introduce new buildings and mechanics in order; the next chapter is followed automatically. Construction uses local materials, town purchases and resident labour. Earlier contributions still count toward later objectives. After the final chapter, all buildings remain available and resource management continues.

**Sandbox** unlocks every building from the start. Placement completes immediately without spending materials or funds. Ingredients stay at least 80, meals at least 20, water fills available storage, funds stay at least R$ 100,000, and tools replenish to 36 uses on simulation ticks. Residents, crops, rain, hens and solar lighting retain their normal routines. Select a building in Buildings to remove it and reuse its plot; rebuilding is free. Roads can be toggled in either mode.

Story saves under `solar-friends-v3-story`; Sandbox uses `solar-friends-v3-sandbox`. Each has its own backup and recovery keys. Confirmed restarts replace only that mode and retain a backup. Imports use the mode in the exported file. An earlier version 3 village remains available as Story without changing its original browser key. Development scenarios and artwork previews bypass the main menu and never save over either playable mode.

## Construction economy

Why: building an ecovila uses resources from its land and equipment bought elsewhere. [plan.md](plan.md) records the completed implementation stages and acceptance checks. This fictional southeastern property and its prices are game assumptions.

The community starts with R$ 3,000 and modest material stocks. Fifteen materials include timber, bamboo, earth, stone, salvage, prepared frames, walls, roof tiles, fittings, plumbing, electrical supplies, greenhouse covering, panels, batteries and pumps. Stored stock plus incoming orders share 600 spaces; each completed general storage building adds 300. Sandbox removal is blocked if the remaining stores cannot hold existing stock and incoming orders. The Rust snapshot is the source for recipes, quotes and reservations.

**Projects** reserves only each current stage. Priority decides who gets scarce materials. Labour consumes a stage once; waiting projects leave workers free. Pause releases unused reservations. Cancellation releases unused stock and returns half of consumed materials. Orders remain independent. Choose local bamboo structures, adobe homes or stone garden borders before labour starts; local homes use veranda artwork and local plots have a different foundation edge. Choose **Build → House walls → Adobe bricks & bamboo** before placing a home, including in Sandbox. Adobe homes use earth and bamboo instead of prepared walls and alternate between two painted designs. All buildings have mixed recipes, and only completed buildings provide their benefits.

**Town** combines supplies in one basket. Delivery costs R$ 60, dispatches after two game hours and arrives at 10:00 after dispatch. The fund is charged on confirmation. Cancel before dispatch for a full refund; dispatched orders must arrive. Receiving capacity includes incoming stock. The order book retains bounded history while keeping every active order.

Each resident has an optional outside occupation. Configure schedules in **Village → Trade → Outside occupations** or in the resident's details. Enabled residents leave between 09:00 and 10:00, work until 17:00, and contribute to the shared fund on return. Lunch is supplied off-site. Morning food, rest, pickup trips and agreed days off take precedence. Disabling a schedule stops future shifts; an active shift finishes normally. Each resident's shift is committed at departure and paid once on return.

| Resident | Outside occupation | Contribution per shift |
| --- | --- | --- |
| Iara | Plant nursery assistant | R$ 160 |
| Bento | Bamboo carpenter | R$ 240 |
| Luz | School canteen cook | R$ 180 |
| Cauã | Atlantic Forest guide | R$ 200 |
| Nina | Rainwater systems technician | R$ 220 |

Keep some residents in the village for construction, cooking and material preparation. Selling produce keeps 36 ingredients for the household. A neighbour exchanges four surplus ingredients for two fittings at most once per day. Spare unreserved building materials can be sold at half price to recover money and receiving space; future stages may need them again. Reserved stock and incoming orders cannot be sold.

New villages start without material sites or a receiving-bench prop. **Build → Land & materials** lets the player establish timber trees (R$ 80, 3×3 cells), bamboo (R$ 30), earth digging (R$ 15), a stone quarry (R$ 25) or salvage recovery (R$ 15); the other plots occupy 2×2 cells. Plots cannot overlap roads, buildings, riverbanks, other plots or the arrival clearing. Stone-bearing ground is in the southeast (anchors at column and row 17 or later). Sandbox establishment is free; cultivation still needs water and growth time.

Timber takes four game days of moist growth and produces four trees, each yielding eight timber. Bamboo takes two days and produces 24 units, harvested in batches of four. Initial planting and each watering use two irrigation water, preferring reclaimed water when available. Moisture lasts a day; rain also waters growing plots, and dry growth pauses. Two residents tend plots during their normal work windows. Two compost enrich a plot once, increasing growth speed by 25%. These growth periods and prices are game assumptions.

**Village → Construction → Our land resources** shows growth, reserves, harvest requests and settings. Automatic harvesting collects only for active project demand and one eight-timber tool batch. A manual request queues one batch for resident work; it does not instantly grant stock. After the last cut, automatic timber replanting costs R$ 40 and two water; bamboo resprouts from its roots without a seedling charge. Automatic replanting and harvesting can be disabled independently. Empty timber plots can also receive a one-off planting request. Missing irrigation, funds or storage keep work waiting without consuming supplies.

Earth, stone and salvage share finite property reserves of 140, 96 and 24 units respectively. Multiple extraction sites access the same reserve; clearing or relocating them does not replenish it. Clearing frees the occupied cells and discards the current crop without refunding establishment costs. Plot indices, growth, requests and reserves persist through save/reload. Older saves retain inventory and the remaining finite reserves while their five fixed sites are retired. Town purchases remain available while crops mature or land reserves run out.

When tools run low, local workers collect enough timber for one batch; Bento prioritizes making it after urgent needs and ready construction. Turning tool use off also stops this maintenance collection.

The camp can prepare frames from timber and fittings, wall material from earth, and fittings from salvage. A completed workshop adds roof tiles from earth and timber and doubles fitting recovery using salvage and stone. These recipes are shown in Projects; prepared goods are also purchasable, so a workshop never blocks its own construction. Site access points remain spaced apart. Residents keep their normal work windows, meals, hobbies and substantial free time.

## Solar power

Why: shared buildings and street lights need a player-built source of energy. Plan a **solar farm** using stone supports, fittings, panels, batteries and electrical supplies; **street lights** need stone, timber, fittings and electrical supplies. Residents finish construction as usual. Each completed farm starts with an empty battery, generates up to 6 energy per game hour in daylight, and adds 36 energy of storage. Batteries supply lighting after sunset; an empty battery turns shared lights off until sunshine returns. More farms increase generation and storage.

A **river generator** must sit on the shallow village-side channel of the river. Each completed generator supplies 1.8 energy per game hour through day and night and adds 18 battery capacity. Rain raises output by 30%; the dry day reduces it by 35%. Residents approach from the bank. Shared power works with either solar or river generation.

Open **Power** for generation, demand, stored energy, and an estimate of remaining nighttime lighting. Switch individual shared lights off to save energy. Connections span the village automatically. Homes with rooftop panels use their own batteries; gardens, food forests, and compost need no electricity. Residents can still cook on the kitchen stove and work by hand during outages. Charge and switches are saved.

The developer scenarios **Stored sunshine** and **Empty battery** provide matching nighttime views for checking lighting and controls.

## Ecological sanitation

Why: household water and waste can support village resources without entering drinking supplies. Build an **ecological toilet**, **reed bed** and **biodigester** as their Story chapters unlock, or immediately in Sandbox. Residents visit the toilet privately once per day while awake; each visit uses one fresh water for handwashing and adds sealed waste. Household water use also produces greywater.

Manage processing in **Village → Supplies → Water & waste**. A reed bed turns 12 greywater into 8 irrigation water over six game hours. Gardens use reclaimed water first; cooking, drinking and handwashing always use fresh water. A biodigester consumes two sealed waste and two kitchen scraps over eight hours, producing four cooking gas and two digestate. Digestate cures for a full game day before becoming compost. One gas adds one meal to a cooked pot without replacing its ingredients.

Filtration and digestion can be paused; full output stores stop new batches. Curing continues in sealed storage. Processing timers, settings and stocks survive saves without duplicating outputs. These simplified cycles are game rules. The **Closing the loop** and **Circular village at night** development scenes exercise the complete system and its artwork.

## Farming

Select a garden or greenhouse in **Buildings** to choose its next crop, pause replanting, and inspect growth, soil moisture, and expected yield. Crop changes wait until the current cycle ends; paused replanting still allows watering and harvesting existing plants.

| Crop | Moist growth | Base food | Tradeoff |
| --- | --- | --- | --- |
| Lettuce | 3 hours | 5 | Quick single harvest |
| Beans | 6 hours | 10 | Soil dries half as fast |
| Tomatoes | 5 hours, then 3 hours between harvests | 6 per harvest | Three harvests; later harvests yield 4 without compost |

Iara adds three food to a harvest. Available compost adds three food and prevents the tomato penalty; available tools add two. Harvests share the pantry ingredient stock. Dry crops pause without dying. Beds visibly show seedlings, growth, and mature plants; tomatoes develop colored fruit.

A **greenhouse** needs a stone foundation, prepared or bamboo frame, covering and plumbing, and supports the same crops and resident interactions. Each two-water watering lasts eight hours instead of four, and rain does not reach its soil. While a planted greenhouse is moist, its nursery produces one seedling every eight game hours, up to twelve stored. Outdoor beds automatically use one seedling for a 25% growth head start when planted. Greenhouse planting does not consume seedlings.

## Building interactions

Click a building on the map or open **Buildings**, select a building, and ask a named neighbour to visit. They walk there before using it. Free time is reserved for hobbies and company. Visits respect bedtime, hunger, and energy needs, and their target survives saving and reloading.

Residents use separate spots around shared buildings, along the river, and in foraging areas. Walkers steer around nearby neighbours. Construction and garden work spread across available sites in small teams; helpers at the same project still contribute together. Approach spots avoid neighbouring buildings and the riverbank. A resident takes a break if a tightly packed site has no room for their spot.

Homes restore energy; gardens are tended; kitchens cook with available supplies; cistern drinks use one water to restore energy and ease hunger; food forests provide two fruit. Coop care improves connection and advances an already-fed egg batch by thirty daylight minutes. Compost stations convert two scraps to one compost; workshops consume eight timber for twelve tool uses. Production visits share a sixty-game-minute cooldown per building.

The community square is 1.5 times its original width and height, with a larger placement footprint for new construction. Residents use separate meeting spots, recover connection and energy, and build mutual friendship when visiting together. Gatherings remain available through People.

## Building crews

Why: changing the layout takes resident effort. In **Village → Buildings**, choose **Demolish**, **Salvage**, or **Move building**. These jobs need resident work in both Story and Sandbox; Sandbox construction stays instant and free.

Demolition uses 18 crew effort and returns no materials. Careful salvage uses 54 effort and returns half of each recorded, actually consumed construction material, rounded down, when the job finishes. Free Sandbox buildings have no consumed materials to recover. Incoming salvage reserves receiving space immediately; inventory is credited only on completion. A storage house cannot be removed if stock and incoming reservations would overflow the remaining space.

Moving completed buildings requires choosing a legal grid plot, 24 effort packing at the source, travel to the new plot, and 36 effort rebuilding there. The destination is reserved against other buildings, roads and material sites. Identity, recipe, house variation, crops and equipment remain with the structure. The old plot is released after packing; the new site becomes usable after rebuilding. A crew job can be cancelled before packing finishes; once packed, the move must finish at its reserved site.

Buildings close during crew work. Residents work 09:00–12:00 and 15:00–16:00, prioritising food, fatigue, sleep and existing care agreements. Buildings shows the stage, progress and which neighbours are working or on the way. People offers **Help building crew** for an explicit request. Cistern and generator storage remains until removal completes; excess water or charge is clamped to the new capacity then. Moves retain capacity and stock, while generation, crop growth and hen production pause. Household inventory and sanitation stores stay communal.

Empty, unstarted blueprints still cancel immediately in Construction. Cancelling a structure that already consumed materials queues careful salvage instead. Work progress, reservations and both relocation stages survive export/import and saves. `node scripts/verify-building-work.mjs` exercises real resident labour, conservation, cancellation, timing and native/preview placement agreement.

## Village supplies

Open **Supplies** for ingredients, eggs, prepared meals, today's production and use, and the weather outlook. Gardens and foraging share the ingredient stock. The pantry estimates food days at fifteen portions per day for five residents; cooking gains, hen feed, future harvests, and extra hunger are excluded from that estimate.

Kitchens make five meals from three ingredients and one water. With egg cooking enabled and eggs available, they make seven meals from two ingredients, two eggs, and one water. Simple meals remain the fallback. Both recipes produce compost scraps. Turn egg cooking or automatic hen feeding off in Supplies to conserve resources. Already-fed coops finish their current batch.

When ingredients and meals run low, residents prioritize gathering wild food even without a food forest. Water remains available from the river. Shortages pause hen production and crop growth without killing hens or crops.

Autonomous food work tops up ingredients only below eighteen ingredients and thirty ingredients plus meals. Cooking resumes below eight prepared meals, with kitchen duty rotating across residents. Completed harvests and pots can exceed those thresholds by one batch; workers recheck the pantry before adding more. Timber trips stop adding unwanted fruit. Explicitly requested production still works when the pantry is full. Old surpluses are consumed normally rather than discarded.

The **A relaxed afternoon** developer scenario demonstrates hobbies with a modest pantry. Run `node scripts/verify-leisure.mjs` after rebuilding to check two weeks each of arrival, established, hungry, and surplus villages, including food bounds, individual free time, and save compatibility.

## Village quests

The journal starts with **A Shared Beginning**: arrive, build water and shelter, harvest, serve a cooked meal, and reach the next morning. Completion unlocks food forests and **Roots for Tomorrow**. Finish each chapter before following the next. Recorded earlier efforts count, and completed chapters remain complete.

| Quest | Objectives | Reward |
| --- | --- | --- |
| Roots for Tomorrow | Food forest, six fruit, planted timber and cultivated bamboo. | Compost and square; material crops mature in the background. |
| A Place to Gather | Square, five meals, time with all five neighbours and a welcome supper. | Shared work and community friendships. |
| Made by Our Hands | Storage house, a paid outside shift, returned truck pickup, town supplies, R$ 120 tool library and shared construction. | Workshop and greenhouse. |
| Growing Resilience | Workshop tools, compost-enriched harvest, greenhouse seedling raised and planted outdoors. | Chicken coop. |
| A Fuller Table | Coop, three eggs collected and an actual egg meal cooked. | Solar farm and street lights. |
| Sunshine to Share | Solar farm, street light, twelve stored energy and actual lighting after dusk. | Ecological toilet and reed bed. |
| Water Comes Around | Toilet visits, captured rain, filtered greywater and reclaimed irrigation. | Biodigester. |
| Scraps into Energy | Digestion batch, gas used in cooking and fully cured digestate. | Local construction chapter. |
| Homes of Earth | Actual timber/bamboo/earth/stone/salvage harvesting, timber replanting, material preparation, adobe home, surplus sale and neighbour exchange. | River generator. |
| The River Keeps Giving | River generator installed and producing after dusk. | Community care chapter. |
| Room to Breathe | Follow through on a kitchen agreement and give every neighbour time for a hobby. | Final village chapter. |
| A Village in Balance | All seventeen building kinds, beds for everyone, healthy food/fresh water and a second gathering. | Complete Story; continue at your own pace. |

Gatherings cost five prepared meals and require at least three rested, fed neighbours. Start between 08:00 and 18:00, at most once per day. They last two game hours; at least three neighbours must reach the venue. Attendees gain connection, fullness, and mutual friendship memories visible in resident details. The welcome supper can use the kitchen; once the square is ready, gatherings meet there.

Tools add two food to gardening harvests or make construction 25% faster. Each finished task or building consumes one use. The community panel lets you conserve tools, inspect compost supplies, and host gatherings. Residents can make compost and tools autonomously or on request. Tool stock is capped at 36 uses.

The journal, unlocks, tools, friendships and economy persist together in version 3 village saves. Activity milestones remain credited after supplies are consumed, and seven-chapter saves retain their achievements while gaining the next chapters. Sandbox remains free with every building unlocked.

The care chapter offers Luz a personal-time check-in if no cooking concern has arisen, so balanced play never requires deliberately overworking a resident. The agreement still needs actual cooking cover, rest and a full day; accepting it alone does not complete the chapter.

## Village situations

Open **Situations** in the bottom controls to hear concerns that emerge from daily life. Situations progress alongside every quest and can also be opened from the journal.

The first situation, **More than the cook**, appears when one neighbour finishes at least six cooking tasks across two or more of the last three calendar days and carries at least 60% of the cooking. The resident can be anyone. A busy afternoon alone does not trigger it.

The collective can share kitchen shifts or protect a day off. Sharing shifts takes the resident off cooking and gives them a break while other neighbours prioritize meals over their projects. A day off protects them from all work until recovery is complete. Requests cannot override either agreement. Food, water, sleep, and rest needs still apply to helpers.

Recovery requires two other cooks (one for a day off), 72 game minutes of rest, company, or hobbies at their destination, and a full game day after the agreement. Choosing a response does not complete the situation. Without an agreement, actual help and recovery can also settle the concern after a day. More cooking by the affected resident reduces recovery by 36 minutes per batch. Sleep does not count as personal free time.

An unresolved concern can lower that resident's wellbeing by up to 12 points. Rest and company ease it. Resolved situations remain visible for three game days, then make room for another concern. Cooking history resets on resolution. Situation history, agreements, and recovery persist in village saves.

Run `node scripts/verify-situations.mjs` after building to trigger a concern from a fresh village and play both agreements through autonomous resolution and save/reload. An optional output directory stores earned checkpoints for browser playtesting.

## Development tools

Open **Dev Tools** in the game header. The desktop workbench contains simulation tools, artwork links, captures, and the local check report.

### Why

Repeatable scenarios and shared rendering controls shorten gameplay debugging and make artwork changes easier to compare at the scale players see.

### Simulation workbench

Economy scenarios **Our first projects**, **An empty shared fund** and **Depleted land** exercise project controls and purchasing recovery. Load a fresh arrival, established village, hungry village, mature harvest, overworked cook, full coop, night scene, or a copy of the current village. These are staged fixtures: subsequent time steps run the real simulation. **Import test scene checkpoint** replays a validated village export without replacing the saved village; malformed or oversized files leave the current scene intact. The cook fixture seeds history and raises its concern on the first tick.

**Grid & road edges** places roads against every building and home variation. Select Road to show the grid. Building sprites use their full painted day/night outline to fit whole-tile plots, with no added foundation platform. Placement previews, selection areas and road exclusion share those plots. Use **Dev Tools → Artwork → Sprite grid fit** to review all 22 variants beside a resident. `node scripts/verify-sprite-grid-fit.mjs` checks the actual PNG outlines at four zooms; `node scripts/verify-grid-foundations.mjs` checks road boundaries, conflicts and saved plots. `node scripts/verify-playtest.mjs` checks cancellation identities, persistent house variations, goal routes, desktop zoom and reachable material collection.

**All building artwork** and **All building artwork at night** show the complete building registry in separate, finished plots. The six house appearances include both adobe designs; river power sits on a legal river plot, and sanitation and storage buildings are included. **Dev Tools → Artwork → All buildings** opens the same showcase; the Night lighting link opens its matching night layout. These previews are paused and keep playable saves separate. `node scripts/verify-art-preview.mjs` checks that every registered sprite actually renders once, both layouts match, plots are legal, and the original fixtures are unchanged.

The development test scene (separate from playable Sandbox mode) holds the original game in memory and disables village autosaves, imports, and restarts. **Return to village** restores that game; reloading returns to the main menu. Export a scenario before leaving if it should be kept. A quarter-second tick advances 0.75 game minutes. Longer advances use the same bounded ticks, up to one game day per action.

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

The browser exposes `window.solarDev` for development automation: `loadScenario(id)`, `advance(gameMinutes)`, `snapshot()`, `inspect()`, `fixedView()`, `returnToVillage()`, and `importSandbox(raw)`. Advancing requires a sandbox. The UI calls this same interface.

## Implementation

Rust owns simulation and validated saves. Bevy App and ECS schedule systems and store resident entities. `wasm-bindgen` exposes the game to the browser. Canvas 2D draws the isometric world; HTML provides the controls and resident details. This slice uses Bevy's simulation modules, not its GPU renderer.

- `src/lib.rs`: simulation, requests, construction, saves, and tests.
- `src/modes.rs`: Story/Sandbox initialization, replenishment and Sandbox removal.
- `src/economy.rs`: stage reservations, orders, preparation, income and sales.
- `src/logistics.rs` and `src/navigation.rs`: located ownership, cargo, supply routes, storage targets and recovery.
- `src/workforce.rs`: food-work reservations derived from current resident activities.
- `web/economy-ui.js` and `web/economy-art.js`: project/Town controls and shared resource sprites.
- `src/resource_sites.rs` and `web/resource-sites.js`: player plot placement, cultivation, finite property reserves and preview rules.
- `src/progression.rs`: persistent quest milestones and building unlocks.
- `web/quests.js`: quest stories, objectives, and reward descriptions.
- `web/main.js`: canvas rendering, input, and browser persistence.
- `web/style.css`: desktop interface.
- `web/art/`: generated transparent game sprites.
- `assets/art-direction/`: approved concept and visual constraints.

Run `cargo test --locked` for resource accounting, refusal, construction/harvest progression, and save validation. Run `cargo fmt --check` and `cargo clippy --locked -- -D warnings` before pushing. GitHub Actions builds and tests the same WASM artifact. After building, `node scripts/verify-economy.mjs` checks 24 game days each of funded, empty-fund and depleted properties, including completion, intermediate save round trips, capacity and leisure. `node scripts/verify-resource-sites.mjs` checks cultivation, whole-tree harvests and all 3,380 plot placement previews against the native rules. The cultivation Dev Tools scene provides growing timber, bamboo and a manually established quarry for visual checks. `node scripts/verify-quests.mjs` (Node 22+) completes all thirteen Story chapters through the public game API and checks the reward mechanics. Pass an output directory to save its playthrough checkpoints for browser testing.

## Prototype scope

This is a small playable slice. Material hauling follows routes around occupied plots and the river. Other resident activities retain direct steering. Deeper relationship stories, skill progression, seasonal ecology, connected utilities, contracts, specialist crews and the full first-year scenario remain future work. Each home provides three beds. Residents without a bed walk out to stay with neighbours overnight, leave the map while sleeping, and begin their return when their individual 6–9 hour sleep target is complete. Those with beds sleep inside village homes and recover faster. New beds do not interrupt an overnight stay already underway. Departures, absence and return walks persist in saves; the People panel shows the reason and return time, and local requests wait until residents return. Socializing currently restores the acting resident's social need. No multiplayer or cloud saves.

Artwork was generated with OpenAI's built-in image generation tool using the user-approved Brazilian ecovila concept. The browser game uses separate sprites rather than displaying the concept as a background.

## Artwork studio

Open [the artwork studio](http://127.0.0.1:4173/artwork/) on the same local server. It works without a WebAssembly build. Browse 47 artwork files as 75 sprite entries (74 active and one retained reference), including atlas cells, resident animations, and the game's painted chickens.

Select a sprite, pin up to three comparisons, and inspect transparency, palette, ground alignment, and relative game scale. Use the action and frame controls to compare resident poses. Reviews and notes are saved in this browser separately from village saves; **Export review** downloads a JSON handoff. This is a review tool: it does not alter artwork or renderer settings.

Add building source crops, scales, anchors, and camera calibration to `web/building-art.js`; the game and studio share these values. Add other sprite entries to `web/artwork/catalog.js`. Run `node scripts/verify-artwork.mjs` to catch uncatalogued files, missing sources, duplicate IDs, and invalid crop bounds. See [artwork consistency](assets/art-direction/artwork-consistency.md) for scale values, generation prompts, and the limits of painted geometry.

### Banana sewage treatment

Build a **Banana treatment bed** under **Build → Water & waste**. Story unlocks it after Sunshine to Share and introduces it in Water Comes Around; Sandbox has it immediately. Residents build its sealed basin, drainage layers, planted bed and inlet using stone, earth, bricks, pipes and fittings.

A completed 2×2 bed treats up to six sealed toilet waste per game day without power. Water & waste shows lifetime treatment and lets you pause it to reserve waste for the biodigester. It produces no drinking water, irrigation water or food. Moving, demolishing or salvaging closes the bed while residents work.

The simplified game cycle is inspired by the [Emater-DF banana evapotranspiration basin](https://biblioteca.emater.df.gov.br/jspui/handle/123456789/128). Day/night sprites and their prompts are recorded in `assets/art-direction/banana-sanitation-prompts.json`; the artwork preview includes both. The protected `banana` development scenario starts with accumulated waste and digestion paused.

### Simulation foundations

Dev Tools records observed time for each neighbour: travel, village work, outside work, meals, rest, social time, leisure and sleep. Leisure walks count as leisure. Eight days of observations survive saves. Material accounting compares receipts and spending with current stock, keeping reservations, incoming orders and expected salvage separate. Edited test scenes establish their own baseline. The continuing stages are tracked in [the simulator plan](simulator-plan.md).

Use the compact, dispersed, empty-fund, enclosed-storage and established simulation baselines to compare layouts. Each is a protected scene with its own observations; loading one never replaces a playable village save.

### Physical construction supplies

Construction materials live in camp storage, individual storage houses, material-plot output piles and project staging. The materials total includes carried loads. Residents collect up to 12 units per trip; a construction stage starts after its inputs reach the site. Roads speed up hauling, while occupied plots and the river block routes. Residents retain meals, sleep, outside jobs and community work hours. Existing cooking and foraging work covers the expected food deficit before more neighbours join it, leaving other people free to help with projects.

Open **Supplies → Construction materials → Where supplies are** to inspect locations and deliveries. A storage house reserve queues local hauling. Lowering a reserve queues returns; changing a target never transfers goods immediately. Town deliveries and resident pickups unload at camp. Keep room there for incoming orders.

Interrupted loads remain recoverable where they are put down. Cancelled staging and salvage stay at their plot until collected. Storage houses must empty before a resident crew can pack or dismantle them. Blocked access appears in construction and storage details. Save version 4 validates location ownership and cargo; older aggregate fixtures establish located storage once when imported. Protected dev scenes remain separate from saved villages.

The simulator work is ongoing. Production inputs, connected utilities, land properties, maintenance and the shared work forecasts follow in their respective plan stages. The logistics verifier exports real pickup, cargo and night artwork checkpoints under the generated artifacts directory for replay through Dev Tools.
