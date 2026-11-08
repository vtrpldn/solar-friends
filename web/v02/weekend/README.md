# Our first weekend

A standalone v0.2 playable at `/v02/weekend/`. It uses the shared 3D catalog and resident rigs, but no v0.1 simulation code or saves.

## Why

Test a short loop of choosing a campsite, placing practical projects, watching friends carry and build, and improving the arrangement. The first evening is available after a gathering place and one practical improvement; there is no multi-day unlock gate. This is a compact first playable, not yet a 20–30 minute campaign.

Choose one of three camps, select a project, then click a clear grid square. Project buttons in the journal open priority and relocation controls. WASD/arrows or left-drag pan relative to the camera; Shift pans faster. Q/E or right-drag turn the view. Scroll or +/− zoom; Home centers the camp. Keyboard movement works while paused, ignores text fields and dialogs, and stops on focus loss. Pause and 4× speed are available. The evening button ends construction for this session; New weekend asks before replacing its save.

- Five autonomous friends share work, carry materials, recover energy and use an installed tank for washing breaks.
- Physical materials are reserved at planning time; construction never deducts money. Each recipe determines the number of carrying loads, followed by resident assembly labor. Work access is protected during placement and relocation. Two friends can work on each project.
- An entrance camp needs a runoff decision during the shower. Other sites drain well. Raising supplies consumes timber; moving them is free.
- Town purchases offer timber, fasteners, roofing, tarp/rope, tanks, plumbing and toilet kits. Money is spent only when buying these supplies. Trips take 55 active simulation seconds; inventory arrives on return, including after reloading.
- Meals, drinking water and tents cover initial essentials. Detailed consumption, sanitation processing, overnight sleep, tool inventory, terrain excavation and a second day are not simulated here. The temporary toilet contributes to the evening outcome.
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
