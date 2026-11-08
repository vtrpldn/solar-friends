# Our first weekend

A standalone v0.2 playable at `/v02/weekend/`. It uses the shared 3D catalog and resident rigs, but no v0.1 simulation code or saves.

## Why

Test a short loop of choosing a campsite, placing practical projects, watching friends carry and build, and improving the arrangement. The first evening is available after a gathering place and one practical improvement; there is no multi-day unlock gate. The first-evening milestone remains, and Continue building resumes the village simulation afterward.

Choose one of three camps, select a project, then click a clear grid square. Project buttons in the journal open priority and relocation controls. WASD/arrows or left-drag pan relative to the camera; Shift pans faster. Q/E or right-drag turn the view. Scroll or +/− zoom; Home centers the camp. Keyboard movement works while paused, ignores text fields and dialogs, and stops on focus loss. Pause and 4× speed are available. The evening button ends construction for this session; New weekend asks before replacing its save.

- Five autonomous friends share work, carry materials, recover energy and use an installed tank for washing breaks.
- Physical materials are reserved at planning time; construction never deducts money. Each recipe determines the number of carrying loads, followed by resident assembly labor. Work access is protected during placement and relocation. All available friends can help a project, each reserving a reachable position around its perimeter. Leisure yields immediately to available work; tired residents rest below 25% energy and rejoin pending work at 60% (80% when there is no work waiting).
- An entrance camp needs a runoff decision during the shower. Other sites drain well. Raising supplies consumes timber; moving them is free.
- Town purchases offer timber, fasteners, roofing, tarp/rope, tanks, plumbing and toilet kits. Money is spent only when buying these supplies. Trips take 55 active simulation seconds; inventory arrives on return, including after reloading.
- Meals, drinking water and tents cover initial essentials. Meals and drinking water are now consumed, and local water treatment and material production operate continuously. Overnight schedules, terrain excavation and a story campaign remain outside this playable. The temporary toilet contributes to the evening outcome.
- Time pauses in hidden tabs. Saves use `solar-friends-v02-first-weekend-2` in local storage. The restart action never touches other modes.

`simulation.js` contains serializable state and rules. `game.js` renders the scene and UI. Run `node scripts/verify-v02-weekend.mjs` from the repository root for deterministic playthroughs and regression checks.

## Rendering checks

Append `?performance` for a visible rolling frame-time and draw-call readout. Static scenery is batched by material; moving residents retain their joint hierarchy. Rest destinations are cached until the camp layout changes, and the journal refreshes only when its displayed values change.

A local browser sample of the idle clearing measured 4,497 draw calls / about 45 fps before batching and 381 calls / about 96 fps afterward, with p95 frame intervals changing from 26 ms to 17 ms. These are local rolling samples, not hardware-independent benchmarks. Batching trades some fine-grained frustum culling for fewer submissions.

The two ridge tents use actual fabric panels, open doors, tied flaps, poles, ropes, stakes and bedrolls. Each is 398 triangles before batching and approximately 1.54 m tall, with a 2.88 × 3.08 m extent including guy ropes.

New weekends open with a 17-second two-SUV arrival: staggered curved approaches, side-by-side parking, and five exits split between two Jimny-inspired SUVs. Camp selection waits until everyone is out. Pause, speed and Skip arrival work during the opening; elapsed arrival time is saved. `?arrival-preview` replays the opening without reading or writing the player save.

The simulation runs at 10 Hz; presentation interpolates between its last two states every display frame. Residents, arrival vehicles, limb poses and current highlights share that interpolated clock, with one tick of visual latency and no extrapolation through obstacles. The performance overlay reports motion-clock updates separately from renderer FPS so high FPS cannot hide a stepped visual clock. `node scripts/verify-v02-presentation.mjs` checks 30/60/120 Hz, 1×/4× pace, pause and teleport boundaries.

## Construction balance

Recipes model small temporary structures assembled from prepared materials, not permanent buildings or engineering specifications. The group brings 36 timber pieces, seven fastener packs, eight roof sheets and one each of the tarp, tank, plumbing and sanitation kits. It can establish a camp and choose a practical improvement; completing every project requires another timber purchase.

Assembly budgets are 1, 2, 8 and 4 person-hours for the gathering place, water stand, open shelter and temporary toilet. One simulation second represents 0.45 game minutes; skill improves assembly speed by 25%. Carrying, walking and rest are additional. Timber loads carry four pieces, roof loads two sheets, and equipment/fasteners one pack each. These loads abstract carrying capacity; they do not model exact weight or two-person lifting yet. Money never substitutes for missing stock.

The revised economy uses save schema/key 2, preserving old prototype saves under their original key while starting a new weekend.

For an isolated tent-resting playtest, open `?rest-preview&performance`: friends arrive with low energy. It never reads or writes the player save. Choose a camp to watch door approaches, indoor recovery and exits.

## Resource, power and water port

The v0.1 rules in `src/economy.rs`, `src/production.rs`, `src/electricity.rs`, `src/power/network.rs` and `src/water.rs` informed the new renderer-independent JavaScript implementation. The old Rust simulation and v0.1 files remain intact.

- `catalog-rules.js` defines material recipes, processing and resource yields. `building-models.js` mirrors the model metadata without importing Three into the simulation. All 28 Homes/Buildings models have playable definitions and their exact art footprints. Resource sites and camp props bring the catalog to 57 choices, including the four first-camp shortcuts. Construction-state models remain automatic stages rather than separate buildings.
- The categorized, searchable build tray supports repeated buildings and placement across the 64×64 plot. Buildings require access; the river generator must be at the riverbank. The current plot has no crossing to the disconnected western bank.
- Material inventory remains shared camp/storage inventory. Construction reserves material for the site; residents carry recipe-sized loads. Production reserves inputs, uses resident work, and carries output back to stores. Warehouses add 600 units of capacity. Buy materials in town or sell full batches of surplus for half the purchase price. Resource sites provide finite earth/stone/salvage and renewable timber/bamboo. Gardens, orchards, livestock and kitchens produce food through explicit jobs. Keep 24 in stock repeats a selected job only while its primary output is below the target; inputs, growth, utilities and capacity still apply.
- Electrical connections consume cable supplies and resident installation work. Solar output follows daylight, river generators run continuously, rooftop systems supply homes, and batteries retain energy per connected component. Water services have priority over production under shortage. Turning off or removing a line isolates its loads. Generator/storage capacities and peak rates follow v0.1 (solar 6 kW / 36 kWh, hydro 2.34 kW / 18 kWh, roof 0.6 kW / 4 kWh). The renderer uses at most eight nearby point lights; distant simulation loads still operate.
- Water stays in local camp/building tanks, separately classified as fresh, irrigation, greywater or sewage. Residents can carry 12-unit sealed loads. Installed pipes require plumbing, pump equipment, resident work and electricity at their source. A powered river intake delivers irrigation water; a separately powered cistern filters it into fresh water. Rain capture is irrigation water until filtered. Reed beds return treated greywater to irrigation; banana beds remove sewage through treatment/evaporation; biodigesters produce biogas usable by kitchens. Treatment never returns sewage as drinking water. Full tanks block delivery without deleting the carried liquid.
- These are adapted gameplay systems, not a binary port of every v0.1 subsystem: material stores are shared rather than per-warehouse logistics, connection routes are direct endpoint links rather than tile-by-tile pipe/cable editing, and pressure/elevation, equipment maintenance, food spoilage and the old outside-job/market simulations are not implemented here.

Run `node scripts/verify-v02-economy.mjs` for catalog parity, resource production, inventory/sales, installation, disconnected/night power, conservation, river intake, filtration/treatment and save tests. Existing weekend and resident/presentation checks remain applicable.

`?utilities-preview&performance` is a separate, unsaved demonstration with ten completed buildings, connected solar/batteries, a powered river intake, cistern, garden irrigation, sanitation and workshop. Use building details to queue work, and Power & water to inspect or change the networks. It never overwrites the player village.

### Sunlight and shadows

Sunlight follows the game clock (sunrise 06:00, sunset 18:00): shadows turn and shorten toward noon, then lengthen toward sunset. Rain fades direct light and shadow contrast over three seconds while retaining diffuse sky light. Sunlight contributes no cast shadows at night; powered lamps retain their separate lighting. The sun uses the existing single 2048px shadow map with expanded depth coverage for its daily orbit.

For an unsaved, paused comparison use `?utilities-preview&lighting-hour=8`, `lighting-hour=12` or `lighting-hour=16`; add `&lighting-rain` for overcast conditions. Run `node scripts/verify-v02-sunlight.mjs` for orbit, shadow-length, weather and night checks.

### Building interaction audit

See [the building-by-building audit](../../../docs/v02/building-interaction-audit.md) for functional coverage and decorative-prop limits. Run `node scripts/verify-v02-buildings.mjs` to exercise all build choices and production recipes through actual resident work. Use `?utilities-preview&interactions` for an unsaved scene with exhausted residents, a supplied wash station, and queued milk/egg production.
