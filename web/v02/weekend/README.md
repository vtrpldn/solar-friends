# Solar Friends v2 gameplay

Updated 2026-11-09. Public and local route: `/v2/`. The source folder remains `web/v02/weekend/`; v1 code and saves are separate.

## Why

Build an ecovila through planning, resource tradeoffs and resident activity. The current game has moved beyond the original first-evening prototype: the complete playable catalog is available without a linear quest-unlock campaign. Earlier opening and journal proposals are historical, not current onboarding instructions.

## Starting and navigating

New game opens setup for Mata Atlântica, Cerrado or Caatinga, landscape, water availability, land resources, savings, supplies and town access. Defaults include R$220 and standard camp supplies. Terrain, elevation, river, trees and deposits vary with the seed on a 128×128-cell map. Arrival uses two Jimny-inspired vehicles. Follow the on-screen camp placement prompt, then choose what to build.

WASD/arrows or left-drag pan; Shift pans faster. Q/E or right-drag rotate the camera. Scroll or +/− zoom; Home centers camp. Placement supports a model wireframe and rotation. Buildings and tents can level their footprint; basic terrain tools do not currently charge money or labor.

Normal play supports speeds through 16×. Opening management/planning screens pauses time. View & options contains camera controls, sound, saves and main-menu navigation. Layouts adapt to smaller/shorter windows; desktop is the tested platform. `responsive.css` is loaded after the existing game/menu styles.

## Residents and construction

Five friends have distinct identities, preferences and needs: energy, hunger, toilet, hygiene, social contact and fun. Needs can interrupt work. Residents approach service buildings, rest inside accommodation, wash, socialize and use leisure destinations with articulated animations. These remain a simplified simulation, not a complete model of human behavior.

Blueprints reserve materials; residents haul supplies and assemble projects. Money pays for purchased supplies and services, not construction labor. Build-menu auto-buy can order missing materials if affordable. Supply trips use vehicles and deliver on return. Access and terrain constraints still apply. Roads and bridges are build choices; roads require resident construction. Buildings expose applicable relocation/removal and service controls rather than universal power switches.

Raw materials come from generated deposits, cultivation and player-selected tree cutting. Raw wood can be processed into timber and planks. Workshop recipes, crops and animal products use inputs, work and storage; regrowth limits repeat harvests. Animals are counted individually. Reclaimed parts are retired from the active economy.

## Water, power and sanitation

Separate management screens show water, power, resources and finances. Residents can carry river water and purify it; maintaining a drinking-water reserve reduces repeated orders. Wells and pumps provide other sources. Water quality and storage matter, and pending crop work does not prevent watering.

Completed applicable buildings connect automatically. Grid power costs money; solar and river generation support going off-grid. Machinery demand depends on productive work and necessary inputs; lights depend on night. A passive toilet or road does not incur an arbitrary machinery load. Sanitation includes toilet servicing, ecological treatment and biodigestion. House solar equipment is an optional upgrade rather than a mandatory early-house cost.

## Production and surplus policies

Resources → **Village work & trade** provides:

- Work priorities for food/water, maintenance, production and construction, plus worker reservations. Available residents fill these roles; their own needs take precedence. Assigned batches normally finish before category reassignment.
- Per-resource automatic sales with a minimum reserve, trigger stock and daily unit cap. Zero cap means unlimited. Sales use whole trade batches and existing manual-sale prices, and appear in Finances.
- Food and the next two batches of repeating production remain protected. Already committed construction/production inputs are outside available stock. Automatic sales default to off and do not run in sandbox.

Each production site has a configurable stock target (default 24). Pending output counts toward it. Set the target sufficiently above the protected reserve to allow at least one sale batch. A target is a stopping threshold, not an exact inventory cap: a whole production batch may cross it.

Bamboo, crops, honey and livestock were rebalanced on 2026-11-08. See [the balance note](../../../docs/balance/2026-11-08-economy.md) for measured replay results and the distinction between theoretical returns and actual earnings.

## Saves and modes

Story and sandbox retain separate mode state. View & options → Saved villages creates named saves and offers load, rename, delete and export. Previous snapshots support recovery. Invalid restoration must not silently replace a saved village with a fresh one. Browser-local saves are not cloud saves; export important villages.

Sandbox replenishes supplies and offers optional instant buildings while resident needs and infrastructure still simulate. The lab uses a separate storage key and worker, supports targets through 1024×, and reports achieved speed. CPU limits mean the requested multiplier is not guaranteed. Lab reports and scripted replays must be distinguished from regular browser play.

## Implementation and checks

- `simulation.js`: state, commands, construction, production and scheduling.
- `catalog-rules.js`: material and recipe definitions; `economy-policies.js`: reserves, sales and work settings.
- `game.js`: scene and game interaction; `management.js` and `economy-controls.js`: planning screens.
- `resident-needs.js`: needs; shared `../residents/` code: rigs/animation.
- `lab-worker.js` / `lab-runner.js`: isolated acceleration with fixed simulation steps.

Run the targeted verification commands listed in the [root README](../../../README.md). The [68-type catalog playthrough](../../../docs/playtests/2026-11-08-regular-catalog.md) records actual construction through normal gameplay. The [three-day replay](../../../docs/balance/2026-11-08-economy.md) checks subsequent policy changes. Neither proves balance for every biome, seed or layout.
