---
description: Build player-facing map and scenario tools using the authored resident cast.
---

# Map and scenario builder implementation plan

Status: implementation in progress. **Scope revision: resident creation/customization was removed at the player’s request on 2026-11-03. Historical implementation notes below record retired work and do not reintroduce it.** Delivery target: the desktop game, with 64×64 maps, at least three Brazilian biomes, and the existing authored cast. The original five friends remain a ready-made cast.

Required launch biomes: **Mata Atlântica, Cerrado, and Caatinga**. Both player-facing builders must support all three throughout creation, editing, saving, sharing, and play, with distinct vegetation, terrain presentation, climate, and resource tradeoffs. The authored cast must work in each biome. This is a minimum release requirement, not a limit on future biome additions; detailed acceptance criteria appear under Brazilian biome presets below.

**Builder acceptance criterion:** a regular player can create a map and a playable scenario in each of these three Brazilian biomes from the normal Create menu, without developer tools. Each biome provides its own starting template and generation preset, and retains its identity when the creation is exported, imported, and played.

Residents use authored appearances and character definitions. The original five friends are the available cast. New characters are added to the game deliberately when needed; there is no resident creation or customization feature.

## Why

Players should be able to design a Brazilian countryside property, choose the existing friends who will live there, decide what they arrive with, and create a playable ecovila story or challenge. A map might offer fertile clearings but distant water; a scenario might ask the community to become self-sufficient before the dry season. These should be possible through ordinary game controls, without developer tools, JSON editing, or programming.

The first release should deliver the complete loop: create, edit, save, test, revise, export, import, and play. Its foundation must keep authored content separate from a living village so editing a river, testing a quest, or sharing a scenario cannot corrupt another game.

## Product scope and player journey

Add **Create** and **Scenarios** to the main menu. Keep Story and Sandbox as the familiar ways to play. Create offers map/scenario projects; Scenarios opens installed scenarios and their saved playthroughs. Both use existing authored friends. No development URL or debug flag is required.

Distinguish three creations in plain language:

- **Map:** the property itself, including land, river, vegetation, deposits, and arrival locations. Players can reuse a map in different scenarios or start an ordinary Sandbox on it.
- **Scenario:** a map plus starting buildings, supplies, the friends' initial circumstances, simulation rules, and optional objectives and events. It can be an open-ended village, a guided story, or a challenge.

The creation flow is **Choose a starting point → Shape the land → Choose the arriving friends → Set up the village → Add a story if wanted → Test → Save and share**. These are workspace tabs, not mandatory forms; players can return to any step. A map-only creation uses a validated default arrival preset when launched in Sandbox, with the existing authored friends. That preset previews its camp, shed, and storage placement rather than overwriting authored terrain unexpectedly.

Start with an open property, a generated property, or a small set of prepared templates, then choose its Brazilian biome. The first release must support **Mata Atlântica, Cerrado, and Caatinga**, each through the ordinary creation interface. Generating a new landscape previews the result before replacing the current land. Regeneration, object deletion, and moving the camp are undoable.

### First release boundaries

| Include | Defer to a separate expansion |
| --- | --- |
| 64×64 properties, with dimensions represented explicitly in the format | Larger or rectangular maps and resizing existing maps |
| At least three complete biome presets: Mata Atlântica, Cerrado, and Caatinga, with distinct artwork and environmental behaviour | Additional biome packs and detailed simulation of transitions between regional biomes |
| Current flat 2:1 isometric projection and approved artwork | Elevation, cliffs, excavation, bridges, free camera rotation |
| Editable rivers, habitats, soil, vegetation, and resource deposits | Flood simulation and unrestricted hydrological modelling |
| All existing buildings and supported appearances, roads, resource plots, and utilities | Arbitrary imported artwork, new building types, and unsupported building rotations |
| Select existing authored friends and configure arrival circumstances | Unlimited populations, children/aging simulation, arbitrary occupation scripts, and scripted immigration |
| Linear chapters, optional goals, simple event sequences, and explicit outcomes | General scripting, branching campaigns, and multi-map campaigns |
| A local library, independent saves, and file sharing | Accounts, an online gallery, ratings, moderation, and collaborative editing |

The builder uses instant authoring actions. When the scenario starts, construction, demolition, salvage, hauling, work, and resident needs follow the selected gameplay rules. Editing remains a separate activity from playing.

## Existing foundations and refactors

The current code has useful rendering, simulation, placement, and validation systems. The development scenario system should provide regression examples, rather than become the public editor format.

| Current code | Constraint | Required change |
| --- | --- | --- |
| `src/lib.rs`, `web/terrain.js`, `web/habitats.js`, `src/land/habitat.rs` | Dimensions, river shape, and habitat geography are constants or duplicated formulas. | Introduce an authoritative world definition and shared world queries; render the resulting geography. |
| `src/land.rs` | Deposits use nine fixed regions; validation expects those exact regions. The starter fertility patch still uses coordinates 4–16. | Store authored deposits and soil baselines. Validate their structure, bounds, and conservation instead of requiring the default generator output. |
| `src/land/vegetation.rs` | Validation expects the seed's exact tree list. The original clearing exclusion remains tied to old coordinates. | Give authored vegetation stable identities and validate species, scale, bounds, and density. Make clearings explicit template content. |
| `src/climate.rs`, `src/land/habitat.rs`, `src/land/vegetation.rs`, `web/nature-art.js`, `web/terrain.js` | Climate uses one seasonal profile and introductory rain schedule; local habitats, species selection, shade, and landscape artwork assume the current property. | Introduce versioned biome/climate and species catalogs. Distinguish regional biome from local habitat, and resolve flora, shade, terrain visuals, and forecasts through shared metadata. |
| `src/modes.rs`, `src/founding.rs` | New games construct a default village and then reset selected systems and add founding buildings. | Compile a definition into a fresh village through one controlled initialization path. |
| `web/dev/scenarios.js`, `web/dev/material-fixture.js`, `web/dev/center-layout.js` | Scenes modify snapshots, translate coordinates, and delete or rebuild owned resources and derived systems. | Replace this technique incrementally with supported scenario definitions. Never expose the version-3 fixture reset path to player imports. |
| `src/navigation.rs`, `src/logistics.rs`, `web/frame-state.js` | Navigation and render caches assume terrain is mostly static. | Add explicit geometry and appearance revisions, including invalidation after undo. |
| `src/mobility.rs`, `src/water.rs` | The town gate is found at fixed edges and the neighbour water service is positioned relative to a fixed side. | Represent arrival, departure, and outside-service access as validated world anchors. |
| `src/progression.rs`, `web/quests.js` | Thirteen indexed chapters, completion arrays, objective functions, and unlock mappings are embedded in code. | Add stable objective IDs and a native condition evaluator, then migrate Story incrementally behind an adapter. |
| `src/sandbox.rs`, `src/modes.rs` | Several simulation choices are inferred from Story versus Sandbox. | Separate rule profiles from scenario content and session type. |
| `src/lib.rs`, `src/economy.rs`, `src/workforce.rs`, `src/skills.rs`, `src/progression.rs`, `src/simulation.rs` | Resident state uses five-element arrays, fixed relationship grids, numeric-slot abilities, and participation bitmasks. | Introduce stable resident IDs and roster-backed state; store capabilities and preferences as character data. Audit every reader, writer, and validator before accepting custom rosters. |
| `src/occupations.rs`, `src/sleep.rs`, `web/main.js`, `web/resident-animation.js`, `web/sprite-frames.js` | Jobs, bedtimes, portraits, colours, and sprite selection assume the original cast. | Use occupation and appearance catalogs, resident-owned routines, and authored portrait/animation assets. |
| `web/main.js`, `web/village-storage.js` | Startup, rendering, input, previews, and saves share one controller; storage has one slot per mode. | Extract session ownership, rendering/input boundaries, and a multi-project storage repository. |

The recent camp and camera centering work remains useful: `Village.camp` is a real anchor, and founding buildings already use relative offsets. Complete that refactor by removing the remaining invisible geography tied to the previous map layout. Center a new map's camp and camera by default, while allowing an author to place both independently.

Avoid a general engine rewrite. Extract responsibilities needed by the first playable editor, preserving existing APIs behind adapters until their callers migrate. Do not gate the first useful map builder on converting all thirteen Story chapters, all developer fixtures, or all UI panels.

Suggested module boundaries are `src/world/` for geometry and authored land, `src/scenarios/` for definitions/compilation/validation/runtime progress, `src/residents/` for character definitions and roster services, `web/editor/` for tools and transactions, and separate web modules for session ownership, the shared world renderer, authored resident artwork, and content storage. Introduce each boundary when its first feature needs it; existing simulation systems keep their domain responsibilities.

## Data and runtime design

### Separate definitions from playthrough state

| Record | Owns | Does not own |
| --- | --- | --- |
| `BiomeDefinition` | Versioned habitat/species palettes, generator defaults, compatible climate profiles, terrain art references, and bounded environmental parameters | A universal soil or geology value for every property, or a running weather history |
| `MapDefinition` | Biome/profile revision, bounds, resolved terrain and water data, habitat and soil baselines, geological deposits, natural vegetation, arrival and outside-access anchors | Resident jobs, depletion during play, shipments, achievements |
| `ResidentDefinition` | Versioned identity text, appearance recipe, supported traits/interests, initial skills, preferred routine, and occupation key | Live needs, earned experience, active work, relationships with people in another village |
| `ScenarioDefinition` | An exact map revision, starting settlement and inventories, cast setup, rules, objectives, events, briefing, and camera start | Live work queues, cache contents, completed rewards from a test |
| `EditorProject` | Editable definitions, title, local identity, revision, recovery checkpoints, and editor view state | The current playtest's simulation changes |
| `ScenarioRuntime` | Active goals, measured progress, timers, triggered events, choices, and granted effects | Editable authoring definitions |
| `GameSave` | A running village and its scenario runtime, plus the exact content revision and compatible ruleset version | A mutable link to whichever draft the author edits next |

Use stable string keys for biomes, climate profiles, materials, species, buildings, variants, goals, and authored entities. Translate them to runtime IDs during compilation. Public files must not depend on array positions such as a material index or a chapter number. Saves and exported creations retain the selected biome/profile revisions and authored overrides; unsupported revisions receive a compatibility error rather than silently falling back to Mata Atlântica.

Authored cast-member IDs and live resident IDs are distinct. Preserve references across ordering changes. A scenario embeds the authored character definitions it uses, so future game-content additions do not rewrite existing runs. Starting friendships reference cast-member IDs. Player identity/appearance editing and resident packages are not supported.

Persist the resolved 64×64 map along with the seed and generator version. A future generator update must not silently redraw an exported property. Keep separate random streams for geography, decoration, climate, and scenario events so adding flowers does not change the upcoming weather.

Store schema versions independently for authoring documents and game saves. Each run embeds, or durably retains, its frozen scenario revision. Editing a draft or importing a newer revision affects new runs only. Compatibility declarations also cover ruleset changes: retaining scenario bytes alone cannot guarantee identical behaviour under a different simulation version.

### Introduce a deterministic scenario compiler

Create a native definition-to-game API with structured errors and warnings. Its ordered responsibilities are:

1. Parse bounded data, resolve versions and catalog keys, validate references, and resolve the rule profile before any initialization grants or replenishment can occur.
2. Instantiate world geometry, environmental baselines, and access anchors.
3. Allocate runtime identities and place buildings, plots, roads, and utility infrastructure.
4. Create storage, tanks, equipment, and production sites through domain constructors.
5. Allocate starting supplies to owners, assign food ages and equipment condition, and establish conservation baselines once.
6. Initialize the authored roster from its resident definitions, validate starting locations and relationships, and initialize rules and scenario progress.
7. Derive shade, navigation, networks, capacities, and initial reports.
8. Validate the assembled village, then atomically make it the requested session.

A failed compilation leaves the current editor draft and active village intact. Drafts can be incomplete and still saved; only launching a playtest or a playable release requires resolving blocking errors.

Extract parsing, migration, validation, and installation from the current `restore` method. Loading a running game must preserve its ownership, work, dates, and history; compiling a new scenario must initialize those fields deliberately. Do not use a save migration to replenish or normalize player-authored content.

### Make world queries authoritative

Introduce shared queries for bounds, land and water, banks, flow suitability, soil, footprints, entrances, approach spots, navigation, and outside access. Rust owns gameplay answers; JavaScript consumes world data and native validation results rather than reproducing geography formulas. Update river ripples, rain and wet-ground masks, minimap colouring, and land overlays alongside the terrain renderer; they must all follow the same authored water geometry.

Expose catalog metadata needed by both the builder and normal gameplay: footprint, supported appearances, valid surfaces, access points, utility ports, configurable starting state, and storage compatibility. Editor placement bypasses cost, labour, and unlock checks while retaining physical placement and access checks.

Use distinct revisions for geometry, vegetation/shade, terrain appearance, utilities, and rules. Update dependent caches when a relevant revision changes. One brush stroke is one transaction; expensive rebuilds occur once per transaction or use a bounded preview during dragging. Preserve the existing lightweight frame-state sampling instead of serializing the entire world for every pointer movement.

## Player editing tools

### Workspace and interaction

The map stays central. Use the game's existing palette, typography, sprites, sounds, and control styling. Provide a compact tool belt, a contextual inspector, and a persistent top strip with the project name, saved state, **Undo**, **Redo**, **Test**, and **Back**. Keep the primary action in the same position across inspectors and dialogs.

Support pan, zoom, center on camp, minimap navigation, grid toggle, selection, multi-selection, erase, brush size, and cell inspection. Provide keyboard equivalents, visible focus, labelled icons, and status feedback that does not depend only on colour. Shortcuts must not fire while typing. Escape cancels the active stroke or placement before closing a panel; Delete acts on the current selection.

Group a drag or brush stroke into one undo step. Copying objects assigns new identities and remaps internal references. Deleting a referenced building or zone explains which goals or connections will be affected; the draft may keep a visible unresolved reference, but nothing should be silently retargeted. A quick move, undo, and redo must restore exactly the same document.

### Land and ecology

Offer selectable terrain and habitat brushes, soil presets, river drawing, and nature placement. The inspector explains gameplay effects such as fertility, retention, shade, extraction, and building suitability. Show live overlay layers for terrain, water access, fertility, deposits, shade, walkability, utilities, and goal regions.

River presence is optional in every biome. A property without a river remains valid when its arrival setup provides attainable water access and compatible goals. River drawing authors a connected course and derives its banks and water cells together; require valid inlet/outlet and usable bank geometry only when a river exists. Hydro eligibility depends on flowing channel data and accessible banks, never simply a blue-painted tile. For the first release, eligible bank segments must also match the existing generator sprite's orientation, footprint, and worker approach; mark them explicitly in the placement overlay. Other bends remain valid river scenery without offering unsupported hydro placement. Initial presets support no river or an explicitly authored perennial river. Seasonal channels that dry out, lakes, bridges, and isolated waterways wait until their complete visual, navigation, water-access, and generation rules exist.

Place individual plants or paint clusters of approved species. Brushes have density and spacing limits, with restrained variation within the art catalog's scale ranges. Include a clear-meadow brush and preserve open land around the default camp. Separate natural plants, decorative ground cover, renewable production plots, and finite geological deposits; a decorative rock should not implicitly become a stone reserve.

Authors place geological patches and choose finite starting quantities within supported limits. Establishing a quarry remains a gameplay decision unless the scenario explicitly includes one. Changing a deposit does not create unexplained loose stock. Soil and water presets use consistent physical meanings; cosmetic paint cannot disagree with growth, shade, routes, or placement.

### Brazilian biome presets

At least three biomes are a release requirement for both map generation and scenario authoring. Give each a selection card with a landscape preview, supported local habitats, water/climate summary, and suggested planning challenges. Biomes are regional settings; a meadow, riverbank, or rocky patch is a local habitat inside that setting. Painting a habitat must not change the entire property's climate.

**Minimum supported scope:** players must be able to create, edit, save, share, and play maps and scenarios in all three launch biomes: Mata Atlântica, Cerrado, and Caatinga. Three is a minimum, not a fixed engine limit; adding another biome should extend the versioned content catalogs rather than require a separate editor or scenario format.

Both the map builder and the scenario builder must offer all three biomes to regular players, including blank creations and templates. No launch biome may be restricted to developer tools or prepared scenarios. The authored cast must work in every biome.

The starting-point screen must show **at least three selectable Brazilian biomes together: Mata Atlântica, Cerrado, and Caatinga**. Players can compare landscape previews and water, farming, and resource tradeoffs before generating land. Scenario creation inherits the map's biome; its summary and exported file must identify that same biome. Validate this agreement when compiling or importing a scenario so its climate, species, and map cannot silently use different regional defaults.

Track completion separately for each launch biome: shared catalog and climate refactors; terrain and vegetation assets; generation and manual editing; resource and water tradeoffs; a playable example with the authored cast; and save/share/play validation. The builder is not release-ready until all three complete these stages.

**Release acceptance:** deliver one playable example scenario per launch biome, accessible from the regular player interface. For each biome, verify generation, manual terrain editing, authored cast selection, scenario objectives, save/reload, export/import, and an independent playtest. Review vegetation proportions and building/resident ground contact against each biome's terrain artwork. A biome counts toward the minimum only when this complete player journey works; a selector entry or recoloured landscape alone does not qualify.

**Why:** choosing a region should change the land the friends settle and the planning tradeoffs they face, while keeping the same approachable player creation tools.

The launch choices are distinct Brazilian biomes in the [IBGE classification](https://www.ibge.gov.br/geociencias/informacoes-ambientais/vegetacao/15842-biomas.html). The following are proposed game profiles, with parameters to be researched and balanced for a representative locality rather than presented as universal properties of an entire biome.

| Biome | Landscape and art direction | Proposed planning emphasis |
| --- | --- | --- |
| **Mata Atlântica** | Adapt the current painted forest vocabulary into native canopy groups, layered undergrowth, shaded edges, and readable open clearings. | Plan cultivation around shade and available clearings; balance rain capture, storage, and solar exposure. |
| **Cerrado** | A distinct palette of open grassland, savanna woodland, characteristic branching trees, and riparian vegetation where water exists. | Prepare for contrasting wet/dry periods, protect water access, and place crops and soil cover deliberately. |
| **Caatinga** | Native dry-forest and shrub forms, branching silhouettes, cacti and other appropriate plants, with varied living ground cover. | Prioritize reliable drinking water, rain storage, efficient irrigation, soil cover, and realistic purchases while local production develops. |

Use Brazilian primary references to choose representative species and climate characteristics before producing assets. The [MMA overview](https://www.gov.br/mma/pt-br/assuntos/biodiversidade-e-biomas/biodiversidade) describes the broad forest/savanna distinctions; [INSA's account of the Semiárido](https://www.gov.br/insa/pt-br/semiarido-brasileiro) documents Caatinga vegetation and variable rainfall. Preserve regional biodiversity and variation instead of treating Caatinga as bare desert, Cerrado as empty pasture, or every Atlantic Forest property as uniformly fertile.

Differentiate the presets through systems the game can actually measure: rainfall timing/probability, dry periods, evaporation, soil retention and fertility ranges, plant shade, cloud effects on solar supply, and supported river-flow variation. Show their consequences in forecasts, growth, water demand, and the land inspector. Keep compressed seasonal lengths and balance coefficients labelled as game rules. Soil and geological deposits remain spatially authored; the biome name alone does not dictate a uniform mineral reserve or fertile ground.

Refactor the current shared 21-day seasonal cycle and fourteen-day introductory weather policy into explicit profiles. A custom Caatinga scenario must not accidentally receive the current introductory afternoon rain on two days out of three. Any beginner weather assistance is an explicit scenario option shown to the author. Natural flora uses biome-appropriate palettes; cultivated crops, timber, and bamboo use supported planting and irrigation rules, with town purchases available when local supply is unsuitable. Do not silently grant resources or require every building, such as hydro, to be viable on every property.

Create dedicated ground, tree, shrub, grass, and detail assets for the new palettes using the established painted style, projection, scale, and ground-contact rules. A tinted copy of the current forest does not count as a completed biome. Species metadata must describe crown/shade and supported sizes independently of numeric index. Keep density restrained and the camp readable in all three environments. Existing buildings and custom residents must fit naturally against every ground palette.

Switching a draft's biome previews the changed defaults, incompatible nature assets, and climate settings before applying one undoable transaction. Preserve authored buildings, cast, supplies, and goals; offer explicit remapping of incompatible flora and keep unresolved choices visible. Never regenerate the land or change a running village's biome as a side effect of choosing a new profile. One primary biome with compatible local habitats is sufficient for the first release; mixed regional biome mosaics are not required.

### Village and starting conditions

Provide the full building catalog and supported house appearances, roads, material plots, pipes, cables, batteries, and related equipment. Use the real game renderer and footprint previews. Do not stretch sprites, add grey platforms, mirror directional artwork, or invent unsupported rotations to fit an editor selection.

Buildings may start completed or as unstarted projects. Arbitrary partly consumed construction stages are deferred; they would require exposing reservations and work accounting. Completed structures receive an explicit inherited-material/salvage policy and equipment baseline. New blueprints reserve materials only when the scenario runs under normal rules.

Configure crops and animals through valid states such as empty bed, planted crop, mature harvest, or stocked enclosure. Validate housing and feed requirements. Configure starting equipment condition and stored power within actual capacities.

Assign food and materials to selected stores and water to compatible tanks. Offer **Distribute automatically** with a preview of the resulting owners and capacity. If stock does not fit, report the shortage rather than creating invisible stores or deleting overflow. Starting food freshness is explicit and all liquids retain their separate classes.

Configure initial funds, date, season, climate seed, and supported climate presets, defaulting to the selected biome's profile. Date and season must agree with that profile's calendar. Explicit climate overrides remain available to scenario authors and are shown in the briefing. Visual day/night/rain inspection is a preview; it does not advance the draft's crops, food ages, needs, or timers. An intentionally dry opening uses a supported climate setting with clear duration; event-driven weather waits for a supported domain API.

Choose original-friend presets, choose which existing friends arrive. Configure starting position, reasonable need levels and outside-job participation through arrival setup. Explain that needs and autonomy still govern their actions. Do not expose internal tasks, destination IDs, or forced behaviour scripts.

Offer **Relaxed**, **Simulation**, and **Custom** rule presets assembled from supported systems: materials and labour, logistics, living land, utilities, climate, maintenance, learning, market behaviour, and building access. Explain each choice's consequences. An unlocked building is distinct from a free building; custom objectives are independent of both.

## Authored residents

Residents are authored game characters. There is no player resident creator, appearance editor, randomization, duplication, or reusable resident-package library. Add new authored residents to the game only when a concrete gameplay or story need calls for them, with complete approved sprites, portraits, personality, skills and routines.

The scenario builder chooses from existing authored friends and configures arrival positions, needs and outside-job participation. It does not edit their identity, appearance, personality, skills or hobbies. Preserve stable resident IDs, independent needs/work/history and role-bound objectives. Choosing a smaller cast must still produce a valid village; original Story keeps its founding roles. Existing saved people retain their identity and history.

## Scenario goals and events

Present a journal editor with an introduction, ordered chapters, required goals, optional goals, and completion text. Let authors preview exactly what players will read. Each goal selects a supported condition and its parameters; no expressions or code are entered.

The initial condition catalog should cover:

- Complete or operate specified buildings, including targets inside a named region.
- Harvest, produce, deliver, purchase, or sell an amount, measured through actual simulation activity.
- Keep accessible food, water, shelter, sanitation, or electricity at a stated level.
- Maintain an outcome for a continuous duration, using resident welfare or service reliability where the engine measures it.
- Reach a fund balance, finish a prior goal, or reach a game date.

The condition model must make timing and credit explicit: whether starting assets count; whether a counter covers the run or only activity after activation; whether a stock target means currently available stock; and whether a duration is continuous or accumulated. Supported combinations use simple **All** or **Any** groups with bounded nesting. Linear chapters and optional objectives are enough for the first release.

Reuse `src/outcomes.rs` and domain counters where possible, first removing their assumptions that measurement runs only in Story. Subscribe to the metrics needed by a scenario independently of its rule preset. Evaluate progress natively and send status, descriptions, and action links to the journal. UI wording must never implement a second completion rule. Give goals stable IDs and store progress by ID.

Events use a guided **When → If → Then** form. Initial triggers are scenario start, chapter/goal completion, game time, or a supported threshold. Initial effects are a message, a building unlock, a recorded fund grant, or an explicit supply delivery. Each delivery has a real destination and defined behaviour when capacity or access is missing. Add more effects only with a domain API that preserves accounting and saves correctly.

Events fire once by default. Repetition, where supported, requires a cooldown, maximum count, and bounded processing per simulation step. Define ordering for simultaneous events; prevent same-step loops. An effect records its identity and result so loading a save cannot repeat a payment or delivery. Use simulation time for deadlines and cooldowns, including 16× speed and pauses.

Success and failure are optional. Completion can leave the village playable. Challenge deadlines may show a failure result and allow restart or an explicitly separate unrestricted continuation; that continuation cannot claim the original challenge was completed. Detect cycles, missing references, and obvious unlock deadlocks. Warn about probable supply or service bottlenecks without claiming to prove that every scenario is solvable.

## Drafts, testing, saves, and sharing

Extract a session controller with explicit menu, play, edit, and playtest states. It owns WASM instances, time controls, autosave destinations, view state, and cleanup. Rename the current preview variable named `sandbox` so it cannot be confused with the actual Sandbox mode.

**Test** freezes the current draft revision, compiles a fresh instance, and enters the normal game with a clear test banner and **Restart test** / **Return to editor** controls. Returning restores the exact draft, selection, camera, and undo history. Restarting recreates the same authored state and random seeds. Test saves use their own recovery slot; they never write to a normal Story, Sandbox, or scenario run.

Keep the first release's test loop one-way. Do not automatically apply the lived-in results of a playtest to the authoring document. Likewise, postpone **Turn my current village into a scenario** until there is an explicit conversion contract for cargo, reservations, work, food ages, depletion, and achievements.

Create a storage repository, using IndexedDB for projects, revisions, thumbnails, and multiple scenario runs. Retain the recovery principles in `VillageStorage`: a failed write cannot destroy the last good record. Autosave completed editing transactions, keep bounded recovery checkpoints, show saving failures, and provide manual export. Recover the latest durable transaction after a crash. Resolve concurrent edits from another tab without silently replacing either copy.

The library offers create, rename, duplicate, edit, play, continue, export, import, and delete for maps and scenarios. Projects, frozen releases and playthroughs have separate IDs. A run retains its frozen content and existing people. Resident packages, resident preset collections and character creation are not supported. Keep unsupported original files and existing saves untouched.

Use self-contained map and scenario packages with schema, compatible game/ruleset and asset-catalog versions, content revision, title, description and author display name. Scenarios embed the resolved map and authored cast references. Thumbnails are derived locally. Import into a new library entry by default; replacing an existing creation is explicit. Keep source authorship when duplicating shared content.

Imported content is data only: supported IDs and plain text, no JavaScript, HTML execution, filesystem paths, or arbitrary remote assets. Bound file size, dimensions, entity counts, text, objective depth, and event work before allocation. Validate in the native compiler as well as the UI. A malformed or newer unsupported package produces an actionable message and leaves current saves unchanged. File sharing needs no accounts or server; an online workshop remains a separate project.

## Validation and feedback

Run cheap checks during edits and full checks before testing or exporting a playable release. Display problems in a small review panel with **Show on map** or **Open goal** actions.

| Severity | Examples | Behaviour |
| --- | --- | --- |
| Error | Unknown building or appearance key, invalid river, overlapping buildings, empty or oversized playable cast, missing spawn/exit, stock beyond capacity, invalid utility port, dangling resident/goal reference, impossible required group size, event dependency cycle | Draft saves remain available; launching/exporting as playable is blocked. |
| Warning | Long travel distances, insufficient overnight beds, no sustainable water, little food before crops mature, rare material shortage, expensive power demand, very dense foliage | Explain the consequence; authors can intentionally keep the challenge. |
| Information | Some starting assets already satisfy a goal, an optional system is disabled, a preset grants free construction | Make the resulting gameplay clear without treating it as a defect. |

Check spawn and exit connectivity, critical building access, camp footprint clearance, valid stores and liquid classes, utility connectivity where required, and objective dependencies. Replace fixed camp-relative fallback destinations with queries for reachable foraging, rest, return, and neighbour-water locations; a valid camp near an edge or river must not send a resident outside the property or into water. Failures must identify cells, objects, or authored goals using player-facing names. Remove engine stack traces, numeric IDs, and raw JSON from ordinary error messages.

## Implementation stages and exit criteria

### Stage 0 Baseline and contracts

Record the current centered 64×64 Story and Sandbox starts, representative established villages, and existing performance. Specify the document formats, supported content, rule semantics, trigger timing, and storage/session lifecycle. Inventory fixed geometry and five-resident assumptions, and define original-friend presets and the supported appearance/trait/occupation catalogs. Research representative localities, flora, and climate references for Mata Atlântica, Cerrado, and Caatinga; approve a small landscape art sample for each. Review the existing authored character sprites. Reconcile related documentation that still describes a 32×32 map.

**Exit:** agreed example map/scenario documents, an explicit compatibility policy, and regression fixtures covering current quantities, starters, camp/camera, and save behaviour. No UI redesign or broad simulation rewrite is needed here.

### Stage 1 Shared definitions and compilation

Implement stable content catalogs, definition parsing, structured validation, and the native compiler for the current default geography. Extract rule presets and restore responsibilities. Represent existing Story and Sandbox starts as definitions; move two representative developer scenes to the same path.

**Exit:** the same definition produces the same initial state, ticks normally, and saves/restores exactly. Initial resources have correct ownership and conservation baselines. Invalid compilation makes no changes to the active session. Default Story/Sandbox behaviour remains covered by regression checks.

### Stage 2 A small player editor with isolated testing

Extract rendering/input and session boundaries from `web/main.js`. Add the Create entry, project storage, recovery autosave, command-based undo/redo, selection, camp/camera markers, and a small building/road palette on the existing map. Wire **Test → Restart test → Return to editor** through the compiler.

**Exit:** a player can place a shed and warehouse, save the project, test it, return, undo a move, close the app, and reopen the draft. Their normal village remains unchanged. This is the first playable milestone, before the complete terrain or quest toolsets.

### Stage 3 Editable geography and world queries

Replace fixed river/habitat/deposit/vegetation assumptions with authored data and authoritative queries. Move outside-service anchors into the world definition. Add terrain, river, habitat, soil, vegetation, and deposit tools, generation presets, and revision-aware cache rebuilding. Implement versioned biome/climate/species profiles and the three launch biome palettes, including no-river properties, optional introduction-weather assistance, and undoable biome switching. Express old starter clearings and soil bonuses explicitly in the default template.

**Exit:** relocating a river changes visible banks, routes, placement, and hydro eligibility consistently. Undo restores those answers. Each of Mata Atlântica, Cerrado, and Caatinga supports generated and hand-edited properties that compile, run, save, and reload with the correct art and environmental profile. A no-river property has valid water access and clear hydro restrictions. Generated and painted landscapes remain visually quiet and readable.

### Stage 4 Authored cast and resident foundations

Keep stable IDs and roster-backed simulation records, data-driven authored personalities, capabilities, occupations and routines. The builder selects existing friends and sets their arrival circumstances. Remove the resident creator, preset library, character duplication and live cosmetic editing. New residents are deliberate authored game additions when needed, not player-generated recipes.

**Exit:** existing friends can be included or excluded from scenarios without retargeting roles, requests, work, wages or relationships. One friend and the founding cast run, save and reload correctly. Arrival placement and needs remain editable; no character-creation or customization interface remains. Story defaults and existing saved identities remain intact.

### Stage 5 Complete settlement and rules authoring

Expand to every building and supported appearance, material plots, crops, animal states, utility routes/equipment, completed structures versus blueprints, located starting stock, authored resident rosters, date/climate, and rule presets. Add full spatial and ownership validation, including population-dependent supply and housing feedback.

**Exit:** an author can create both a sparse arrival and a populated village without developer helpers. Starting stock, water, batteries, and salvage values are intentional and conserved. All building previews agree with actual game placement and artwork.

### Stage 6 Goals and bounded events

Implement the condition evaluator, stable progress records, event ledger, and journal/event editors. Support authored speakers and role bindings, and validate goals requiring particular people or group sizes against the cast. Adapt one existing Story chapter to prove semantic parity while keeping the remaining chapters behind their current adapter. Move additional Story chapters only as their behaviour is covered; the entire campaign conversion is not a blocker for the builder release.

**Exit:** a custom scenario supports a complete sequence of goals, an optional goal, a sustained condition, an unlock, a delivery, and a completion outcome. Saving before and after each trigger neither duplicates nor loses effects. Pausing and fast-forwarding preserve deadline semantics. The official chapter used for comparison still behaves as before.

### Stage 7 Library and portable sharing

Finish the project/scenario browser, multiple named runs, frozen revisions, thumbnails, map/scenario import/export, format upgrades and recovery flows. Add file bounds and hostile-input checks. Distinguish editable drafts, reusable maps, playable releases and saved games.

**Exit:** export a scenario with the authored cast, import it into clean browser storage, play it, save, reload and finish its goals with matching characters and portraits. Editing or deleting the source draft cannot alter the imported run. Failed imports and interrupted writes preserve all existing records. Resident package import is unavailable and does not modify saved data.

### Stage 8 Examples and release quality

Use the actual player editor to author at least three complete examples: **First clearing** in Mata Atlântica for a gentle arrival; **Before the dry season** in Cerrado for water and farming tradeoffs; and **An inherited village** in Caatinga for water storage, access, maintenance, and utilities. Use the existing authored friends. Include a blank/generation preset for each biome. These are authored creations, not hidden snapshot patches.

Run the end-to-end authoring journey with people unfamiliar with the development tools. Check instructions, tool discoverability, button placement, inspector spacing, input cancellation, error recovery, and journal readability. Play each example through its intended completion and several in-game days beyond it.

**Exit:** a regular player can create, test, share, import, and complete a meaningful scenario without documentation about engine internals. Art, performance, and save-integrity gates below pass on the supported desktop setup.

## Verification and release gates

- **Definitions and imports:** deterministic compilation, stable round trips, content/version resolution, unknown keys, missing references, invalid numbers, oversized arrays, and failed-import isolation. Generated tests should exercise combinations of edits and malformed documents.
- **Editing:** exact undo/redo of whole strokes, multi-object moves, linked deletions, duplicates, river edits, and stock allocation. Recovery reloads the latest completed transaction and the previous valid checkpoint if the latest one is corrupt.
- **Resident identity and behaviour:** duplicate appearances/names remain independent; reorder/delete/duplicate operations cannot retarget relationships, wages, requests, quests, or work. Existing saved identity and appearance retain skills, ongoing sleep, needs and income commitments. Test one resident, five, and the supported maximum; group-size goals and gathering portions use the actual participants. Authored trait effects are real and bounded. Save/import preserves character definitions, learned progress, relationships, and once-only job payments.
- **Simulation:** native placement/preview agreement; path and hydro changes after terrain edits; storage/material/water/equipment accounting; food ages; resident access and outside travel; valid save/reload during work. Keep existing Story and Sandbox regression coverage.
- **Biomes:** all three named launch biomes are selectable without dev controls and have distinct approved landscapes and climate data. Test a generated and hand-edited map per biome, deterministic seeds, undoable profile changes, profile-preserving save/import, and explicit climate overrides. Run each through a complete wet/dry cycle across representative seeds; verify forecasts, irrigation demand, shade, and energy behaviour against the chosen parameters. Include a no-river scenario with attainable water goals and no phantom hydro output. Reject missing biome/species versions without replacing existing content. Review buildings, all resident appearances, terrain transitions, and vegetation scale in every biome; a renamed or recoloured copy alone cannot pass.
- **Objectives:** initial versus earned credit, counters since activation, continuous-window reset, simultaneous completions, deadlines at pause/1×/16×, event caps, unavailable delivery capacity, and exactly-once effects across reloads. Automated checks detect structural impossibilities; example playthroughs assess actual difficulty and recovery paths.
- **Sessions and persistence:** editing and testing never overwrite a normal save; repeated tests start identically; switching modes frees inactive instances; old runs pin content; failed/quota-limited writes and concurrent-tab edits do not silently lose work.
- **Art:** use calibrated building sprites and the 2:1 projection in editor and game. Review every building/appearance and nature species against roads, footprints, residents, terrain transitions, and representative neighbours at several zoom levels, in day/night/rain views. For authored residents, verify every supported pose and complete character to catch layer/occlusion problems. Check matching portraits, body proportions, foot contact, facing, carried objects, lighting, and animation transitions beside the original cast. Keep foundations aligned without platforms or distortion. Default vegetation density must preserve the calmer landscape direction.
- **Performance:** measure a typical and a maximum-supported 64×64 map during brush drags, multi-selection, undo/redo, compile, save, camera movement, and 1×/16× play. Include the supported authored cast, animation cache memory and the supported roster. Set population/entity/history limits using the Stage 0 baseline and validate them before release. Proposed targets on the reference desktop are responsive feedback within 100 ms for ordinary edits and approximately 60 fps while panning typical maps; confirm feasibility before making them release promises. Long operations show progress, preserve the previous revision, and allow cancellation before installation. Do not rebuild a full 4096-pixel terrain surface or copy a full save on every pointer event.
- **Player experience:** desktop walkthroughs cover blank creation, a deliberate validation failure, repair, playtest, return, crash recovery, export/import, and scenario completion. Verify keyboard focus, tooltips, non-colour feedback, readable controls, and consistent actions. Mobile layouts and phone checks remain outside scope.

Reuse the current native tests and scripts such as `verify-centered-starts.mjs`, `verify-modes.mjs`, `verify-story-objectives.mjs`, landscape/navigation/utility checks, and art projection checks. Extend them around the new definition/compiler API; a developer fixture merely restoring successfully is not sufficient evidence of a playable authored scenario.

## Work order and scope control

Stages 0 and 1 establish the contract; Stage 2 makes it visible and useful immediately. Stage 3 removes geography constraints and delivers at least three complete Brazilian biome presets before full terrain tools ship. Stage 4 retains resident identity foundations and supports choosing the authored cast. Stage 5 completes settlement setup; Stage 6 adds guided play. Stages 7 and 8 turn the feature into a reliable, shareable player release.

After the schema and compiler contract settle, renderer/editor work, resident foundations and art prototypes, objective evaluation, and persistence work can proceed in parallel behind those interfaces. Complete the roster contract before population-dependent scenario rules. Deliver each slice with tests and a small ready commit; avoid combining the renderer extraction, world rewrite, character migration, and quest rewrite into a single change.

The highest-risk dependencies are arbitrary river geometry, initialization of owned supplies and equipment, stable resident identity across existing systems, consistent authored character animation, persisted objective/event semantics, and isolation of drafts from runs. Prove each with a small end-to-end example before expanding its palette. Player resident creation is removed from this release; retain stable identity and roster correctness for authored characters. Defer unlimited populations, life-stage simulation, new terrain physics, arbitrary imported art, online services, and full campaign migration until the complete local creation loop is reliable.

## Implementation progress

The map/scenario builder remains in progress under the requirements above. Resident creation and customization are removed from scope and implementation. The player builder selects existing authored friends and edits only scenario arrival circumstances and outside-job participation. New residents will be authored game additions when needed.

Historical development notes, including the retired creator and its prototype evidence, are preserved in [the archived implementation history](assets/validation/map-scenario-builder-history-2026-11-03.md). They do not reintroduce removed requirements or establish current release acceptance.

### Why this scope changed

The player explicitly removed the resident creator. Remove its screens, randomization, identity/appearance editing, duplication, resident-package library and public mutation APIs. Keep the original cast playable, stable resident identities and simulation records, arrival configuration, role bindings and existing saved characters. The three biome examples now use the founding friends.

### Remaining release work

Complete the original map/scenario requirements and gates above: current-source art review of authored residents/buildings/nature in terrain and neighbor contexts; unresolved small-plant readability and authored animation transitions; typical/maximum desktop performance and loading/cancellation; process/GPU memory and long-run stability; persistence/crash/concurrency coverage; and unfamiliar-player walkthroughs. Revalidate the changed example casts through completion and continuation. Historical creator-specific combination/part/preset gates are retired; authored character artwork and normal simulation quality remain required.

### Current authored-cast example validation

First clearing completed all four chapters through normal paid Town purchases and four pointer-placed blueprints, then continued three in-game days. The checkpoint reloaded exactly; returning to the editor preserved the draft and removed the scratch run. Both full desktop gameplay/journal captures were individually inspected. Evidence: `assets/validation/authored-first-clearing-v1/`. The Cerrado and Caatinga examples still require current-cast completion and continuation; this single example does not close Stage 8.

Before the dry season also passed with the authored five: cistern/kitchen/garden construction, two real harvests and the two-hour reachable-water reserve completed at minute 5655 (day 4, 22:15), before the minute-10080 deadline. Three later days reached day 8 without losing completion; exact checkpoint reload and unchanged editor return passed. Both full desktop captures were individually inspected. Evidence: `assets/validation/authored-cerrado-v1/`. An inherited village still needs its current-cast completion/continuation check; the broader release gates remain open.

An inherited village passed with the authored five: ordinary tool purchase and resident equipment service, all three chapters completed at minute 1233 (day 1, 20:33), then three later days into day 4. The retained checkpoint records completed battery and pump repairs. Exact checkpoint reload, unchanged editor and scratch-run removal passed. Nighttime gameplay and journal captures were individually inspected. Evidence: `assets/validation/authored-caatinga-v1/`. All three examples now have current-cast required completion plus three-day continuation evidence; unfamiliar-player walkthroughs and the other release gates remain open.

### Close-rain nature inspection

All 21 current close-rain boards were individually inspected: 20 nature entries × 3 supported sizes × 3 biome terrains, 180 compositions at zoom 1.8, using shared game painters and native rain with home/road/Iara references. No additional clipping, detached bases or obvious scale mismatch observed in those controlled scenes. Minimum bunchgrass blends into all three detailed ground palettes; low-grass readability remains **needs correction**. Evidence: `assets/validation/nature-close-rain-review-v1/`, full local boards `artifacts/nature-close-rain-current/`. This closes the missing inspection, not overall nature-art acceptance or moving-rain/mixed-neighbor coverage.

### Rejected low-grass contact-shadow trial

A focused 18-composition close-rain comparison added contact shadows to dry grasses and Cerrado bunchgrass. All three biome boards were individually inspected; base grounding changed slightly but minimum bunchgrass remained difficult to separate. The runtime trial was reverted exactly; it does not close readability. Evidence: `assets/validation/grass-contact-shadow-trial-v1/`. Next correction should address the painted tuft contrast while preserving size and anchor, followed by day/night/rain and gameplay zoom review. The review harness now accepts explicit catalog-key filtering and rejects unknown keys.

### Bunchgrass painted contrast correction

Replaced only the bunchgrass atlas registration with a separate painted tuft using darker olive leaf groups and golden seed heads. Uniform display calibration preserves the original visible width and ground base; the original atlas and other species remain unchanged. All 27 focused boards were individually inspected (81 size/biome/light/zoom combinations), and regional silhouette/ground-baseline checks pass. Evidence: `assets/validation/bunchgrass-contrast-v2/`; prompt/provenance: `assets/art-direction/bunchgrass-contrast-v2/`. Accepted as an incremental improvement: minimum overview tufts remain subtle at night, other dry grasses and broader mixed-ground readability remain open.

### Interrupted project-write recovery

Added an ownership-checked disposable-browser interruption test after the real save worker project put succeeds while its IndexedDB transaction is deliberately held open. SIGKILL/confirmed exit, same-profile relaunch and public-library reopen preserve the whole durable project before opening, and exact checkpoint/view/undo/redo afterward. A stale saved toast found in the before-crash capture is fixed: new saves clear it and explicit confirmation requires current saved status. Current lost-reply, quota preservation, export/retry/reload/Undo checks pass. Evidence: `assets/validation/editor-interrupted-write-v1/`. This covers one interrupted transaction phase; broader write boundaries, corruption and concurrency gates remain open.

### Concurrent editor tabs

Two real editor tabs now have current-source coverage for same-project title conflicts, with BroadcastChannel available and unavailable. Stale Save cannot overwrite the newer durable record. The local recovery checkpoint survives, public Save a copy preserves its definition except deliberate new identity/title/revision fields, and both independent checkpoints reload exactly. Four conflict/copy desktop captures were individually inspected. Evidence: `assets/validation/editor-concurrent-tabs-v1/`. No runtime change was needed. This covers the ordinary project conflict/copy path; simultaneous regeneration, publication and run-write concurrency remain separate gates.

### Publication versus second-tab edits

Public Save map and Save release now have a real two-tab source-edit race check: hold validation-worker loading, save a newer draft in the second tab, then resume native validation. Both publications refuse the stale source without changing the newer draft/package list or consuming a version; reload/retry freezes the newer draft as version 1. Fixed inconsistent recovery feedback: publication LibraryConflict now updates the current editor header and exposes Save a copy. Four conflict/retry captures were individually inspected; ordinary concurrent conflict/copy regression passes. Evidence: `assets/validation/editor-publication-race-v1/`. Other regeneration/run-write concurrency and release gates remain open.

### Running-village conflict recovery

A stale running-village checkpoint already refused newer data but offered no copy control. Added Save independent copy when PlayerSession reports a revision conflict. It serializes against pending writes, keeps the live village, freezes the same authored definition into a new permanent scenario run and updates the session URL/title only after a successful write. A real two-tab public scenario test proves newer-run preservation, exact local recovery/copy, storage-full failure/retry and exact restoration before the first simulation frame. Conflict/copy desktop captures individually inspected; native restart/cancellation/write-failure regression passes. Evidence: `assets/validation/player-run-conflict-v1/`. Frozen-release credit transfer, concurrent restart/autosave combinations and broader release gates remain open.

### Frozen-release run-copy provenance

Extended the public run-conflict test to create a derivative through Edit a copy, giving it a real nonempty author-credit chain, then start its run and delete the source release through library controls. Independent copy preserves the exact embedded definition, snapshot, author, version and earlier credits after the source is gone. Storage-full failure/retry and exact pre-first-frame reload pass; direct draft-started regression also passes. Both desktop captures individually inspected. Evidence: `assets/validation/player-frozen-run-conflict-v1/`. This closes the previously unexercised frozen-credit transfer case; active autosave/restart combinations and broader gates remain open.

### Queued checkpoint ownership after copying

A controlled native session ordering test reproduced pending recovery bytes left under the original ID after Save independent copy. Fixed transfer to the new ID/revision and refreshed queued-write recovery only when its target identity changed, preserving an already newer recovery copy. Four preceding-save/conflict × later-success/failure cases pass, including exact original isolation, new-ID recovery, retry and frozen credit preservation. Existing restart preparation/cancellation/write-failure checks and the real frozen-release conflict/copy browser regression pass. Evidence: `assets/validation/session-copy-order-v1/`. Recovery-storage quota boundaries and broader simultaneous restart/crash timing remain open.

### Multiple queued post-copy checkpoints

Expanded native ordering coverage to two queued post-copy checkpoints, including a held earlier write and temporary recovery-storage quota failure. Fixed copy completion resetting the newer request marker (which caused an unnecessary duplicate save), and reused recovery migration when changed-identity queued writes begin so a failed transfer can retry. Six controlled cases, native restart regressions and the real frozen-release browser conflict/copy regression pass. Evidence: `assets/validation/session-multiple-copy-queue-v1/`. Sustained unavailable recovery storage, all crash microtask boundaries and simultaneous restart combinations remain outside this result.

### Authored-cast process memory observations

Updated mixed-play benchmarking to accept absent modular-art cache counters and optionally sample only process IDs reported by its owned Chromium CDP session. Established Caatinga checkpoint (five authored friends, twelve buildings) completed four reset 60-second still/pan preferred-1×/diagnostic-16× phases, four exact native checkpoint restores and clean shutdown. All four captures individually inspected. P95 sampled frame gaps 9.4–16.7 ms; no additional dropped simulation time in measured phases. Fifty host-RSS samples show renderer peak about 1889 MiB, ending 1770 MiB with variation in the last six samples. **SwiftShader**, not the hardware desktop baseline; host RSS does not measure GPU allocation and this short reset-phase run does not prove a plateau. Evidence: `assets/validation/authored-caatinga-process-memory-v1/`. Hardware-rendered and sustained-memory release gates remain open.

### Metal pacing and shutdown investigation

Headed Chromium confirms Apple M3 Pro Metal. Four 60-second phases had median 33.3 ms/p95 34.2 ms frame gaps and exact checkpoints, but shutdown timed out; the run remains failed/incomplete. A short repeat closed successfully; a second short repeat measured 8.3 ms/9.3 ms but also timed out on shutdown. An empty visible/focused page measured median 8.8 ms/p95 34.1 ms, supporting browser/environment cadence variability without proving the cause. Explicit sampling-session detach did not reliably fix shutdown. Benchmark PASS is now emitted only after successful cleanup. Evidence: `assets/validation/authored-metal-pacing-investigation-v1/`. Hardware pacing, bounded shutdown reliability and sustained memory acceptance remain open; failed-cleanup observations do not satisfy them.

### Bounded, staged benchmark shutdown

Cleanup now records server/context/browser start, completion/failure and elapsed time; server shutdown is bounded too. A simulated stalled server still attempts later context/browser cleanup and surfaces failure. The real staged headed Metal repeat closed in about .24/8/94 ms, with Chromium exit code 0. Lifecycle-logged repeats did not reproduce the earlier timeout, so its root cause and reliability gate remain open. Evidence: `assets/validation/validation-cleanup-stages-v1/`. These short diagnostics do not close performance or visual acceptance.

### Editor keyboard focus and cancellation

A real keyboard check found Shift+Tab leaving the first map-save field for body. Added modal-boundary Tab wrapping over visible enabled controls. Public map/release/library keyboard open, repeated Tab/Shift+Tab, Escape focus return, title text-undo isolation, exact pending habitat-stroke cancellation, and journal opener focus all pass. Real busy publication dialogs also retain focus with disabled fields, and their race/retry regression passes. Journal focus capture individually inspected. Evidence: `assets/validation/editor-keyboard-focus-v1/`. This is specific desktop keyboard coverage, not all dialogs/assistive technology or unfamiliar-player acceptance.

### Draw-to-name region flow

Newly drawn named regions now open their inspector and focus/select the name field immediately. Open region details remain expanded during rerenders/saving. Trusted pointer draw, real naming, exact inclusive coordinates, two-step undo/redo, Escape cancellation with unchanged current history and exact reload pass. Updated full desktop inspector capture individually inspected. Evidence: `assets/validation/editor-region-flow-v1/`. Goal dependency deletion, additional boundary cases and unfamiliar-player checks remain separate.

### Referenced region removal and repair

Extended public removal checks to a region referenced by a goal. The inspector names its affected chapter/goal before deletion; removal preserves the journal exactly, blocks testing and exposes an Open journal repair action. The journal retains the missing target ID without retargeting. Undo/reload restore the exact definition and valid test state. Existing building/group/utility/stock/liquid dependency regression also passes. Both region consequence/error captures individually inspected. Evidence: `assets/validation/editor-region-removal-v1/`. Nested event/goal combinations and broader release gates remain separate.

### Incomplete draft sharing and repair

Public export preserves an unfinished scenario exactly after removing a goal's referenced region. Import into isolated storage creates an independent project, preserves the missing target and keeps Test village / Save release disabled. Expanding the goal in the journal and choosing Anywhere on the map repairs readiness; saving/reloading preserves the exact repaired definition and leaves the source unchanged. Browser check passed with no page errors and completed cleanup. Evidence: `assets/validation/editor-incomplete-draft-v1/`. The current issue opens the chapter with the goal collapsed; more precise navigation, other invalid draft classes and broader acceptance remain open.

### Direct navigation to missing regional goal targets

Missing-region validation now provides the exact goal/condition field path, including each nested all/any reference. Open journal reveals the goal and focuses its missing region selector without a manual expansion step. The public incomplete-draft sharing/repair/reload check passes against the rebuilt game, and the focused desktop capture was individually inspected. Evidence: `assets/validation/editor-region-navigation-v1/`. Native nested-path coverage complements the single direct-goal browser fixture; other validation categories and broader acceptance remain open.

### Crop-state daylight art coverage

The shared building-context review now supports `--crop-states`: both garden and greenhouse, all six crops at young/maturing/ready/dry-stressed states and an empty bed, against all three biome terrains with adjoining road/home/Iara. All 18 daylight normal-zoom boards (150 compositions) were individually inspected. No additional clipping, detached bases or obvious proportion mismatch observed; greenhouse framing/aisle remain coherent. Young seedlings are subtle. Evidence: `assets/validation/crop-state-day-v1/`, full local boards `artifacts/crop-state-day-current/`. These controlled painted states do not establish live growth, night/rain, other zooms, repeated tomato harvests or overall art acceptance. Browser cleanup is now bounded through the shared validation helper.

### Current authored-cast editor interaction baseline

Replaced the public editor benchmark's retired custom appearances with the original authored friends, preserving their definitions. Default dense case now uses 256 mixed inland buildings instead of mostly streetlights. One/five-friend camps and the full-building five-friend fixture pass native import, trusted 9×9 brush (135 eligible cells), exact atomic undo/redo and two-building move/undo, with no compile during dragging and one compile on committed move. Dense run brush/group-motion handler p95 was 7.1/6.2 ms; release handlers 87.7/88.7 ms, two-frame observations 97.6/95.3 ms. Import-to-ready was 1317 ms; save acknowledgement includes debounce separately. No page errors, cleanup passed, full desktop capture individually inspected. Evidence: `assets/validation/authored-editor-gestures-v1/`. Headless SwiftShader and small sample counts do not close hardware pacing, large-group throughput, complete entity/history stress, GPU memory or legacy maximum-roster gates.

### Connected group copy and move

Fixed a missing part of group authoring: copies now carry internal utility routes, including cables to copied pumps, and inherited workshop/building-battery/pump condition, with separate remapped identities and translated paths. Moves translate the internal paths with the buildings. External connections, standalone banks and shared pickup remain separate. The inspector explains copy scope. Native checks cover partial groups, reversed route ordering, typed route/building ID collisions, placement and exact undo/redo. Trusted public nine-building marquee/copy/move, one history step, unchanged originals, readiness and exact undo/redo/reload pass with no page errors and successful cleanup. Both desktop captures individually inspected. Evidence: `assets/validation/editor-connected-group-v1/`. This closes the observed internal-route omission, not maximum-group performance or automatic external reconnection; journal regions/targets are deliberately unchanged.

### Native connected-group placement previews

Copied groups and dragged buildings/groups now get an asynchronous native site check and a written allowed/blocked reason. Valid ghosts include their native internal utility paths; invalid footprints turn red. The worker receives one source context, coalesces pointer deltas with one check in flight, ignores stale cells/documents, and terminates on cancellation or timeout. Commit remains independently checked. Public nine-building checks cover five route ghosts, blocked placement with exact unchanged history, Escape/reselection and copy/move undo/redo/reload; controlled worker lifecycle/timeout and existing release-handler contracts also pass. Both full desktop previews individually inspected. Final dense headless gesture repeat: motion/release handler p95 6.8/90.8 ms, two-frame observations 12.9/97.9 ms, successful cleanup. Evidence: `assets/validation/editor-group-preview-v1/`. Other placement tools, maximum connected groups, real-browser worker failures and broader performance/acceptance gates remain open.

### Native palette placement feedback and worker fallback

All 22 native building palette entries now use the asynchronous native placement checker, with shared starting-building defaults for preview/commit, written readiness/rejection and invalid footprint colour. Simple checks avoid full snapshot serialization when no corridor plans are needed. Public controls verify one eligible and one occupied site per kind, successful placement, rejected-click isolation, exact undo/redo, Escape and reload; hydro uses an eligible riverbank. A real aborted preview-worker load shows unavailable feedback while independent native placement and Undo still work. Connected-group regression also passes, with no page errors and successful cleanup. Three full desktop UI captures individually inspected. Evidence: `assets/validation/editor-palette-preview-v1/`. Default recipes/appearances and these sample sites do not close all surfaces/variants, other placement tools, performance or unfamiliar-player gates.

### Native battery and material-plot previews

Added shared native site checks for new/copied/moved battery banks and material plots, with written readiness/rejection and footprint feedback. Preview and commit share an asset edit. Fixed battery duplication losing inherited equipment wear: capacity, charge and condition/defer policy now follow the new identity. All six new-asset tools pass eligible/occupied-site checks and exact undo/redo; configured battery and mature timber copy/move/reload retain their settings. Existing battery and site authoring/playtest regressions also pass, including drag movement, mapped extraction, conserved opening assets and exact checkpoints. Allowed stone, copied-bank and blocked-stone UI captures individually inspected. Evidence: `assets/validation/editor-asset-preview-v1/`. These sample sites/configurations do not close all geology/surfaces, nature/road tools, maximum-entity performance or unfamiliar-player acceptance.

### Maximum-building group interaction and selection cost

Added a trusted public 256-building check: four minimap/Shift-marquee views select every building, over-limit copying is rejected without changing definition/history, and one whole-group move creates one step with exact Undo/Redo/reload. It exposed repeated membership reconstruction in map/minimap rendering. Frame-local sets now reduce selection lookups from up to 769 to 3 per move event. Consecutive headless runs measured marquee-motion p95 44.1→6.4 ms, whole-group motion 64.4→7.0 ms and a single release 177.1→93.4 ms. Both checks passed with no page errors and completed cleanup; the full desktop capture was individually inspected. Evidence: `assets/validation/editor-maximum-group-v1/`. This no-river mixed-building fixture does not close combined nature/routes/history maxima, sustained hardware pacing, GPU memory or unfamiliar-player gates.

### Powered-night crop-state review

Individually inspected all 18 normal-zoom powered-night boards (150 crop/building/biome compositions) with the shared game painters and depth-masked powered-home reference. No additional grounding/frame alignment or obvious proportion mismatch observed. Mature silhouettes remain distinguishable, but young plants and dry-stress cues are subdued, especially behind greenhouse glass: night crop readability remains open. Native classification is garden none / greenhouse grid; presentation levels are controlled, not proof of live circuits. Evidence: `assets/validation/crop-state-powered-night-v1/`, full boards `artifacts/crop-state-powered-night-final/`. The capture harness now fingerprints fetched JSON (including the native lighting fixture), records cleanup outcome and cannot retain success after cleanup failure. Unpowered night, rain, other zooms and live transitions remain separate gates; no runtime art/lighting changed here.

### Greenhouse crop illumination correction

The live crop caller now passes actual building illumination through the shared painter; powered greenhouse leaves no longer receive the full unpowered night filter. Decoded-pixel checks cover all six crops across young/maturing/ready/dry states: 144 daylight, 48 unpowered and 72 outdoor comparisons remain exact; 24 greenhouse states brighten monotonically through off/dim/full light with identical silhouettes, and empty soil remains unchanged. All 25 Mata Atlântica normal-zoom powered-night greenhouse compositions were individually inspected: coherent placement/frame alignment, with young plants still subtle behind glass. Evidence: `assets/validation/greenhouse-crop-lighting-v1/`. The other two captured biomes still await visual inspection. Live native power switching, outdoor/unpowered readability, rain and other zooms remain open; this is not full art acceptance.

### Live greenhouse light switching

A public scenario import/Test village check now exercises the actual game Power checkbox at 21:00: enabled/off/enabled delivers illumination 1/0/1 through the main caller into the shared crop painter. The observer records painter arguments without replacing its rendering body; no game-state mutation is used. No page errors and successful browser/server cleanup. Full desktop powered capture individually inspected. Evidence: `assets/validation/greenhouse-crop-lighting-v1/live-power-check.json` and `live-powered.png`. This uses comfortable Sandbox supply, not wired-grid connection or battery depletion; those and the remaining art gates stay open.

### Corrected powered greenhouse review across all biomes

Individually inspected the remaining six Cerrado/Caatinga boards, completing all nine boards and 75 normal-zoom controlled powered-night greenhouse compositions after the illumination correction. No additional grounding, frame-alignment or proportion mismatch observed across empty/young/maturing/ready/dry states for six crops. Young and dry-stress cues remain subdued behind glass; nighttime readability is still open. Board hashes and representative images are retained in `assets/validation/greenhouse-crop-lighting-v1/`. This closes only this composition-review slice, not rain/other zooms, outdoor/unpowered readability, wired-power behaviour or full art acceptance.

### Natural-object move and copy placement feedback

Natural-object move/copy tools and drag movement now use the asynchronous native placement worker, sharing the commit spacing/camp/building/road checks. Invalid ghosts turn red and a written reason explains the rejected site; valid sites show readiness. Public Caatinga macambira checks verify allowed/blocked move and copy previews, rejection isolation, Escape clearing, identity retention, exact undo/redo, trusted drag, saved selection/reload, native playtest and editor return. Existing sparse-cluster and numeric-edit regressions pass; worker coalescing/cancellation/fallback checks pass. Both full desktop placement captures individually inspected; bounded cleanup completed. Evidence: `assets/validation/editor-nature-preview-v1/`. Other species/surfaces/densities, brush/road previews and broader maximum-entity/performance/player gates remain open.

### All-species nature preview agreement and cleanup-safe evidence

A real browser worker now checks every one of the 20 natural-object catalog entries at native minimum/maximum sizes, in all three biome profiles, for move/copy on clear/camp sites: all 480 cases agree with independent shared placement plus native validation and preserve the source definition. The 200 numeric-size boundary checks also pass. Public natural-object editing and live greenhouse switching regressions pass again. Their scripts reset reports to incomplete at startup and write success only after bounded server/context/browser shutdown; cleanup stages are retained. Evidence: `assets/validation/editor-nature-preview-v1/species-check.json`, `cleanup-checked-report.json` and `assets/validation/greenhouse-crop-lighting-v1/cleanup-checked-live-power.json`. Worker agreement is not all-species visual acceptance or every seed/surface/brush interaction; remaining gates stay open.

### Whole-road-stroke native feedback

The road brush now checks the entire pending stroke in the coalesced native worker and shares its road-union edit with commit. Written readiness/rejection and blocked footprint highlighting reflect the whole stroke. Stroke contents participate in the request identity, so returning to an endpoint with extra painted cells cannot reuse an older readiness result. Public gestures pass exact four-cell single-step undo/redo, mixed clear/occupied rejection without definition/history change, Escape cancellation and reload, with no page errors and completed bounded cleanup. Both desktop captures individually inspected. Thirteen release-handler cases, stale-stroke/queue/timeout checks and all 480 nature worker regression cases also pass. Evidence: `assets/validation/editor-road-preview-v1/`. Other river geometries/edges, maximum strokes, brush tools and broad performance/art/player acceptance remain open.

### Road boundary explanations and native regression

Road validation now explains the actual rejection: outer map edge, riverbank, building occupancy or duplicate imported road cell, keeping the existing error code/path/cell. A native test verifies all four reasons and exact running-village isolation. All 792 native tests, strict Clippy and release WASM build pass. Rebuilt public browser checks cover map-edge/interior and riverbank/inland pairs, rejected-click definition/history isolation, exact neighboring placement undo/redo, plus existing whole-stroke cancellation/reload checks and bounded cleanup. Both new full desktop captures individually inspected. Evidence: `assets/validation/editor-road-boundaries-v1/`. Remaining river geometries/maximum strokes and broad art/performance/player gates are not closed.

### Every building appearance in unpowered night contexts

Captured and individually inspected all nine boards / 81 normal-zoom unpowered-night compositions (27 appearances across three biomes) through shared game painters, with home/Iara/road references and native eligible hydro banks. No additional visible silhouette/grounding or obvious proportion mismatch observed; lamps/windows appear dark. Small props and interior details remain subdued, so night readability stays open. Browser capture and bounded cleanup pass. Evidence: `assets/validation/building-unpowered-night-v1/`, with every board hash and three representative boards retained; full captures in `artifacts/building-unpowered-night-current/`. This controlled power presentation is not live circuit-loss proof, measured geometric perfection, new user art approval or completion of rain/other zoom/construction/animal/crop/resident-motion gates.
