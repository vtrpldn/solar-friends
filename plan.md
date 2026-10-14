# Rural construction economy

## Why

Construction should combine materials available on a Brazilian countryside property with supplies bought in town. Projects compete for money, materials and a limited amount of community work. Residents keep their meals, rest, friendships and hobbies.

## Scope and decisions

- Implement autonomously in playable increments on main; never merge a PR without explicit approval.
- Use a new village save version. Old villages may reset; migration is out of scope by user instruction.
- Starting property: a fictional southeastern countryside site with suitable building earth, managed bamboo/timber, a finite stone deposit and an old salvage area. These are game assumptions, not a universal Brazilian resource profile.
- Keep exact tile foundations, resident spacing, desktop presentation and the existing painted art direction.
- Prices are game balance values in reais, stored as integer centavos. No real purchases or external financial services.
- Local collection and preparation follow normal work hours; projects never extend autonomous shifts.
- Blueprint placement is free. Material shortages block stages rather than placement.
- Rust owns recipes, inventories, transactions, reservations and scheduling; JavaScript presents the snapshot.
- Essential prepared materials are also purchasable, avoiding circular workshop dependencies.
- Orders remain independent of cancelled buildings; undispatched orders have explicit refunds.
- Run meaningful checks per increment, maintain this checklist, and commit completed work incrementally.

## Implementation stages

1. [x] Define material catalogue, standard and alternative recipes, units, source limits, supplier prices, delivery timing and starting resources. Cover every existing building, including garden, greenhouse, cistern, solar farm and lights.
2. [x] Add inventory, shared fund, ledger, project/order/source identifiers, strict new-save validation and fresh preview fixtures. Verify round trips, malformed-state rejection and no duplicate resource grants.
3. [x] Add blueprint projects, stage reservations, priorities, pause/resume and cancellation. Reserve only the current stage; consume once when labour starts. Cancellation releases reservations and returns explicit salvage without minting materials.
4. [x] Add town supplier, basket quotes, combined orders, starting savings and limited outside-work income. Confirmed orders debit atomically; recovery from zero money needs no expensive prerequisite. Catalogue contains essentials and equipment.
5. [x] Add scheduled dispatch/delivery, fees, receiving capacity and visible delivery events. Save/reload and large time steps never duplicate arrivals or refunds. Orders cannot exceed future storage capacity.
6. [x] Place finite resource sites on the map with spaced access points, regeneration for managed resources, visible depletion and restoration. Food foraging stays separate from structural-material collection.
7. [x] Add camp preparation, advanced workshop recipes, project-driven job choice and worker limits. Residents stop collecting at project demand and one small tool-making batch, leaving only small batch remainders; jobs obey work hours and urgent food/rest needs.
8. [x] Implement visible foundation/structure/finishing/installation stages and connect completion to beds, food, workshop and power. Waiting projects release workers. All painted/procedural props align with the grid and existing scene.
9. [x] Complete build costs, project board, inventory, Town, shared fund, order history, resident requests and actionable blocker messages. Rewrite tutorial, quests and timber-only copy; make the full loop understandable in the desktop game.
10. [x] Add recipe choices with visible appearance differences, finite neighbour exchange, surplus sales protected by food reserves, and half-price resale of unreserved materials for storage recovery. Persist recipe selection; prevent free conversions after materials are committed.
11. [x] Add economy Dev Tools scenarios, conservation/transaction tests, extended simulation, save/reload at each state, UI walkthroughs and art review. Update documentation and finish plan status.

## Playable milestones

- Projects and purchasing: blueprint -> source/prepare or order -> receive -> construct, with all existing building kinds.
- Local construction: visible finite land resources, bounded autonomous work and visible stages.
- Complete economy: alternative recipes, community exchange, revised progression, browser review and extended balance checks.

## Acceptance checks

- Two projects cannot reserve or consume the same units. Priority and pause release unused reservations.
- Stage transitions and order delivery are deterministic and occur once across save/reload and all time speeds.
- Cancelling projects/orders cannot increase resources or money beyond explicit paid refunds/salvage.
- Unfunded, depleted and capacity-limited villages have clear recovery actions.
- Storage includes incoming orders and production reservations; nothing silently disappears.
- Essential buildings can be completed without advanced buildings that depend on them.
- Food retains a healthy reserve; sales and construction do not override household needs.
- Residents retain substantial waking leisure, respect work hours and stand apart at sites.
- Foundations, construction props and delivered equipment preserve proportions and road joins.
- Fresh gameplay, developer fixtures and new-version export/import work; old villages receive a clear fresh-start notice.
- Rust format/tests/lint, WebAssembly build, JavaScript checks and desktop browser interactions pass.

## Progress log

- Plan recorded before implementation. Existing game uses timber-only costs and immediate payment; this plan replaces that loop.

- Completed: 15-material catalogue and mixed recipes for all 12 construction kinds; free roads remain unchanged. Cistern equipment includes a pump. Prepared and local methods are selectable before any material is consumed.
- Completed: strict version 3 saves, stable building/order identities, atomic centavo transactions, current-stage reservations, priority, pause/resume, half salvage on cancellation and bounded order history. Full storage can recover through spare-material resale.
- Completed: combined supplier baskets, R$ 60 dispatch/delivery, visible receiving bench, once-only arrivals/refunds, five optional personal occupations with individual R$ 160–240 shift contributions, protected food sales and daily neighbour exchange.
- Completed: five painted land sites, finite deposits, managed regeneration/restoration, spaced access and project-driven sourcing/preparation. Camp recipes cover frames/walls/fittings; workshops add tiles and efficient salvage. Autonomous construction has two builders and two local-material workers; food, rest and hobbies retain priority.
- Completed: Projects, Town, inventory, recipes, source state, ledger, blocker messages, staged scaffolding, local veranda appearance, revised tutorial and shared-tool-library quest. Preview fixtures use the new save format. Resource clearings remain visible beside forest sprites; foundation/road registration is retained.
- Code delivered incrementally in b50706c (plan), ad7b6e9 (core economy) and ac7d337 (playable interface, art and progression), followed by final desktop polish and documentation.
- Validation: 69 Rust tests; Rust formatting and clippy; release WebAssembly build; JavaScript syntax; all 14 verification scripts. Tutorial and all four quests finish through the public API. Regression coverage includes farming, hens, power, spacing, storage and 6,272 placement comparisons.
- Balance: 24 game days each of funded, empty-fund and depleted properties. All projects completed, intermediate saves round-tripped, stocks/funds stayed valid, peak hunger stayed below 39, and every resident retained at least 58% waking leisure. These are bounded prototype scenarios, not a full-year balance claim.
- Browser: tested local method selection, priority, pause/resume, project cancellation, authoritative basket quoting, order confirmation/refund/arrival, spare resale, final construction and charging the installed solar farm. Reviewed the current narrow desktop panel and a 1600×900 desktop view; panels leave the dock accessible. No browser errors or warnings observed.
- Art: 47 source images, 75 entries and 303 live-checked cells; zero crop failures after measured source registration. Visually reviewed new props beside a house/resident and in day/night village scenes. Earlier architectural projection tolerances still pass.
- Evidence: local logs and screenshots in artifacts/economy; the Dev Tools latest report links the results. Browser checks this run used the in-app browser manually; the separate Playwright runner was not executed.

## Deliberate boundaries

This implements the construction economy described above. Vehicle routes, physical delivery hauling, contractors, credit/loans, real market prices, regional soil surveys and seasonal crop economics remain later design work. Prices, quantities, local deposits and outside income are fictional balancing values. Saves predating version 3 remain unsupported; the player-managed resource follow-up below retires the fixed sites in version 3 saves.

## Follow-up playtest

The completed [gameplay and artwork playtest](playtest.md) corrected cancellation lookups, tutorial/action feedback, work pickup, bounded tool maintenance, persisted house variations, shared night shading, source-worker destinations, actual plot clearance and task poses. It added protected checkpoint replay and desktop zoom/focus fixes. The follow-up passed 74 Rust tests, all 15 verification scripts and the live artwork checks. See the playtest report for coverage, evidence and prototype limits.

## Player-managed resource land

Why: resource production should come from choices the player makes, rather than extraction props added to every new village.

- [x] Start new villages without timber, bamboo, earth, stone or salvage sites. Keep legacy village inventory while retiring the old fixed sites.
- [x] Add player placement, costs, real plot occupancy and clearing controls for timber plots, bamboo cultivation and finite extraction sites. Stone extraction belongs in the property's stony southeast; multiple sites share the same finite reserve.
- [x] Grow planted timber and bamboo over game days. Residents tend and harvest within normal work windows; bamboo resprouts, timber is replanted, and lack of water or seedling funds pauses the cycle visibly.
- [x] Keep collection limited to project/tool demand, with explicit manual harvest and replant controls. Save growth, yields, settings and depleted reserves without duplicating resources.
- [x] Replace always-visible economy props with placed sites and growing plants. Add Land & materials tools, growth/harvest status, actionable shortages and a cultivation test scene.
- [x] Check new-game emptiness, placement conflicts, harvest/replant conservation, finite deposits, worker arrival/spacing, save/reload and actual desktop controls.

Growth durations and prices are game-balance abstractions. Town purchases remain the immediate alternative while plants mature.

## Story progression through the complete village

Why: the seven original chapters leave newer buildings and systems unexplained. Extend Story to thirteen chapters, with playable objectives and shortcuts to the relevant tools.

- [x] Arrival: shelter, food, cistern, cooking, personal sleep rhythms and automatic time acceleration.
- [x] Roots: food forest, planted timber and cultivated bamboo. Gathering: welcome supper, friendships and square.
- [x] Shared work: storage, paid outside occupations, town pickup, deliveries and shared tools.
- [x] Resilience and hens: workshop preparation, compost, greenhouse seedlings, crop care and egg cooking.
- [x] Sunshine: solar farm, battery and actual lighting after dusk.
- [x] Water loop: ecological toilet, greywater, reed bed, rain collection and reclaimed irrigation.
- [x] Scraps to energy: biodigester, cooking gas and fully cured compost.
- [x] Homes of earth: finite extraction, renewable timber harvest/replant, material preparation, adobe construction, surplus sales and neighbour exchange.
- [x] River power: a placed river generator supplying energy after dusk.
- [x] Community care: an actual agreement, shared cooking, rest and hobbies. Offer a story check-in so balanced play does not require deliberately overworking someone.
- [x] A flourishing village: all building kinds, beds, healthy reserves and another gathering.
- [x] Preserve milestone credit, existing saves and free Sandbox; test native/UI unlock parity, the full public-API playthrough, reloads and desktop quest navigation.

Delivered in incremental commits with 114 native tests, Rust formatting and clippy, a release WebAssembly build and all 24 gameplay verification scripts passing. The new placement verifier compares all 3,380 plot previews with native rules. Browser playtesting placed a paid timber plot, grew timber and bamboo, queued harvests, verified resident work produced eight timber and four bamboo, changed harvest settings and cleared a quarry. Regression checks cover these same controls while protecting the player's saved village. Standing trees use the existing forest art; bamboo and finite sites reuse the established material atlas.

The public game API completed all thirteen chapters on day 47, with each earned checkpoint saved and reloaded. All seventeen building kinds were constructed. Native tests cover old-save padding, invalid progress, real rain/energy/cooking credit and the late-story check-in; a harvest-priority regression protects manually requested work from repeated gardening. Desktop journal and care checks use the earned checkpoints in a protected test scene.
