---
description: Implementation stages for physical resources, production, resident time, living land, utilities, and long-term village simulation in Solar Friends.
---

# Village simulation implementation plan

## Purpose and proposed scope

Make village planning depend on where resources are, how people spend their time, and how the land and infrastructure change. The player identifies a bottleneck, compares solutions, commits space and resources, observes the result, and adjusts. Residents retain meals, sleep, friendships, optional outside jobs, and hobbies.

Implementation is active. The stages below remain the complete scope; the progress section records delivered parts and outstanding work. The existing [construction economy plan](plan.md) remains the record of delivered economy work.

## Contents

- [Design rules](#design-rules)
- [Existing systems and proposed extensions](#existing-systems-and-proposed-extensions)
- [Implementation order](#implementation-order)
- [Stage 0 Simulation foundations](#stage-0-simulation-foundations)
- [Stage 1 Physical resources and hauling](#stage-1-physical-resources-and-hauling)
- [Stage 2 Resident time and autonomous work](#stage-2-resident-time-and-autonomous-work)
- [Stage 3 Building production processes](#stage-3-building-production-processes)
- [Stage 4 Persistent land properties](#stage-4-persistent-land-properties)
- [Stage 5 Connected utilities](#stage-5-connected-utilities)
- [Stage 6 Long term village change](#stage-6-long-term-village-change)
- [Stage 7 Story integration and balance](#stage-7-story-integration-and-balance)
- [First playable release](#first-playable-release)
- [Verification and completion](#verification-and-completion)

## Design rules

- Rust owns simulation state, reservations, routes, transactions, and timing. JavaScript renders snapshots and sends player commands.
- Essential needs and rest take precedence over autonomous work. Preserve individual 6–9 hour sleep targets, breathing space, and ordinary community work hours.
- The player sets project priorities, stock targets, recipes, and infrastructure. Residents choose individual trips and tasks. Each shipment requires no manual assignment.
- Keep useful reserves bounded by demand. Larger storage provides room for projects and incoming goods; residents do not automatically fill it.
- Every stalled activity exposes its cause and an actionable remedy. Forecasts distinguish committed inputs, assumptions, and uncertainty.
- Preserve the desktop game HUD, painted art, orthographic geometry, and full-sprite grid registration. Review new cargo, infrastructure, and terrain effects at actual game scale and at night.
- Story keeps linear introductions to mechanics. Within each chapter, offer meaningful planning choices. Sandbox retains free building placement and replenishment while allowing optional logistics and utility constraints to be enabled separately.
- Introduce a versioned simulation save for physical inventories. Develop against fresh protected fixtures. Old exports remain intact; the first release can offer a confirmed fresh start rather than a comprehensive migration.
- Rates, soil properties, seasons, prices, and capacities are fictional game balance values. Calibrate them through playtests before treating them as defaults.

## Existing systems and proposed extensions

| System | Existing foundation | Proposed extension |
| --- | --- | --- |
| Physical resources | Shared material stock, project reservations, receiving capacity, material plots, orders, and resident pickups | Inventories at specific locations, cargo, construction staging, unloading, and hauling routes |
| Building processes | Construction stages, crop growth, tools, cooking, hens, digestion, filtration, and banana sewage treatment | Location-aware inputs and outputs, worker attendance, batch status, and explicit operating requirements |
| Resident time | Autonomous needs and work, spaced destinations, outside occupations, sleep, leisure, and helping requests | Work selection across logistics and production, time accounting, workload sharing, and completion forecasts |
| Living land | River placement rules, a southeastern stone area, finite shared reserves, planted material plots, crop moisture, and rain | Persistent soil, deposits by location, shade, disturbance, restoration, and land suitability |
| Utilities | Village-wide water stores and battery, solar and river generation, rooftop independence, and separate sanitation stores | Physical connections, local capacity, consumption at operating buildings, and water quality distinctions |
| Long-term change | Crop and timber cycles, outside income, relationships, and repeated gatherings | Seeded seasons, equipment condition, maintenance, gradual skills, and constrained market variation |

Primary code areas are [economy](src/economy.rs), [material plots](src/resource_sites.rs), [resident simulation](src/lib.rs), [movement and spacing](src/spacing.rs), [ecology](src/ecology.rs), [power](src/power.rs), [sanitation](src/sanitation.rs), and [Story progression](src/progression.rs). New responsibilities should use focused modules rather than expanding the resident loop indefinitely.

## Implementation order

| Stage | Depends on | Playable outcome |
| --- | --- | --- |
| 0 | Existing game | Stable identities, accounting, diagnostics, and repeatable comparison scenes |
| 1 | 0 | Storage placement and roads affect construction through actual hauling |
| 2 | 1 | Hauling, building, production, and outside income compete for a finite working day |
| 3 | 1 and 2 | Local processing and purchased goods become alternative ways to supply projects |
| 4 | 0 and 3 | Land suitability and restoration influence placement and yields |
| 5 | 1, 3, and 4 | Water, sewage, and power infrastructure connect producers and consumers |
| 6 | 2 through 5 | Seasons, maintenance, and skills make plans evolve over multiple weeks |
| 7 | Each preceding stage | Story teaches the integrated simulation and long-running villages remain playable |

Update relevant Story introductions and dev scenarios with each stage. Stage 7 completes the campaign redesign and balances the combined systems; it does not postpone all teaching until the end.

## Stage 0 Simulation foundations

Create stable identities for inventories, shipments, work orders, production batches, utility connections, and maintenance jobs. Define their lifecycle states and references before moving resources out of the shared stock.

Use one simulation clock measured in game minutes. Keep reservations distinct from ownership: reserving goods does not move or consume them. Add a read-only accounting view that reports resources at locations, in transit, committed to processes, consumed, and returned through salvage.

Record baseline scenarios for a compact village, dispersed buildings, empty funds, blocked access, and an established self-sufficient village. Capture how much time residents spend travelling, working, eating, sleeping, and enjoying leisure. Extend [Dev Tools](web/dev/tools.js) with these diagnostics.

Acceptance: saves round-trip exactly; invalid references fail without altering the live world; UI queries do not change the simulation; repeated runs from the same seed and commands produce the same transactions and work outcomes.

## Stage 1 Physical resources and hauling

Start with construction materials. Give the arrival camp a usable starter store, each extraction site a bounded output pile, warehouses their own inventories, and each project a staging area. The global materials display becomes a derived summary with separate available, reserved, and travelling quantities.

Deliveries and town pickups place their goods at the arrival unloading point. A delivered order can still await local distribution. Harvesting places materials at its site. Residents claim small cargo batches, walk to the pickup, collect only after arrival, then deliver only after reaching the destination. Visible carried loads and receiving piles make this understandable.

Add routes around occupied plots and the river. Roads reduce travel cost; ordinary walkable ground remains usable. Keep individual approaches and personal space from [spacing](src/spacing.rs). Recalculate routes after construction, roads, relocation, or demolition changes access. An unreachable job displays its blocked destination and leaves the resident free to choose useful work.

Project priority reserves specific available goods, receiving space, and transport capacity. Workers begin a construction stage only after its inputs reach the site. Cancelled shipments release reservations; goods already carried return to an accessible store or a recoverable ground pile. Moving or removing a warehouse requires relocating its contents before its capacity disappears.

Acceptance: near storage completes the same supplied project sooner than distant storage; a useful road improves throughput; deliveries, cargo, and salvage cannot duplicate goods; interruptions, blocked paths, full stores, cancelled projects, and saves in every trip state preserve accounting. A village without a warehouse can still begin construction.

## Stage 2 Resident time and autonomous work

Give each resident a daily breakdown of travel, village work, outside work, meals, rest, social time, and sleep. Include walking in the cost of accepting a job. Keep outside occupations and truck trips tied to actual departure and return, including their existing once-only payment and delivery rules.

Replace fixed builder assignments gradually with a shared job queue covering hauling, construction, farming, cooking, preparation, and maintenance. Choose jobs using urgency, player priority, reachable inputs, travel time, abilities, and recent workload. Essential needs, community agreements, and sleep remain hard constraints. Existing helping requests enter this queue with visible acceptance, travel, work, and completion feedback.

Let the player set broad work preferences and project priorities. Reserve an initial haul share within existing work hours; do not lengthen shifts to compensate for logistics. Rotate undesirable chores and prevent constant switching between nearly equal jobs. At the end of a work window, finish a safe handoff or put cargo down at an accessible location.

Forecast project completion from materials on site, incoming shipments, route costs, remaining labour, and expected resident availability. Show a range or a blocker rather than a precise time when supplies or staffing are uncertain. Sending a builder to an outside job should visibly change that forecast and expected funds.

Acceptance: two workers cannot claim the same goods or work position; no job traps a resident away from meals or sleep; a village can recover from empty funds; changing priorities does not strand materials; outside income and local completion time show the intended tradeoff; residents retain substantial leisure in balanced villages.

## Stage 3 Building production processes

Define each process by its located inputs, output destination, capacity, labour, passive duration, operating requirements, and stock target. Give batches clear states: awaiting inputs, hauling, ready for work, processing, awaiting output space, paused, and complete. Reserve inputs once and credit outputs once.

Connect workshop and camp preparation first. Compare local earth or bamboo methods with purchased prepared materials through cash, preparation labour, hauling, and completion forecasts. Convert kitchen inputs, tools, and food storage next so travel and perishability can be introduced without keeping two conflicting sources of inventory truth.

Preserve the distinction between active work and passive processes. Planting, harvesting, cooking, and preparation require attendance. Crop growth, sealed digestion, curing, filtration, and banana treatment continue without a resident standing beside them when their operating conditions permit. Their rates and inputs become inspectable.

Storage space and target reserves limit production. A full output area blocks the next batch without spending another batch of inputs. Maintenance and utility requirements join the same process model when their stages ship. Buildings under resident removal or relocation stop new operations and retain or return committed contents through explicit handoffs.

Acceptance: local manufacture and buying are both viable; passive processes progress during rest; workers cannot produce remotely; full stores stop excess production; water classes remain separate; cancellation, outages, relocation, demolition, and reloads never duplicate inputs or outputs.

## Stage 4 Persistent land properties

Add a seeded property map with baseline fertility, water retention, mineral deposits, and natural vegetation. Track moisture, nutrient balance, shade, and disturbance as persistent changes. Show optional fertility, moisture, deposits, and shade overlays using the same grid and footprint rules as placement.

Spread finite earth, stone, and reclaimed deposits across identifiable locations. Extraction depletes the actual cells or deposit patch being worked. Timber and bamboo remain player-planted renewable plots. Preserve a small guaranteed viable arrival area so a seed cannot prevent the first food, shelter, or material loop.

Use soil and shade to adjust crop growth, water demand, and harvest yield. Building on a fertile clearing creates an opportunity cost; trees can provide shade while reducing nearby solar exposure. Compost and restoration work improve soil gradually. Removing a building does not instantly restore its soil or mineral reserves.

Provide a placement comparison showing suitability and likely effects before committing. Represent changes with restrained terrain variation, visible plant health, and overlays; keep the established ground texture and sprite proportions readable.

Acceptance: choosing a suitable plot creates a measurable benefit; extraction cannot draw from an unrelated deposit; soil changes persist after harvesting and demolition; replanting sustains renewable resources; poor placement slows progress but leaves a practical route to recovery.

## Stage 5 Connected utilities

Add separate connections for fresh/service water, reclaimed irrigation, sewage, and shared electricity. Give each building compatible ports at its footprint edge. Lay pipes and cables along clear corridors, with optional shared road corridors. Connections consume materials and resident installation work. Show them through utility overlays and placement previews.

Implement water first. Nearby cisterns reduce manual carrying; pumps and pipes increase throughput while requiring equipment and operating power. Keep treatment requirements explicit for any newly modelled untreated intake. Gardens can use reclaimed irrigation; drinking, cooking, and handwashing require the appropriate fresh-water supply. Preserve manual access and starter barrels as an early fallback.

Implement sewage next. Ecological toilets connect to compatible sealed storage, banana treatment, or biodigestion. Greywater routes to reed beds. Show treatment capacity, accumulated load, and disconnection. Preserve curing before digestate becomes compost and the banana bed's lack of food or water output. Installation requires no resident handling exposed sewage as an ordinary cargo item.

Implement electricity with connected generators, local battery capacity, rooftop independence, and operating demand. Workshops and pumps use energy while running; lighting uses it after dusk. Priorities preserve essential services during shortages. A disconnected powered process pauses with its inputs intact. Building moves detach connections and queue new installation work at the destination.

Acceptance: disconnected buildings cannot use distant utility stores; capacity and flow limits affect consumers; priorities work during shortages; fresh water, greywater, sewage, and reclaimed water never mix; relocation and removal preserve stored energy and liquids through defined transfers; manual alternatives prevent permanent dead ends.

## Stage 6 Long term village change

Introduce a seeded weather sequence with wet and dry periods, forecasts, solar variation, and river-flow changes. Choose a compressed seasonal calendar through playtesting. Seasonal effects influence the soil, crops, timber growth, water supply, and generation models already introduced.

Track equipment condition through use and exposure. Start with pumps, workshop tools, batteries, and the truck. Show upcoming service needs, spare parts, and estimated work. Maintenance uses the normal resident queue. Wear first reduces efficiency; give essential services warning and a repair path before complete failure.

Add gradual, bounded skill growth from completed work. Residents improve at farming, construction, logistics, cooking, and equipment care without making every other resident incapable of those jobs. Outside occupations can contribute relevant experience. Protect diversity by limiting gains from repetitive trivial actions.

Add seeded town offers and modest seasonal price or delivery variation. Quotes remain firm after confirmation. Specialist parts still require purchasing; local material production supports several construction choices. Keep predictable access to essential goods and bounded food reserves.

Acceptance: a wet period affects crops and river generation coherently; forecasts and maintenance warnings support preparation; seeds and future events survive saves; skills require completed useful work; prices do not change confirmed orders; neglect creates recoverable inefficiency; a village can operate through multiple seasonal cycles with time for leisure.

## Stage 7 Story integration and balance

Rewrite chapters around planning outcomes while retaining linear mechanic introductions. Teach one new dependency at a time: bring materials to a site, shorten a haul, compare construction methods, share a working day, choose land, connect water, then maintain a working village. Use optional objectives to expose alternative solutions without requiring every possible building.

Replace production counters as the main goal with sustained outcomes. Examples include keeping the pantry healthy through a dry period, completing housing within a budget, or maintaining services while one resident earns outside income. Earlier valid effort still counts. Explain remaining conditions and show forecasts from the actual simulation.

Balance the first 15 minutes, the first week, and several seasonal cycles separately. Use paired villages with identical resources but different layouts, work preferences, and construction methods. Require multiple viable solutions. Tune workload and reserves so maintaining a successful layout leaves people time to relax.

Sandbox defaults retain immediate free placement and comfortable replenishment. Add optional logistics, land, maintenance, and utility constraints so players can explore layouts without repeating Story unlocks. Protected artwork scenes use complete connected fixtures or explicit preview overrides; their conditions never leak into playable saves.

Acceptance: the campaign completes through real player-facing actions; each of the six systems creates at least one consequential planning choice; no chapter requires excessive idle waiting; an unoptimised village can recover; alternative layouts and supply strategies remain viable; save isolation, artwork previews, and existing resident routines continue to work.

## First playable release

Ship Stages 0, 1, and 2 together as the first simulator release. Its scope is construction materials, starter and warehouse storage, site staging, hauling, useful roads, resident time accounting, and honest project forecasts. Keep other production and utilities at their existing behaviour until their respective stages ship.

The release must demonstrate four choices: near versus distant storage; road investment versus slower hauling; local work versus an outside shift; and project priority versus reserve capacity. Include a supplied starter project with an early visible completion. Players need useful observations and decisions within the first 15 minutes.

Each subsequent stage is a separate playable increment with its own PR, dev scenario, balancing notes, and acceptance evidence. Implementation begins after approval of this plan; merges require approval for each PR.

## Verification and completion

For every stage, add focused native tests for its state transitions and accounting. Extend public-API verifiers for placement, requests, transactions, save checkpoints, and recovery. Compare small time steps with fast-forward and check equivalent deliveries, payments, work, and consumed materials within declared numeric tolerances.

Run [the development check](scripts/dev-check.mjs) for Rust formatting, tests, lint, WebAssembly, JavaScript syntax, gameplay/art verifiers, and desktop browser regressions. Exercise changed controls manually in the browser. Review complete day/night scenes, carry poses, path detours, utility overlays, and blocked-work feedback at normal game scale.

The dev report should expose material conservation, travelling cargo, route failures, daily time use, queues, actual versus forecast completion, soil changes, utility flows, and condition. Keep long-running scenarios reproducible through exported seed and state. Verify good and bad layouts with the same inputs so a faster result demonstrates a planning benefit.

Completion requires all six systems, the redesigned Story introductions, configurable Sandbox constraints, and repeated seasonal operation to meet their acceptance checks. Record unresolved performance or balance limits alongside the corresponding result. Update this plan as stages are delivered, and preserve incremental review and commits.

## Implementation progress

- Stage 0 in progress: persisted simulation schema and seed; a shared ID allocator used by resident building-work jobs; eight days of observed time per resident; material receipt and spending accounts; read-only diagnostics and strict state validation. Physical inventories, shipment ownership, routing, production batches, utility connections, and maintenance jobs follow in their stages. The inventory report explicitly identifies the existing shared-stock model.
- Native checks cover exact reloads, midnight splitting, bounded history, invalid state, accounting differences, stable IDs, seed persistence, and read-only inspection. The full six-system completion audit remains outstanding.
