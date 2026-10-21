---
description: Build player-facing map, scenario, and resident creators on shared world and character foundations.
---

# Map and scenario builder implementation plan

Status: implementation in progress. Delivery target: the desktop game, with 64×64 maps, at least three Brazilian biomes, and player-created residents. The original five friends remain a ready-made cast.

## Why

Players should be able to design a Brazilian countryside property, create the people who will live there, decide what they arrive with, and create a playable ecovila story or challenge. A map might offer fertile clearings but distant water; a scenario might ask the community to become self-sufficient before the dry season. These should be possible through ordinary game controls, without developer tools, JSON editing, or programming.

The first release should deliver the complete loop: create, edit, save, test, revise, export, import, and play. Its foundation must keep authored content separate from a living village so editing a river, testing a quest, or sharing a scenario cannot corrupt another game.

## Product scope and player journey

Add **Create** and **Scenarios** to the main menu. Keep Story and Sandbox as the familiar ways to play. Create offers map/scenario projects and a **Residents** creator with reusable character presets; Scenarios opens installed scenarios and their saved playthroughs. Resident creation is also available directly while choosing a scenario's cast or starting a new Sandbox. No development URL or debug flag is required.

Distinguish three creations in plain language:

- **Map:** the property itself, including land, river, vegetation, deposits, and arrival locations. Players can reuse a map in different scenarios or start an ordinary Sandbox on it.
- **Scenario:** a map plus starting buildings, supplies, the friends' initial circumstances, simulation rules, and optional objectives and events. It can be an open-ended village, a guided story, or a challenge.
- **Resident:** a reusable character with a name, appearance, personality, interests, abilities, and an optional outside occupation. Adding a preset to a village creates an independent person with their own progress and relationships.

The creation flow is **Choose a starting point → Shape the land → Create the residents → Set up the village → Add a story if wanted → Test → Save and share**. These are workspace tabs, not mandatory forms; players can return to any step. A map-only creation uses a validated default arrival preset when launched in Sandbox, with the original friends or a custom cast. That preset previews its camp, shed, and storage placement rather than overwriting authored terrain unexpectedly.

Start with an open property, a generated property, or a small set of prepared templates, then choose its Brazilian biome. The first release must support **Mata Atlântica, Cerrado, and Caatinga**, each through the ordinary creation interface. Generating a new landscape previews the result before replacing the current land. Regeneration, object deletion, and moving the camp are undoable.

### First release boundaries

| Include | Defer to a separate expansion |
| --- | --- |
| 64×64 properties, with dimensions represented explicitly in the format | Larger or rectangular maps and resizing existing maps |
| At least three complete biome presets: Mata Atlântica, Cerrado, and Caatinga, with distinct artwork and environmental behaviour | Additional biome packs and detailed simulation of transitions between regional biomes |
| Current flat 2:1 isometric projection and approved artwork | Elevation, cliffs, excavation, bridges, free camera rotation |
| Editable rivers, habitats, soil, vegetation, and resource deposits | Flood simulation and unrestricted hydrological modelling |
| All existing buildings and supported appearances, roads, resource plots, and utilities | Arbitrary imported artwork, new building types, and unsupported building rotations |
| Create and customize residents; original-friend presets; configurable founding rosters within a tested population limit | Unlimited populations, children/aging simulation, arbitrary occupation scripts, and scripted immigration |
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
| `src/occupations.rs`, `src/sleep.rs`, `web/main.js`, `web/resident-animation.js`, `web/sprite-frames.js` | Jobs, bedtimes, portraits, colours, and sprite selection assume the original cast. | Use occupation and appearance catalogs, resident-owned routines, and a shared portrait/animation composition system. |
| `web/main.js`, `web/village-storage.js` | Startup, rendering, input, previews, and saves share one controller; storage has one slot per mode. | Extract session ownership, rendering/input boundaries, and a multi-project storage repository. |

The recent camp and camera centering work remains useful: `Village.camp` is a real anchor, and founding buildings already use relative offsets. Complete that refactor by removing the remaining invisible geography tied to the previous map layout. Center a new map's camp and camera by default, while allowing an author to place both independently.

Avoid a general engine rewrite. Extract responsibilities needed by the first playable editor, preserving existing APIs behind adapters until their callers migrate. Do not gate the first useful map builder on converting all thirteen Story chapters, all developer fixtures, or all UI panels.

Suggested module boundaries are `src/world/` for geometry and authored land, `src/scenarios/` for definitions/compilation/validation/runtime progress, `src/residents/` for character definitions and roster services, `web/editor/` for tools and transactions, and separate web modules for session ownership, the shared world renderer, character composition, and content storage. Introduce each boundary when its first feature needs it; existing simulation systems keep their domain responsibilities.

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

Separate a resident preset ID, an authored cast-member ID, and a live resident ID. Preserve references when names or roster order change; duplicate names are allowed. A scenario embeds the exact resident definitions it uses, so modifying a library preset cannot alter an existing draft or run. Initial friendships belong to the scenario and reference cast-member IDs, not global presets. Appearance changes never change identity or transfer another person's abilities.

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

Choose original-friend presets, create new residents, or mix both in the starting cast. Configure starting position, reasonable need levels, learned skills, work preferences, and outside-job participation through the resident creator below. Explain that needs and autonomy still govern their actions. Do not expose internal tasks, destination IDs, or forced behaviour scripts.

Offer **Relaxed**, **Simulation**, and **Custom** rule presets assembled from supported systems: materials and labour, logistics, living land, utilities, climate, maintenance, learning, market behaviour, and building access. Explain each choice's consequences. An unlocked building is distinct from a free building; custom objectives are independent of both.

## Resident creator

### Creating a person

Provide a character screen with a large animated preview, a matching portrait, and compact **Identity**, **Appearance**, **Personality**, and **Experience** tabs. Players can create from scratch, start from a preset, duplicate a resident, or randomize selected categories while locking the others. Include undo/redo, reset category, and an in-world scale preview beside a doorway and another resident.

| Area | Player controls and behaviour |
| --- | --- |
| Identity | Name, optional pronouns, and a short biography. Names support accents. Text is stored as plain text; biographies do not execute behaviour. |
| Appearance | Skin tone, supported face/body variants, hairstyle and colour, facial hair, tops, bottoms, shoes, hats, and compatible accessories. Offer approved palettes and valid combinations with immediate preview. |
| Personality | A small set of compatible traits with visible effects and tradeoffs, plus favourite hobbies and social preferences. Cosmetic choices never determine abilities or temperament. |
| Experience | Starting skill levels and a practical background selected from supported catalogs. Show how skills affect real work; basic survival chores remain available to everyone. |
| Routine and work | Preferred bedtime within supported bounds, community-work preferences, and an optional occupation chosen independently of appearance. Occupations initially use the supported working hours, income, and behaviour rather than arbitrary scripts or editable salaries. |
| Starting relationships | Optional friendships between cast members, edited from the roster view. Validate references and the relationship model's symmetry/range rules. |

Keep personality, starting skills, and occupations distinct. A background can suggest defaults, but changing clothes or a portrait cannot change someone's cooking yield. Traits must connect to measurable choice, preference, or recovery behaviour; free-form labels are descriptive only. Retain the established six-to-nine-hour energy-based sleep rule and needs-based refusals.

Offer a balanced creation preset that budgets starting skills and limits trait stacking. Scenario authors may explicitly choose unrestricted setup; label that choice in the scenario description. Provide forgiving defaults and optional detail rather than requiring players to fill every field.

The default founding group remains five, but custom rosters are data-driven. Support at least one resident and a published, tested maximum established through 64×64 and 16× benchmarks. Empty casts can be saved as drafts but cannot start a playable village. Resource, bed, gathering, and service checks use the selected population. Do not add unlimited population support simply by replacing a constant.

Keep the official Story's original cast as its default. Custom scenarios can bind dialogue speakers and required roles to authored residents or supported capabilities instead of assuming Iara, Bento, or another fixed slot exists. A missing required role produces an actionable error. Let a regular player rename a resident or edit appearance from People during a run; apply that cosmetic change only to the selected live person, preserving needs, skills, cargo, work, relationships, and identity. Starting-stat and cast edits remain creation-time actions.

### Character architecture and artwork

Replace all resident-indexed arrays and bitmasks with collections keyed by stable IDs, retaining fixed arrays only for actual fixed catalogs such as skill types. Cover skills, claims, work records, relationships, gatherings, building contributions, income commitments, sleep, hobbies, housing, situations, and UI selection. Numeric IDs and list order must not imply a special ability, portrait, occupation, or preferred bedtime. Original-friend definitions preserve their current personalities and specialties as explicit data.

Derive per-person destinations and group sizes from the roster and available space. Small rosters must not wait for absent friends; larger supported rosters must keep personal space, share shelter, eat, sleep, work, commute, and trigger automatic 16× speed correctly. Migrate the current five-person save format by preserving identities and their associated history, including jobs and work in progress.

Custom appearance requires new production artwork. Establish a shared pose/template specification with consistent proportions, contact anchors, lighting, outlines, and palette before producing customization parts. Build compatible painted body, face, hair, clothing, and accessory layers, with per-pose occlusion and masks for controlled colour changes. Body variants need complete authored poses; never create them by stretching the existing sheets or tinting the entire sprite.

Use one versioned appearance recipe for both portraits and every in-world animation: walking, working, cooking, watering, tending, feeding, sitting, sleeping, and idle gestures. Preview supported facings and day/night lighting. Equipment such as a watering can belongs to the activity, while an authored hat belongs to the character. Validate compatibility so unsupported combinations are unavailable with a clear explanation instead of clipping or falling back to another character.

Prototype several visibly different residents through the complete animation set early. Review them beside the original cast, buildings, and ground texture before expanding the palette. Character creation is not complete with a customizable portrait and an unchanged original sprite. Precompose/cache frames by appearance recipe, asset version, and pose; bound cache memory and regenerate only affected recipes. Packaged characters reference bundled approved parts; arbitrary image uploads and runtime image generation remain outside this release.

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

The library offers create, rename, duplicate, edit, play, continue, export, import, and delete. Include a resident preset collection with portrait thumbnails, search, duplicate, import/export, and **Add to cast**. Duplicate residents receive new identities; adding one preset twice produces two independent people. Projects, frozen releases, and playthroughs have separate IDs. Deleting a draft or resident preset cannot silently remove or change a run; a run retains the content needed to continue. Keep Story and Sandbox saves recoverable during storage migration. Broader historical save support is not a prerequisite, but unsupported files remain untouched and exportable.

Use self-contained map, scenario, and resident packages with schema, compatible game/ruleset and asset-catalog versions, content revision, title, description, and author display name. Scenarios embed the resolved map and their cast definitions; resident packages contain the appearance recipe and starting character definition without another village's runtime history. Thumbnails are derived locally. Import into a new library entry by default; replacing an existing creation is explicit. Keep source authorship when duplicating shared content. Reject unsupported appearance parts with a clear compatibility message rather than silently changing the character.

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

Record the current centered 64×64 Story and Sandbox starts, representative established villages, and existing performance. Specify the document formats, supported content, rule semantics, trigger timing, and storage/session lifecycle. Inventory fixed geometry and five-resident assumptions, and define original-friend presets and the supported appearance/trait/occupation catalogs. Research representative localities, flora, and climate references for Mata Atlântica, Cerrado, and Caatinga; approve a small landscape art sample for each. Prototype the character artwork composition approach before promising its full palette. Reconcile related documentation that still describes a 32×32 map.

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

### Stage 4 Resident foundations and character creator

First introduce resident definitions, stable IDs, data-driven personalities/capabilities/routines, reusable occupation catalogs, and roster-backed collections. Replace five-person arrays, masks, hardcoded names, and population thresholds, and migrate current saves without transferring history between people. Validate one-person and larger rosters, including food portions, shelter positions, social needs, gathering helpers, and role-bound goals.

Then finish the approved body/hair/clothing/accessory art sets and portrait/world composition pipeline. Build the creator, preset library integration, cast editing, randomization with locks, balanced/unrestricted setup, and live cosmetic editing from People. Keep the original cast as presets and Story defaults. The editor can continue using those presets while the creator is being built, but custom characters are required for the complete release.

**Exit:** players can create visibly distinct people with different supported personalities, skills, hobbies, and occupations, assemble a custom roster, and test it. Reordering the cast or changing appearance transfers no abilities or history. Portraits and all animation clips agree. One resident, the default five, and the measured maximum all run, save, reload, and respect personal space. The first prototype across all poses passes art review before the asset catalog expands.

### Stage 5 Complete settlement and rules authoring

Expand to every building and supported appearance, material plots, crops, animal states, utility routes/equipment, completed structures versus blueprints, located starting stock, authored resident rosters, date/climate, and rule presets. Add full spatial and ownership validation, including population-dependent supply and housing feedback.

**Exit:** an author can create both a sparse arrival and a populated village without developer helpers. Starting stock, water, batteries, and salvage values are intentional and conserved. All building previews agree with actual game placement and artwork.

### Stage 6 Goals and bounded events

Implement the condition evaluator, stable progress records, event ledger, and journal/event editors. Support authored speakers and role bindings, and validate goals requiring particular people or group sizes against the cast. Adapt one existing Story chapter to prove semantic parity while keeping the remaining chapters behind their current adapter. Move additional Story chapters only as their behaviour is covered; the entire campaign conversion is not a blocker for the builder release.

**Exit:** a custom scenario supports a complete sequence of goals, an optional goal, a sustained condition, an unlock, a delivery, and a completion outcome. Saving before and after each trigger neither duplicates nor loses effects. Pausing and fast-forwarding preserve deadline semantics. The official chapter used for comparison still behaves as before.

### Stage 7 Library and portable sharing

Finish the project/scenario browser and resident preset library, multiple named runs, frozen revisions, thumbnails, import/export, format upgrades, and recovery flows. Add file bounds and hostile-input checks. Provide clear distinction between editable drafts, reusable residents, playable releases, and saved games.

**Exit:** export a scenario with a custom cast, import it into clean browser storage, play it, save, reload, and finish its goals with matching characters and portraits. Independently export/import a resident preset and add it to another cast without carrying over runtime history. Editing or deleting the source draft/preset cannot alter the imported run. Failed imports and interrupted writes preserve all existing records.

### Stage 8 Examples and release quality

Use the actual player editor to author at least three complete examples: **First clearing** in Mata Atlântica for a gentle arrival; **Before the dry season** in Cerrado for water and farming tradeoffs; and **An inherited village** in Caatinga for water storage, access, maintenance, and utilities. At least one uses an entirely custom cast and another mixes original-friend presets with new residents. Include a blank/generation preset for each biome and a small set of reusable custom resident presets. These are authored creations, not hidden snapshot patches.

Run the end-to-end authoring journey with people unfamiliar with the development tools. Check instructions, tool discoverability, button placement, inspector spacing, input cancellation, error recovery, and journal readability. Play each example through its intended completion and several in-game days beyond it.

**Exit:** a regular player can create, test, share, import, and complete a meaningful scenario without documentation about engine internals. Art, performance, and save-integrity gates below pass on the supported desktop setup.

## Verification and release gates

- **Definitions and imports:** deterministic compilation, stable round trips, content/version resolution, unknown keys, missing references, invalid numbers, oversized arrays, and failed-import isolation. Generated tests should exercise combinations of edits and malformed documents.
- **Editing:** exact undo/redo of whole strokes, multi-object moves, linked deletions, duplicates, river edits, and stock allocation. Recovery reloads the latest completed transaction and the previous valid checkpoint if the latest one is corrupt.
- **Resident identity and behaviour:** duplicate appearances/names remain independent; reorder/delete/duplicate operations cannot retarget relationships, wages, requests, quests, or work. A rename or appearance change leaves skills, ongoing sleep, needs, and income commitments unchanged. Test one resident, five, and the supported maximum; group-size goals and gathering portions use the actual participants. Trait effects are real, bounded, and independent of cosmetic choices. Save/import preserves character definitions, learned progress, relationships, and once-only job payments.
- **Simulation:** native placement/preview agreement; path and hydro changes after terrain edits; storage/material/water/equipment accounting; food ages; resident access and outside travel; valid save/reload during work. Keep existing Story and Sandbox regression coverage.
- **Biomes:** all three named launch biomes are selectable without dev controls and have distinct approved landscapes and climate data. Test a generated and hand-edited map per biome, deterministic seeds, undoable profile changes, profile-preserving save/import, and explicit climate overrides. Run each through a complete wet/dry cycle across representative seeds; verify forecasts, irrigation demand, shade, and energy behaviour against the chosen parameters. Include a no-river scenario with attainable water goals and no phantom hydro output. Reject missing biome/species versions without replacing existing content. Review buildings, all resident appearances, terrain transitions, and vegetation scale in every biome; a renamed or recoloured copy alone cannot pass.
- **Objectives:** initial versus earned credit, counters since activation, continuous-window reset, simultaneous completions, deadlines at pause/1×/16×, event caps, unavailable delivery capacity, and exactly-once effects across reloads. Automated checks detect structural impossibilities; example playthroughs assess actual difficulty and recovery paths.
- **Sessions and persistence:** editing and testing never overwrite a normal save; repeated tests start identically; switching modes frees inactive instances; old runs pin content; failed/quota-limited writes and concurrent-tab edits do not silently lose work.
- **Art:** use calibrated building sprites and the 2:1 projection in editor and game. Review every building/appearance and nature species against roads, footprints, residents, terrain transitions, and representative neighbours at several zoom levels, in day/night/rain views. For residents, verify every customization part in every supported pose and use pairwise combination coverage plus diverse complete characters to catch layer/occlusion problems. Check matching portraits, body proportions, foot contact, facing, carried objects, lighting, and animation transitions beside the original cast. Keep foundations aligned without platforms or distortion. Default vegetation density must preserve the calmer landscape direction.
- **Performance:** measure a typical and a maximum-supported 64×64 map during brush drags, multi-selection, undo/redo, compile, save, camera movement, and 1×/16× play. Include both shared and unique resident appearances, creator preview latency, animation cache memory, and the maximum supported roster. Set population/entity/history limits using the Stage 0 baseline and validate them before release. Proposed targets on the reference desktop are responsive feedback within 100 ms for ordinary edits and approximately 60 fps while panning typical maps; confirm feasibility before making them release promises. Long operations show progress, preserve the previous revision, and allow cancellation before installation. Do not rebuild a full 4096-pixel terrain surface or copy a full save on every pointer event.
- **Player experience:** desktop walkthroughs cover blank creation, a deliberate validation failure, repair, playtest, return, crash recovery, export/import, and scenario completion. Verify keyboard focus, tooltips, non-colour feedback, readable controls, and consistent actions. Mobile layouts and phone checks remain outside scope.

Reuse the current native tests and scripts such as `verify-centered-starts.mjs`, `verify-modes.mjs`, `verify-story-objectives.mjs`, landscape/navigation/utility checks, and art projection checks. Extend them around the new definition/compiler API; a developer fixture merely restoring successfully is not sufficient evidence of a playable authored scenario.

## Work order and scope control

Stages 0 and 1 establish the contract; Stage 2 makes it visible and useful immediately. Stage 3 removes geography constraints and delivers at least three complete Brazilian biome presets before full terrain tools ship. Stage 4 delivers custom residents and their underlying roster/artwork refactors. Stage 5 completes settlement setup; Stage 6 adds guided play. Stages 7 and 8 turn the feature into a reliable, shareable player release.

After the schema and compiler contract settle, renderer/editor work, resident foundations and art prototypes, objective evaluation, and persistence work can proceed in parallel behind those interfaces. Complete the roster contract before population-dependent scenario rules. Deliver each slice with tests and a small ready commit; avoid combining the renderer extraction, world rewrite, character migration, and quest rewrite into a single change.

The highest-risk dependencies are arbitrary river geometry, initialization of owned supplies and equipment, stable resident identity across existing systems, consistent modular character animation, persisted objective/event semantics, and isolation of drafts from runs. Prove each with a small end-to-end example before expanding its palette. Custom residents and the required population generalization are part of this release. Defer unlimited populations, life-stage simulation, new terrain physics, arbitrary imported art, online services, and full campaign migration until the complete local creation loop is reliable.

## Implementation progress

The complete release scope above remains the objective. The native foundation is implemented; the player workspace and subsequent content systems are still required.

| Stage | Current state | Evidence and remaining work |
| --- | --- | --- |
| 0 Baseline and contracts | In progress | The pre-change native baseline passed 513 tests. Current Story/Sandbox starting quantities, ownership, camp, and buildings are covered by compiler regression tests. Biome art samples and character composition prototypes remain open. |
| 1 Shared definitions and compilation | Implemented for current default geography | `src/scenarios/` defines and validates versioned authoring data, catalogs, frozen run provenance, and stable building references. `src/initialization.rs` assembles fresh worlds; `src/persistence.rs` validates saves before installation. Story/Sandbox starts and the fresh-arrival/Sandbox-planning developer scenes use this path. The current engine passes 522 native tests, `verify-scenario-compiler.mjs`, `verify-centered-starts.mjs` (39 scenes), and `verify-modes.mjs`. |
| 2 Player editor and isolated testing | In progress | `web/editor/document.js` implements atomic draft transactions, bounded undo/redo, recoverable history checkpoints, and revision-aware save acknowledgements, covered by `verify-editor-document.mjs` against the native compiler. The player menu now opens a painted map workspace with building placement/selection/movement, road strokes, arrival/camera placement, starting funds/water/rules, supply-owner repair, validation, import/export and a durable IndexedDB library. Shared world rendering matches the game. Isolated playtests save, restart from frozen content and return to the draft; `verify-creator.mjs` exercises this player journey and save isolation, while `verify-content-library.mjs` covers reloads and stale-tab protection. A size-selectable meadow brush uses native vegetation/soil clearing; road and meadow strokes interpolate pointer samples and undo atomically (`verify-editor-brush.mjs` and the player browser journey). Shift-click and box selection support group moves and previewed copies with fresh identities and remapped owned inventories, verified by `verify-editor-objects.mjs` and browser pointer interaction. The player workspace also has a native-land minimap with click/drag navigation, arrow keys, Home-to-camp, and a viewport outline. Browser coverage checks pointer/keyboard navigation, native bank-mask overlay counts, river removal and hydro-alignment explanations. Full recovery UX and later authoring systems remain open. |
| 3 Geography and three biomes | In progress | Native ground inspection and habitat/fertility/retention/moisture/shade/disturbance/deposit overlays are available in the player editor, sharing `web/land-layers.js` with gameplay. Browser checks verify inspection and persisted layer choice; `verify-land.mjs` covers the shared native-backed layers. The native compiler now freezes a versioned row-sampled perennial river or an explicit no-river setting. `src/world.rs` supplies banks, full-footprint placement, pedestrian land and hydro orientation queries to navigation, steering, utilities, source sites, soil and persistence, and exports canonical masks. Four focused native tests and `verify-authored-river.mjs` cover moved/absent rivers, full footprints, hydro orientation, exact checkpoints and invalid-course rejection. The final full suite passes 522 tests; release WebAssembly, the scenario compiler checks and the player editor browser journey also pass. Terrain painting, currents, rain/wet-ground masks, the minimap, placement previews and land overlays now follow the frozen course. Players can remove the river or draw a connected row-sampled course with whole-stroke undo/redo; native arrival/building validation gates playtests. The browser journey covers these controls and checks the playtest minimap pixels, while the WebAssembly verifier compares frontend banks, hydro and habitats against native results across all 4,096 cells for default, absent, straight and drawn courses. Resolved authored land, three complete biome/climate/species profiles, assets, and the remaining editing tools are still required; geology and the initial vegetation generator remain pinned. |
| 4 Resident creator | Pending | Stable roster identities, replacement of five-person assumptions, appearance parts/composition, creator, and character presets. |
| 5 Settlement and rules authoring | Pending | Full starting-state controls, utilities, farming/animal configuration, located liquid supplies, and population-aware feedback. The native compiler already supports buildings/blueprints, house appearances, roads, located material supplies, and rule profiles. |
| 6 Goals and events | Pending | Authored goals, event ledger, journal editor, role bindings, and Story adapter. |
| 7 Library and sharing | Pending | Durable project/resident/scenario library, frozen releases, independent runs, import/export, and recovery. |
| 8 Examples and release quality | Pending | Three biome scenarios, custom-cast examples, desktop user journeys, full visual review, long simulations, and measured release limits. |

Playable saves now use version 30; version 29 villages migrate without changing their existing camp or ownership. Authoring schema 1 is separate from the save schema. Authored content currently passes through `scenario_template`, `scenario_catalog`, `validate_scenario`, and `load_scenario`; it does not pass through development-fixture restaging. Starting gifted buildings have no paid-material salvage credit.

The local WASM baseline at the start of implementation sampled 300 steps per scene: median tick/full-snapshot/frame-sample times were 1.49/2.53/0.15 ms for arrival, 2.66/2.61/0.35 ms for the established village, and 1.47/2.38/0.29 ms for autonomy. This single run shared the machine with native tests and is a comparison reference, not a desktop frame-rate or final performance result.

Open regression fixture: `verify-landscape.mjs` currently fails its resident work-hour assertion. It stages people at the former camp coordinates and assumes work begins before located supplies finish being hauled from the centered warehouse. Native-only reproduction confirms this independently of terrain rendering. Restage this check through domain operations without bypassing material ownership or weakening the work-hour assertion before release.
