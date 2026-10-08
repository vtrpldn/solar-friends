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
- Completed: combined supplier baskets, R$ 60 dispatch/delivery, visible receiving bench, once-only arrivals/refunds, one optional R$ 180 community shift per day, protected food sales and daily neighbour exchange.
- Completed: five painted land sites, finite deposits, managed regeneration/restoration, spaced access and project-driven sourcing/preparation. Camp recipes cover frames/walls/fittings; workshops add tiles and efficient salvage. Autonomous construction has two builders and two local-material workers; food, rest and hobbies retain priority.
- Completed: Projects, Town, inventory, recipes, source state, ledger, blocker messages, staged scaffolding, local veranda appearance, revised tutorial and shared-tool-library quest. Preview fixtures use the new save format. Resource clearings remain visible beside forest sprites; foundation/road registration is retained.
- Code delivered incrementally in b50706c (plan), ad7b6e9 (core economy) and ac7d337 (playable interface, art and progression), followed by final desktop polish and documentation.
- Validation: 69 Rust tests; Rust formatting and clippy; release WebAssembly build; JavaScript syntax; all 14 verification scripts. Tutorial and all four quests finish through the public API. Regression coverage includes farming, hens, power, spacing, storage and 6,272 placement comparisons.
- Balance: 24 game days each of funded, empty-fund and depleted properties. All projects completed, intermediate saves round-tripped, stocks/funds stayed valid, peak hunger stayed below 39, and every resident retained at least 58% waking leisure. These are bounded prototype scenarios, not a full-year balance claim.
- Browser: tested local method selection, priority, pause/resume, project cancellation, authoritative basket quoting, order confirmation/refund/arrival, spare resale, final construction and charging the installed solar farm. Reviewed the current narrow desktop panel and a 1600×900 desktop view; panels leave the dock accessible. No browser errors or warnings observed.
- Art: 47 source images, 75 entries and 303 live-checked cells; zero crop failures after measured source registration. Visually reviewed new props beside a house/resident and in day/night village scenes. Earlier architectural projection tolerances still pass.
- Evidence: local logs and screenshots in artifacts/economy; the Dev Tools latest report links the results. Browser checks this run used the in-app browser manually; the separate Playwright runner was not executed.

## Deliberate boundaries

This implements the construction economy described above. Vehicle routes, physical delivery hauling, contractors, credit/loans, real market prices, regional soil surveys and seasonal crop economics remain later design work. Prices, quantities, local deposits and outside income are fictional balancing values. Old village migration is intentionally omitted.

## Follow-up playtest

The completed [gameplay and artwork playtest](playtest.md) corrected cancellation lookups, tutorial/action feedback, work pickup, bounded tool maintenance, persisted house variations, shared night shading, source-worker destinations, actual plot clearance and task poses. It added protected checkpoint replay and desktop zoom/focus fixes. The follow-up passed 74 Rust tests, all 15 verification scripts and the live artwork checks. See the playtest report for coverage, evidence and prototype limits.
