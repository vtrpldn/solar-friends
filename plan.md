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

1. [ ] Define material catalogue, standard and alternative recipes, units, source limits, supplier prices, delivery timing and starting resources. Cover every existing building, including garden, greenhouse, cistern, solar farm and lights.
2. [ ] Add inventory, shared fund, ledger, project/order/source identifiers, strict new-save validation and fresh preview fixtures. Verify round trips, malformed-state rejection and no duplicate resource grants.
3. [ ] Add blueprint projects, stage reservations, priorities, pause/resume and cancellation. Reserve only the current stage; consume once when labour starts. Cancellation releases reservations and returns explicit salvage without minting materials.
4. [ ] Add town supplier, basket quotes, combined orders, starting savings and limited outside-work income. Confirmed orders debit atomically; recovery from zero money needs no expensive prerequisite. Catalogue contains essentials and equipment.
5. [ ] Add scheduled dispatch/delivery, fees, receiving capacity and visible delivery events. Save/reload and large time steps never duplicate arrivals or refunds. Orders cannot exceed future storage capacity.
6. [ ] Place finite resource sites on the map with spaced access points, regeneration for managed resources, visible depletion and restoration. Food foraging stays separate from structural-material collection.
7. [ ] Add camp preparation, advanced workshop recipes, project-driven job choice and worker limits. Residents stop collecting at demand plus a small reserve; jobs obey work hours and urgent food/rest needs.
8. [ ] Implement visible foundation/structure/finishing/installation stages and connect completion to beds, food, workshop and power. Waiting projects release workers. All painted/procedural props align with the grid and existing scene.
9. [ ] Complete build costs, project board, inventory, Town, shared fund, order history, resident requests and actionable blocker messages. Rewrite tutorial, quests and timber-only copy; make the full loop understandable in the desktop game.
10. [ ] Add recipe choices with visible appearance differences, finite neighbour exchange and surplus sales protected by food reserves. Persist recipe selection; prevent free conversions after materials are committed.
11. [ ] Add economy Dev Tools scenarios, conservation/transaction tests, extended simulation, save/reload at each state, UI walkthroughs and art review. Update documentation and finish plan status.

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
