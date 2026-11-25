# Solar Friends v2 gameplay

Updated 2026-11-09. Public and local route: `/v2/`. The source folder remains `web/v02/weekend/`.

## Why

Build an ecovila through planning, resource tradeoffs and resident activity. The current game has moved beyond the original first-evening prototype: the complete playable catalog is available without a linear quest-unlock campaign. Earlier opening and journal proposals are historical, not current onboarding instructions.

## Starting and navigating

New game opens setup for Mata Atlântica, Cerrado or Caatinga, landscape, water availability, land resources, savings, supplies and town access. Defaults include R$10,000 of working capital and standard camp supplies. Tight starts have R$3,000 and comfortable starts have R$20,000. Land and both vehicles are already owned, not purchased from this cash. Terrain, elevation, river, trees and deposits vary with the seed on a 128×128-cell map. Arrival uses two Jimny-inspired vehicles and can be skipped (Skip, Esc, Space, Enter or a click on the land). Choosing the camp shows the whole camp under the cursor with measured facts about the site: walking distance to the cars and supplies, walking distance to the nearest river access, how far the ground falls across the site, and trees within 12 m. R turns the camp; a click pitches it. The friends then carry eight loads of camping gear from the cars, and each appears at camp as it is set down. **Move camp** stays available until the first load is set down or something is planned. The building supplies stay at the unloading point beside the cars. Check: `node scripts/verify-v02-camp-start.mjs`.

WASD/arrows or left-drag pan; Shift pans faster. Q/E or right-drag rotate the camera. Scroll or +/− zoom; Home centers camp. Placement supports a model wireframe and rotation. Buildings and tents can level their footprint; basic terrain tools do not currently charge money or labor.

Every toolbar and HUD destination has a key, shown as a badge on its button: B Build, J Projects, N Residents, T Terrain, M Finances, O Neighbours, K Items & equipment, C Crafting, Y Food, I Resources, U Water, P Power, L Lenses, H Guide, V View & options, X Advance days. `?` lists them all in the game. Enter selects or places at the center reticle, R rotates, Esc steps back one layer. `keyboard-shortcuts.js` is the only place a key is defined: handlers, badges and the in-game list read that table, and `scripts/verify-v02-keyboard-shortcuts.mjs` plus `scripts/verify-v02-keyboard-browser.mjs` fail on duplicate bindings or drift. Mnemonic letters follow the printed key on any layout; W A S D, Q/E, `,`/`.` and the number row follow physical position.

Normal play supports speeds through 16×. Opening management/planning screens pauses time. View & options contains camera controls, sound, saves and main-menu navigation. Layouts adapt to smaller/shorter windows; desktop is the tested platform. `responsive.css` is loaded after the existing game/menu styles.

## Residents and construction

Five friends have distinct identities, preferences and needs: energy, hunger, toilet, hygiene, social contact and fun. Needs can interrupt work. Residents approach service buildings, rest inside accommodation, wash, socialize and use leisure destinations with articulated animations. The resident panel includes an Overview, Story, Skills, and Relationships. Each friend has an authored history, motivations, fears, flaws, boundaries, and a personal building hope. Bedtimes, social appetite, break timing, leisure preferences, and work choices differ by personality. Explicit project priorities and essential work policies remain in charge; residents do not place their own blueprints.

Conversations require a willing partner and physical arrival. Residents respect sleep, urgent needs, carrying trips, and quiet time after a break. Two lonely workers can agree to stop for a conversation. Shared interests and listening affect friendship differently; declining carries no penalty. Completed conversations, personal time, and fulfilled building hopes produce up to six saved memories per resident, with current thoughts and recent memories visible in the panel. Older saves initialize this history through play. Biographies describe room for growth; they do not imply a simulated trauma, romance, conflict, or long-term personality-change system.

Blueprints reserve materials; residents haul supplies and assemble projects. Money pays for purchased supplies and services, not construction labor. Build-menu auto-buy can order missing materials if affordable. Supply trips use vehicles and deliver on return. Access and terrain constraints still apply. Roads and bridges are build choices; roads require resident construction. Buildings expose applicable relocation/removal and service controls rather than universal power switches.

Planned sites are set out on the ground: a lime line around the real rotated footprint, corner stakes with string, and a translucent ghost of the finished building that fades as the frame rises. A survey pennant and an empty pallet mean the site is waiting for materials; the pallet fills as loads arrive; once work starts the pennant comes down and a sawhorse stands on site. A run of planned road tiles shares one outline, a bridge shows only its ghost and end stakes, and a relocation marks its reserved destination the same way. Props without construction-stage models stay ghosted until work begins. `planned-sites.js` draws all of this; check it with `node scripts/verify-v02-planned-sites.mjs`, and regenerate comparison screenshots with `node scripts/capture-v02-planned-sites.mjs <folder>`.

Raw materials come from generated deposits, cultivation and player-selected tree cutting. Beds grow leafy greens, bush beans, sweet corn, cassava (mandioca), sweet potato (batata-doce), pumpkin (abóbora) and cowpeas (feijão-de-corda); cassava, sweet potato and cowpeas tolerate dry soil and keep growing through the dry season (`crops.js`, [farming notes](../../../docs/farming.md)). A kitchen toasts cassava into farinha provisions that keep a month. An orchard is planted with the fruit tree of its land: pequi in the Cerrado and umbu in the Caatinga, both drought-adapted ([biological timings](../../../docs/economy-biology.md)); `/v2/?scale-preview=farm&biome=cerrado` shows one. A coffee grove is a cash crop: roughly one harvest a year after three or four years of establishment, sold dried to the town café (`/v2/?scale-preview=farm&look=57,70`). Raw wood can be processed into timber and planks. Workshop recipes, crops and animal products use inputs, work and storage; regrowth limits repeat harvests. Animals are counted individually. Reclaimed parts are retired from the active economy.

When no work or urgent need calls, residents choose a short activity rather than stand at a leisure destination: sitting and warming their hands by the fire, reading, stretching, or walking between two places. Visits begin after arrival and end after a finite stay; recent choices discourage repetition. Evening fires, daylight reading, shelter in rain, and personal preferences affect the choice. Nearby willing residents can start a fireside conversation. New work interrupts casual downtime, and transient visits are replanned after loading. The unsaved `/v2/?downtime-preview` scene demonstrates these behaviors.

Nature look: wild trees grow as groves (`natural-resources.js`): clumps of close-standing trees with open meadow between, about four times the earlier tree count on new land; saved villages keep the trees they have. `natural-look.js` turns and nudges each tree off the grid, sizes it by its place in the grove, bends its trunk and reshapes its crown, gathers undergrowth, saplings and deadwood around groves, leaves stumps after felling, and builds stone outcrops and earth deposits as seeded models that show how far they have been worked. `/v2/?nature-preview` is an unsaved scene with every deposit stage; `/v2/?nature-preview=grove` shows a part-felled grove; `&nature=plain` on any game URL falls back to the earlier catalog models.

## Neighbours

**Neighbours** (O) is where the friends call a Saturday mutirão, offer a weekend course or hold a festa. The neighbours' goodwill decides how many people come; help received is repaid with a day of a resident's work. On Sundays the friends sit down for a roda. Rules, numbers and limits are in [village life](../../../docs/village-life.md); check with `node scripts/verify-v02-village-life.mjs`.

## Water, power and sanitation

Separate management screens show water, power, resources and finances. Residents carry river water and purify it automatically for camp/tank reserves by default; the Water screen can disable this routine. Sanitation maintenance also defaults to on. Wells and pumps provide other sources. Water quality and storage matter, and pending crop work does not prevent watering.

Completed applicable buildings connect automatically. Grid power costs money; solar and river generation support going off-grid. Machinery demand depends on productive work and necessary inputs; lights depend on night. A passive toilet or road does not incur an arbitrary machinery load. Sanitation includes toilet servicing, ecological treatment and biodigestion. House solar equipment is an optional upgrade rather than a mandatory early-house cost.

## Production and surplus policies

Resources → **Village work & trade** provides:

- Work priorities for food/water, maintenance, production and construction, plus worker reservations. Available residents fill these roles; their own needs take precedence. Assigned batches normally finish before category reassignment.
- Per-resource automatic sales with a minimum reserve, trigger stock and daily unit cap. Zero cap removes the player-set cap; the buyer’s finite daily demand still applies. Sales reserve whole trade batches for physical town trips, use the named buyer’s quoted price bands and daily demand, and pay only when the driver reaches town. Finances distinguishes receipts from pending exports.
- Food reserves remain protected. Already committed construction/production inputs are outside available stock. Automatic sales default to off and do not run in sandbox. Separately, while automatic food management is on, residents set aside for sale any food that would spoil before the village could eat it (`sellFoodSurplus`).

Residents start gathering, extraction, processing, composting, crafting and tool repair themselves, at regular speed and during Advance days (`autonomous-work.js`). A completed, switched-on site gets a job when the village holds less than two batches of what it makes (one of each durable tool; fodder only with animals), inputs are in stores, shared storage stays below 80%, and the site is a reachable walk of at most 60 cells from the village stores. Worn tools are repaired first. Standing trees, installations and distant or unreachable sites remain player work orders, and manual orders still work everywhere. Kitchens follow the food policy, which now defaults to automatic; mature compost is applied to beds below 70% fertility. Loading an older save removes its repeat settings and stock targets while preserving active jobs, reserved materials, and cargo.

The current [calibration register](../../../docs/economy-calibration.md) separates published references from engineering assumptions. Crops grow for weeks, new orchards establish over years, timber grows over six favorable years, and animals require feed and water. [Biological timings](../../../docs/economy-biology.md) and the [complete parameter export](../../../docs/economy-parameter-register.json) state quantities and assumptions. Historical November 8 returns do not describe these revised timings.

## Saves and modes

Story and sandbox retain separate mode state. View & options → Saved villages creates named saves and offers load, rename, delete and export. Previous snapshots support recovery. Invalid restoration must not silently replace a saved village with a fresh one. Browser-local saves are not cloud saves; export important villages.

Sandbox replenishes supplies and offers optional instant buildings while resident needs and infrastructure still simulate. The lab uses a separate storage key and worker, supports targets through 1024×, and reports achieved speed. CPU limits mean the requested multiplier is not guaranteed. Lab reports and scripted replays must be distinguished from regular browser play.

## Implementation and checks

- `simulation.js`: state, commands, construction, production and scheduling.
- `catalog-rules.js`: material and recipe definitions; `economy-policies.js`: reserves, sales and work settings.
- `game.js`: scene and game interaction; `management.js` and `economy-controls.js`: planning screens.
- `resident-needs.js`: needs; `resident-personality.js`: authored identities; `resident-mind.js`: invitations, preferences, thoughts and saved memories; shared `../residents/` code: rigs/animation.
- `lab-worker.js` / `lab-runner.js`: isolated acceleration with fixed simulation steps.

Run the targeted verification commands listed in the [root README](../../../README.md). The [68-type catalog playthrough](../../../docs/playtests/2026-11-08-regular-catalog.md) records actual construction through normal gameplay. The [three-day replay](../../../docs/balance/2026-11-08-economy.md) checks subsequent policy changes. Neither proves balance for every biome, seed or layout.

Resident behavior checks: `node scripts/verify-v02-resident-agency.mjs`. Desktop profile checks: `node scripts/verify-v02-resident-agency-browser.mjs` (optionally set `SOLAR_EVIDENCE_DIR` for screenshots). Both also run in CI.

Downtime and seated-pose checks: `node scripts/verify-v02-downtime.mjs`.

## Physical economy

New building plans capture their paid material bill so later balance changes cannot add unpaid materials to a saved project. Basic homes do not require rooftop solar or batteries. Resident work, carrying, needs and access determine completion time. Demolition, salvage and relocation require resident work; salvage returns only the documented fraction.

Purchases reserve finite supplier allocations and transport costs. Two cars have independent drivers and cargo limits; paid freight handles larger orders. Optional trip consolidation avoids sending a car for every small batch. Perishable goods retain their age while reserved or travelling. Storage, refrigeration and preservation are separate choices.

In Story, open **Finances → Paid work in town**, choose a resident and click **Book one day shift**. The same control is in **Residents → Overview**. Residents leave between 08:00 and 11:00 when rested and available. An eight-hour shift adds R$152–192 to shared savings after the R$8 bus fare. Residents can also repeat a four-hour shift on weekdays. Finances separates household food, building investment, transport, supplies, grid costs and income, shows a configurable expansion cash reserve, and forecasts from observed completed days. Upkeep consumes actual parts and resident labor; inspect pending jobs in Finances for missing supplies and their locations.

Bulk controls show kilograms, milk liters and discrete equipment counts. Internal fixed-pack save records remain behind explicit conversions; displayed physical units do not retroactively rescale existing stock. Current ownership and the bounded store-movement ledger are separate views of the same authoritative goods.
