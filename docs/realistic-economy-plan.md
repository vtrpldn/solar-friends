# Realistic economy implementation plan — v2

Written 2026-11-16. Status: implementation in progress; first physical-trade increment implemented locally. This is the active v2 economy proposal, separate from the historical v1 `plan.md`.

## Why

Make the village behave like friends establishing an ecovila: land provides some resources, other supplies must be bought, labor and transport constrain progress, and a community needs sustainable income. Realism should create meaningful planning decisions without turning ordinary chores into repeated player orders or forcing long periods of waiting.

Success means quantities, time, money and goods agree across the simulation, and players can understand why their plans succeed or stall. It does not mean reproducing every administrative detail of rural life.

## Current baseline

The current code already has physical construction work, resident needs, procurement trips, production recipes, water/power systems, named saves, stock targets, protected automatic sales and work priorities. Preserve these useful behaviors while revising their underlying accounting.

The main gaps are simplified material units and recipes, instant surplus sales, fixed trade batches and prices, generic inventory capacity, and economic rates that have not been calibrated to one coherent real-world reference. Existing three-day replays and the 68-type catalog playthrough are regression evidence, not proof of realistic balance.

Relevant sources: `web/v02/weekend/catalog-rules.js`, `simulation.js`, `economy-policies.js`, infrastructure modules, `resident-needs.js`, management screens and the isolated lab. The game remains a v2 implementation; do not port v1 wholesale.

## Implementation checkpoint — 2026-11-16

Completed in the first playable increment:

- Initial Campinas reference model for distance-based fuel, travel time and shared electricity tariffs; [calibration](economy-calibration.md) separates sourced observations from assumptions and missing research.
- Physical export reservations, cancellable before loading, payment in town, and persisted order ownership.
- Shared outbound sale cargo, mass/volume limits, partial collection of large prepaid construction orders, and explicit trip operating charges.
- Buyer demand limited per resource and game day; automatic sales use the same order path.
- Cash postings in whole centavos with sub-cent utility accrual; sale receipts and transport expenses appear in Finances.
- Export queue/cancellation UI, purchase transport quotes, save validation, and duplicate-settlement checks.
- Shared approximate cargo/processing measurements and a versioned completion ledger for seven transformations with named loss sinks; see [material accounting](material-accounting.md). This does not complete canonical units or biological accounting.
- Food batch ages, oldest-first use, spoilage into residues, age-preserving reservations and physical return of usable unsold cargo (2026-11-17); see [food storage](food-storage.md).
- Resident-installed kitchen refrigeration with finite capacity, metered electricity, outages and a separate cooling switch; see [cold storage](cold-storage.md).
- Optional kitchen dried-provisions recipe, with lower edible yield, extra labor/biogas and 10-day batch life; see [preservation checkpoint](food-preservation.md).
- Full outstanding collection budgets protected from grid bills and ordinary shopping, with available versus committed cash in Finances.
- Diminishing crew efficiency and assembly-time estimates.
- Task-based labor estimates for core buildings, complete material allocation, and versioned progress migration; see [construction checkpoint](construction-economy.md). Physical quantities and regional labor coefficients remain uncalibrated.
- Three-day replay of an established village completed a paid house with positive food, water and cash. This is regression evidence, not a fresh-start balance certification.

Further local increments (17 November): separate biological growth and resident labor, seasonal growth modifiers and gradual harvest loss; optional paid outside work; two simultaneous resident-driven cars; paid bulk delivery; automatic animal care and equipment service. See [biology](economy-biology.md) and [logistics and care](economy-logistics-and-care.md) for assumptions and diagnostic evidence.

Further implemented: ongoing crop irrigation, soil fertility and resident compost amendment, preventive food reserve budgets, mass-based spoilage, rolling observed-cash forecasts, ownership valuation, battery quantity consistency and replacement, resident demolition/salvage/relocation and optional trip consolidation, and a navigation fix for residents caught against adjacent camp structures. Current Campinas fuel was updated from the ANP 8–14 November 2026 municipality survey. An 18-case fresh-start matrix and a separate seven-day established-village replay passed; neither substitutes for the remaining full release gates.

Further calibration now includes area-based basic building shells with referenced wall-labor coefficients, bounded production carrying, named local buyers and price bands, a reconciled available-store movement ledger, area-based vegetable yields, juvenile orchards, timber replanting, equipment/roof replacement, charging losses and larger physical water storage. The current 18-case bootstrap matrix passes. The all-building run is still in progress; it exposed and led to a fix for blocked tent entrances.

Still outstanding: remaining regional price calibration, canonical bulk-unit storage conversion and complete location-event accounting, broader supplier availability and income-strategy validation, and full release gates including ordinary-speed first-hour play. None of stages 0–7 is claimed complete. See [parameter register](economy-parameters.md) for provisional values and evidence limitations.

## Design boundaries

- Prefer a small set of understandable materials over hundreds of nearly identical SKUs.
- Use one consistent game calendar. Acceleration changes how quickly the player watches time pass, not the underlying yields, bills or work required.
- Separate visual scale from economic scale explicitly. Stylized footprints must have documented usable area; do not silently assume every model dimension is literal construction area.
- Residents automatically handle repeat work, hauling, water, feeding and maintenance within player-set limits. Urgent personal needs still take precedence.
- No mandatory shared work shift. Fatigue, rest, skill, distance, tools and weather determine practical working capacity.
- Money pays suppliers, services and outside labor when explicitly contracted. It does not disappear merely because friends assemble a building.
- Keep sandbox convenient and isolate its exemptions from normal accounting.
- Start with simple local trade; defer loans, inflation, detailed taxes, legal permitting, speculative markets and multiplayer ownership.
- Preserve v1 code and authored 3D assets. No resident creator or mandatory quest campaign.

## Stage 0 — Reference scenario and baseline measurements

**Deliverables**

1. Choose one reference municipality/region, price month and property situation. Provisional baseline: rural southeastern Brazil with road access and an existing electricity connection; confirm the exact region during calibration. Biomes change land and growing conditions, not magically every supplier price.
2. Research dated regional sources for construction inputs and labor, retail equipment, agricultural yields, farm-gate prices, utility tariffs, fuel and transport. Prefer official statistics and tariff schedules, then identifiable local supplier quotes. Record source, date, unit, range, transport/tax inclusions and uncertainty.
3. Build a parameter register distinguishing sourced values, engineering approximations and deliberate gameplay abstractions. Do not claim sourced accuracy until research is complete.
4. Record current baseline scenarios: bootstrap shelter/water/toilet/food, local-material house, intensive farming, livestock, forestry and mixed-income community. Measure resident hours, travel, shortages, capital expenditure, recurring costs and cash flow.
5. Define starting circumstances explicitly: land is already purchased; starting money is remaining working capital. Price initial tools, vehicles and supplies even when they are gifted starting assets.

**Acceptance:** every proposed economic quantity has a unit and provenance category. Existing baseline runs are reproducible from seed and settings. Starting wealth does not conceal free operating income.

## Stage 1 — Accounting and simulation foundations

Refactor before introducing more economic complexity:

- Move transactions, inventory ownership, recipe evaluation, work estimates and trade state transitions out of the large simulation loop into focused modules. Keep commands shared by normal play and the lab.
- Define canonical units per resource: count for discrete equipment, liters for water/liquids, kWh for energy, and appropriate mass/volume/length units for bulk materials. UI purchase packs convert to these units rather than redefining stock.
- Store money in integer centavos. Use explicit rounding rules for partial quantities and settlement; avoid repeated rounding at each simulation tick.
- Track available, reserved, in-process, in-transit and installed goods separately. Every transition has one owner and one transaction; no double consumption or phantom stock.
- Give processing recipes explicit inputs, usable outputs, losses/byproducts, work, equipment and storage requirements. Losses must go to a named waste/byproduct sink.
- Separate human work-hours, machine runtime, biological growth and curing/drying time. Multiple workers cannot accelerate a biological or curing timer.
- Introduce a small event ledger for purchases, sales, bills, consumption, production, loss and construction. Bound stored history while retaining daily totals and active obligations.
- Version new saves. Preserve/export previous saves before conversion; write tested migrations where units can be converted unambiguously. Otherwise offer a clear new-economy start without overwriting the old village. Do not silently reinterpret old stock or discard it.

**Acceptance:** accounting tests reconcile opening stock + inflows − outflows = closing stock by resource and location. Cash cannot change without a ledger event. Reload and command retries cannot duplicate deliveries, sales or deductions. Normal and accelerated runs produce equivalent results for the same commands and elapsed game time.

## Stage 2 — Construction and labor model

- Give each building an economic specification: usable area, construction method, foundations, structure, roof, finishes and optional utilities. Use measured quantities plus explicit waste allowances; do not multiply one recipe indiscriminately for every house shape.
- Support basic inhabitable homes before optional solar, batteries or decorative finishing. Show which stages provide shelter, privacy, beds and utilities.
- Introduce local alternatives with distinct costs: adobe/earth, prepared masonry, timber and bamboo where appropriate. Model preparation and drying where it changes the decision.
- Calibrate assembly person-hours and prerequisite skills/tools. Cap simultaneous workers by accessible work positions. Model diminishing coordination benefits, not unlimited linear speedup.
- Include loading and walking in completion estimates. Shared construction equipment, hired deliveries or specialist installation can become optional services after the base model works.
- Cancellation, relocation, demolition and salvage must settle reserved, installed and recoverable materials consistently. Salvage needs work and returns a documented fraction; repeatedly building and dismantling must never create profit or resources.

**Acceptance:** compare at least a basic shelter, small house, larger house, kitchen, storage and road/bridge. Each has a traceable bill of materials and labor estimate. Larger buildings cost appropriately more without forcing identical material ratios. One-person versus crew construction respects work limits and resident needs.

## Stage 3 — Physical purchasing and selling

Replace instant exports with a persistent order lifecycle:

`planned → reserved → assigned → loading → outbound → trading → inbound → unloading → settled`

- Use the existing vehicles and town-trip presentation. Vehicles have cargo mass/volume limits, availability and operating costs. Drivers are unavailable for village work while away.
- Consolidate compatible purchases and exports on the same trip. Avoid sending a car immediately for every tiny shortfall; offer departure thresholds, urgent departure and a maximum waiting time.
- Auto-buy creates an affordable procurement plan. Reserve a bounded budget, explain transport charges and shortfalls, and buy only what the budget can cover. Never spend money reserved for another confirmed order.
- Automatic surplus policies create sale orders rather than instant cash. Keep essential reserves and pending production inputs protected. Avoid competing trips reserving the same goods.
- Start with a few concrete buyers/suppliers: hardware store, produce buyer and local market. Give each accepted goods, available stock or demand per period, and clearly quoted prices.
- Demand replenishes with elapsed game time and remains saved across reloads. Bulk discounts and price bands must be predictable; avoid an opaque simulated national economy.
- Settle payment at the documented trading stage, not when an export policy is enabled. Rejected or unsold goods return home. Define cancellations before and after loading, vehicle unavailability, driver rest and insufficient storage on return.
- Delivery services provide a more expensive fallback for bulky equipment or when no resident can drive. Fuel and maintenance must not create an unrecoverable procurement dependency.

**Acceptance:** no money from unsold goods; no goods before delivery. Multiple orders share trips when feasible. Tests cover full vehicles, partial purchases/sales, cancellation, interrupted travel, reload at each stage and exhausted local demand. No buy/sell loop produces guaranteed free profit.

## Stage 4 — Farming, forestry and livestock

- Calibrate output per planted area or animal, not simply per building. Distinguish food for people, seeds/planting material, animal feed and saleable surplus.
- Add seasonal growing conditions, harvest windows, moisture and soil fertility with readable forecasts. Begin with a few representative crop groups rather than a separate complex model for every species.
- Production requires tending/harvest work but growth continues without a worker standing at the plot. Unharvested ripe produce deteriorates gradually rather than vanishing on a deadline.
- Track food batches by age and storage condition. Use a small number of spoilage classes; preserve ingredients through cooking or suitable storage without generating edible mass.
- Animals require adequate feed, water and shelter; output varies with health and care. Avoid doubling output simply because a player duplicates a decorative animal model. Introduce reproduction only after feed capacity and individual counts are reliable.
- Forestry uses standing resources, selected cutting, timber preparation and a believable regrowth horizon. Mature starting trees are a finite asset. Do not make new timber trees mature in the same short cycle as vegetables.
- Compost/byproducts reduce purchased inputs but cannot form a resource-amplifying loop.

**Acceptance:** crop and animal outputs reconcile with inputs and losses. At least three income approaches are viable under suitable conditions. Test each biome and drought/wet periods. Faster simulation preserves seasons and spoilage. Long growth periods do not leave the player without meaningful near-term options.

## Stage 5 — Utilities and asset upkeep

- Calibrate power in kW and kWh, including duty cycles, solar availability, battery capacity/efficiency and hydro flow. Bills use the selected reference tariff and billing rules; estimates identify fixed versus consumption charges.
- Model water in liters with extraction limits, rain catchment area, treatment throughput, usable storage and quality separation. Sanitation throughput must match actual resident use.
- Passive structures consume no arbitrary electricity. Failed or blocked processes draw only their documented standby demand, if any.
- Add condition and service intervals for vehicles, pumps, tools, roofs and batteries. Use a few condition bands and visible advance warnings, not unpredictable failure spam.
- Automatic maintenance consumes specific parts/materials and resident work within a budget. Equipment aging reflects usage and time; installed assets cannot be maintained forever with no replacement costs.

**Acceptance:** daily utility balances reconcile generation/extraction, storage changes, use and losses. Bills match the ledger. A fully off-grid scenario works with adequate capacity, while grid-connected setup remains economically useful. Long runs cover missed maintenance, repairs and replacement without deadlocks.

## Stage 6 — Community finances and player controls

Deliver basic explanations with each prior stage; this stage completes the combined management experience.

- Separate operating income/expenses, construction investment, household consumption and assets. Show cash available, committed cash, expected receipts and upcoming bills.
- Show a rolling forecast with assumptions and ranges. Avoid presenting speculative sales or unharvested crops as guaranteed money.
- Give buildings an estimate of remaining materials, resident hours, delivery dependencies, running costs and productive capacity. Show why an estimate changes.
- Offer reserve policies in useful terms, such as days of food and liters of drinking water, alongside exact units. Budget essential purchases, maintenance and discretionary expansion separately.
- Support optional outside paid work or contracted work as a deliberate income choice, with travel, hours and resident availability. Reuse earlier ideas only after implementing them in v2; do not assume v1 jobs already exist here.
- Surface actionable warnings with location and response: low feed, insufficient cargo capacity, buyer demand exhausted, maintenance due. Avoid requiring acknowledgement for every routine event.
- Preserve responsive desktop dialogs and the uncluttered HUD; put detailed accounting behind the management screens.

**Acceptance:** a player can explain where money went, what is reserved and what blocks a project using only the UI. Forecasts distinguish observed rates from assumptions. Routine water, feeding, trading and maintenance can continue without repeated manual orders.

## Stage 7 — Balance, pacing and release

Run both ordinary play and accelerated simulation. Keep separate reports for each.

1. Test bootstrap communities with tight, default and comfortable starts across all three biomes and near/remote town access. Include different layouts and procedural seeds.
2. Exercise construction from local resources versus purchased materials; compare bamboo, vegetables, greenhouse crops, forestry, honey, livestock and outside income after all input, transport and upkeep costs.
3. Run at least one complete production/growth/billing cycle for each system. Use longer seasonal runs for agriculture and forestry; a three-day test is insufficient for those claims.
4. Repeat the full buildable-catalog construction through normal economic commands and resident labor. Injected test fixtures may diagnose individual systems but cannot count as a viable playthrough.
5. Probe exploits: reload duplication, infinite salvage, negative-price rounding, export/import arbitrage, capacity bypass, multi-site target overshoot and accelerated-time discrepancies.
6. Play the first hour at ordinary speeds. Log useful decisions, time spent waiting, interruption frequency, shortages and clarity. Do not use lab throughput as evidence that the game is enjoyable.
7. Tune starting equipment, working capital, buyer access and interface automation before distorting physical yields to compensate for poor pacing. Where abstraction is necessary, document it and apply it consistently.
8. Update current guides and parameter provenance, run relevant regression/build checks, then release through the normal GitHub/Netlify workflow when authorized. Confirm live build identity and save behavior.

**Release gates:** no known stock/cash duplication or save loss; normal-speed/accelerated equivalence; a documented viable basic-needs route for the default start; no single effortless unlimited income exploit; essential routines operate autonomously; rendered UI explains shortages and commitments; first-hour playtest has no prolonged involuntary waiting without a practical response.

## Delivery order and checkpoints

- **Milestone A:** stages 0–1, followed by one calibrated shelter/material chain. Establish the trustworthy accounting model before changing the full catalog.
- **Milestone B:** stage 2 and one purchase/export route from stage 3. The player can build a basic home and earn actual settled sales income through physical logistics.
- **Milestone C:** complete stage 3 and stage 4. Production and trading offer distinct, limited and understandable opportunities.
- **Milestone D:** stages 5–6, followed by the full stage 7 release gate. Utilities, upkeep and community finances agree with the rest of the economy.

At each checkpoint, deliver a playable increment, document intentional simplifications, and retain reproducible evidence. Do not implement the whole specification in one unreviewable change. The first implementation task is the reference scenario/parameter register and accounting boundary—not changing every price at once.
