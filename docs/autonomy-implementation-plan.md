---
description: Implementation plan for local seed, propagation, manure, repair and biogas loops, with enforced Guide maintenance.
---
# Ecovillage autonomy implementation plan

## Why

Reduce recurring imports through physical, understandable resource cycles. Progress comes from managing land, labor, time and losses. No technology unlocks, scripted milestones or sustainability score.

The Guide ships first with current mechanics. The five mechanics below are planned, not implemented by the Guide change. Existing biology, production, inventories, hauling, equipment and utilities remain authoritative.

## Delivery order

| Increment | Change | Observable result |
| --- | --- | --- |
| 0 | Diagram-first Guide and freshness checks | Players can inspect current flows and real import dependencies. |
| 1 | Seed saving | A crop can supply a later planting, at a food-yield and labor cost. |
| 2 | Tree and perennial propagation | Established plants can supply replacement starts through nursery work. |
| 3 | Manure recovery | Actual animal feed/care produces collectable manure usable in compost. |
| 4 | Local repairs | Compatible tools can be repaired with local materials; specialist parts remain imports. |
| 5 | Useful biogas | Captured gas replaces part of a defined kitchen fuel/energy demand. |

Each increment must include the mechanic, persistence/migration, job and resource accounting, visible activity, Guide diagram/tip updates and regression evidence. Merge each PR only with explicit approval.

## Shared contracts

- Extend existing operations and input/output manifests. Resolve quantities once, persist them, and use existing hauling/capacity checks. Rendering never creates resources.
- Keep inventory ownership authoritative across stores, reservations, processing, transit and installations. Track residual fractions and conversion losses explicitly.
- Add crop/recipe coefficients to centralized definitions with physical units, source references and explicit engineering assumptions. Calibrate before promising yield or independence; this plan does not invent production coefficients.
- No migration grants free stock, mature plants, manure or gas. Existing paid jobs finish with their captured input/output rules; new rules apply to new jobs. Version new state and validate referenced sites, quantities, timestamps and lots.
- Regular mode retains biological waiting and deterioration. Sandbox retains existing unlimited-stock and instant-biology conventions; resource-accounting tests must also run in normal mode.
- Show constraints and bounded estimates, not guaranteed autonomy. Local renewable inputs still require space, water, labor and replacement capacity.

## 1. Seed saving

**Player action:** choose a seed-production allocation before planting, then let those plants reach seed maturity and queue collection/cleaning/drying work. Keep the current crop identities and seed packet items.

Extend each cultivation bed with a saved allocation and separate food/seed maturity state. Seed allocation reduces the biomass available to food harvest; it is not a bonus output on a full food harvest. Growth stress, crowding and late losses affect the allocated crop. Define crop-specific seed maturity separately from fresh-food maturity, especially for fresh beans and sweet corn. Do not convert purchased fresh produce directly into seed packets.

A resolved harvest manifest splits food, recoverable seed material, residues and field losses. Processing converts seed material into the existing packet unit using a documented seed mass/count equivalence, with remainder and cleaning losses. If seed quality is modeled, store it with the existing inventory/lot ownership infrastructure and use it during planting; do not introduce a second stockpile or claim genetics, adaptation or disease resistance.

**Acceptance:** consecutive normal-mode plantings from saved seeds; mixed food/seed allocation; no food/seed double harvest; insufficient maturity; failed or stressed crop; wet/dry processing constraints actually implemented; partial collection and reload; seed mass/packet conversion; legacy purchased packets still work. Demonstrate whether a defined area supplies its next planting under baseline and stressed conditions.

## 2. Tree and perennial propagation

**Player action:** collect eligible seed/cuttings from an established source, grow starts in nursery beds, then allocate them to replanting or construction inputs.

Add explicit species/source definitions and compatible propagation recipes. Begin with the species already represented by timber, orchard and bamboo starts. Source age, collection availability and recovery interval limit repeat collection. Taking propagules must consume a recorded source allowance or biomass allocation. Do not give unlimited starts from repeatedly clicking a tree.

Use the existing biological waiting phase for nursery establishment and existing resident preparation, watering, collection and hauling. Nursery space is a real capacity constraint. Completed starts use existing `tree_starts`/compatible item identities; choose a distinct item only where current identities cannot express compatibility. Timber's current recurring purchased-start requirement can then be satisfied locally. Preserve orchard establishment time and forest growth time; no instantaneous mature-tree duplication.

**Acceptance:** locally propagated starts replace an actual timber replanting input; incompatible species rejected; depleted source allowance; drought and unreachable nursery; interrupted care; source removal; saved source recovery; nursery output delivered exactly once. No new reproduction system for ambient wildlife.

## 3. Manure recovery and composting

**Player action:** queue collection from an animal site, haul manure to compatible composting capacity, then apply mature compost to beds.

Add saved manure accumulation to livestock sites, driven by actual stocked animals and consumed feed/care, not building existence alone. Reconcile existing site-level care rates with headcounts before adding output. Define wet/dry mass and water conventions so feed, drinking water, animal products, manure and metabolic losses reconcile without counting water twice.

Keep manure distinct from ready compost and ordinary crop scraps. Add explicit manure-plus-carbon compost recipes using recoverable plant residues and the existing compost biological phase. Collection is resident work with storage/hauling constraints. Uncollected manure must have a bounded capacity and a documented consequence; implement any health or sanitation penalty before mentioning it in the Guide. Do not imply pathogen safety or detailed nutrient chemistry.

**Acceptance:** empty site and unfed animals produce no free manure; animal count affects modeled output; collection and compost each charge inputs once; full storage; interrupted hauling; decomposition losses; animal/site removal; legacy zero initialization; application returns fertility only through the existing decomposition flow. Human sewage remains a separate material stream.

## 4. Locally supportable equipment repair

**Player action:** choose a compatible repair recipe at the existing workstation; residents use real replacement materials and skill.

Extend the existing equipment repair recipes and wear ledger. Start with woven baskets and replaceable wooden handles/components. Bamboo and wood can repair those parts. Saw blades, metal tool heads, fasteners, pumps, electrical parts and battery cells retain explicit external dependencies until manufacturing actually exists.

Define which wear a local repair can recover, material costs and any maximum recoverable condition. Prevent repeated partial repair from erasing more wear than its recipe permits. Existing imported repair kits remain valid alternatives and existing queued jobs keep their captured costs. Check the tool dependency chain: a local basket repair must not secretly require an otherwise unrepairable imported tool for every cycle unless the Guide states that dependency.

**Acceptance:** worn compatible tools return to use; incompatible damage is refused; simultaneous borrowers and repairs cannot duplicate availability; repairs consume materials once; interruption/reload; selling cannot erase repair obligations; imported kits remain compatible. Demonstrate an actual repeated local repair cycle, including the tools needed to perform it.

## 5. Useful biogas

**Player action:** connect a working digester and bounded gas storage to a compatible kitchen burner. Start with thermal use, not a new electricity generator.

The current `biogas` counter is not a fuel network. Give new captured gas explicit units, capacity, leakage/loss accounting and site ownership. Calibrate conversion from the modeled digester input; treatment byproducts remain explicit. Do not reinterpret historical accumulated counters as free usable fuel: migrate them as historical totals and initialize usable storage to zero.

A kitchen with a compatible installed burner withdraws gas while a cooking job actually runs. Separate cooking heat from lighting, refrigeration and other electrical loads before claiming substitution. Define the fuel-energy equivalence and conversion efficiency once. Failed gas withdrawal must pause the fuel-dependent work or use an explicitly configured alternative; never charge two fuels for the same work. Use existing infrastructure connections and completed-installation checks rather than a parallel utility engine.

**Acceptance:** input waste converts to bounded stored gas and losses; cooking consumes a measured amount; idle kitchens consume no cooking fuel; no fuel creates no meal; partial gas supplies and explicit fallback; disconnected links; storage full; leaks if implemented; saved in-flight cooking; demolition records lost stored gas. No renewable-electricity or fertilizer benefit is advertised unless separately implemented.

## Guide freshness contract

The Guide describes implemented behavior only. Each entry contains a diagram, concise operating explanation, autonomy tip and dependency boundary. Future mechanics stay in this plan until their acceptance checks pass.

1. Keep editable diagram definitions and topic coverage in version control. Generate deployable SVGs locally; do not load a diagram CDN in the game.
2. Derive numerical facts from exported crop, recipe, utility and shelf-life definitions. Read those definitions in the Guide rather than copying numbers into prose.
3. Store a reviewed fingerprint of gameplay sources and a digest of Guide content/assets. Any source addition/change or generated asset mismatch fails the Guide verification check. Builds and CI run that check; neither silently regenerates approval fingerprints.
4. Refresh requires an explicit command after reviewing affected flows and tips. Record the reviewed sources and regenerate diagrams in the same commit as a mechanic change. A hash proves a review gate was crossed, not that prose is semantically correct.
5. Every new system requires a topic or an explicit mapping to an existing topic. Keep source/test references for maintainers outside the player-facing flow. Planned features must not appear as usable actions.
6. Test open/close, pause restoration, Escape/focus behavior, search, diagram loading and desktop fit. Exercise live facts against changed definition values and prove freshness checks reject stale sources/content/assets.

This makes stale Guide changes a blocking engineering failure. Semantic accuracy still requires source review and scenario tests; no automated fingerprint can guarantee that an explanation is true.

## Release acceptance

Run complete ordinary-mode cycles for each new loop with finite inventories. Compare baseline, resource shortage and interrupted-work scenarios. Reload every new lifecycle stage and in-transit output; load representative older saves. Reconcile material, water, energy and money changes including environmental inputs, exports and losses. Confirm sandbox shortcuts separately. Inspect diagrams and resident actions at desktop gameplay scale with game audio muted during automated checks.

Record actual import demand before and after each mechanic. Avoid claiming indefinite independence from a single short run, an initial stockpile, or sandbox inventories.
