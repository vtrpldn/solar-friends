---
description: Saved town supplier prices, limited weekly offers, firm orders and matching gameplay evidence.
---

# Town suppliers and seasonal offers

> Historical v1 plan or exploration record. Retained for implementation history; unchecked items are not the active v2 roadmap and described mechanics may differ from v2. See [current documentation](README.md) and the [documentation index](docs/README.md).

Why: buying locally prepared materials, waiting for a better offer, and spending resident time on a pickup should become predictable planning choices. Essential supplies must remain available.

Build on resident learning in PR #60. Preserve the full simulator roadmap; Story outcomes, optional Sandbox constraints and the final paired housing comparison remain separate required stages.

- [x] Add a saved supplier switch, deterministic weekly offers and modest seasonal prices. Give new Story villages fourteen steady introductory days; keep Sandbox steady by default and apply its option immediately when enabled. Limited discounts do not restrict ordinary purchases or reward repeated resale.
- [x] Quote baskets in the simulation, including partial offer allocations, transport fees and the announced delivery date. Reject stale confirmations without spending money. Store agreed terms with orders so later prices, seasons or option changes cannot reprice them.
- [x] Preserve offer ownership through cancellation, pickups, delivery conversion, history pruning and saving. Repeated cancellation cannot refund twice, switching modes cannot refresh stock, and used offers cannot be claimed twice.
- [x] Show the current town notice, remaining offer, upcoming prices and delivery calendar in the existing game book. Keep the basket and focus stable during updates; show fixed resale contributions separately. Add a protected supplier scene and a saved Sandbox control.
- [x] Verify seed/future stability, useful purchase tradeoffs, essential access after an offer sells out, exact continuations, real pickups and deliveries, strict malformed-save rejection and resource accounts. Check desktop controls and artwork at game scale.
- [x] Complete the campaign, seasonal and utility regressions with the same release build; record measured tradeoffs, local checks and review evidence. Keep the PR unmerged until individually approved.

Prices are fictional game balance values. Weekly regular prices stay within 10% of the base price; limited offers receive a further 10% discount. Delivery variation adds at most one announced day, with resident pickups retaining their existing travel, capacity and availability rules. The saved simulation seed determines future offers, prices and delivery calendars; looking at forecasts never advances random state.

The purchasing core passes all 467 native tests and strict all-target lint, including twelve supplier regressions. The matching compiled replay exercises actual pickup travel, eleven exact pickup continuations, once-only cancellation and refunds, stale confirmations, fixed delayed delivery through option changes and valid material accounts. One learning-disabled, steady-supplier Sandbox day matches the learning release apart from additive metadata.

Eight focused desktop captures pass without browser errors, covering partial offers, future prices, refund and stock recovery, a real pickup, freight dates and Sandbox save/reload. A real midnight restock changes displayed prices while keeping the focused quantity and basket intact. Trade remains accessible in Sandbox, and a compact offer strip keeps the existing book styling; the fund links directly to outside occupations.

The first campaign replay exposed a test player waiting for timber after autonomous harvesting had already cleared its plot. It now recognises that valid earlier work and purchases the required replacement seedlings. An exact earned chapter-nine continuation completes all thirteen chapters on day 106 without authored resources or progress. The matching fresh replay completes on day 106 through all twenty-one building kinds, exact chapter checkpoints and paid supplies. Its locally supplied adobe home takes nine days. All 62 public verifiers and 162 JavaScript syntax checks pass; the full desktop walkthrough passes 191 captures with no browser errors. Changing villages clears draft orders and pickup notices; normal price changes retain quantities and focus.

The earned day-106 continuation passes another 84 days across both seasons, with 85 exact checkpoints, seven completed maintenance jobs using R$807.84 of purchased parts, peak hunger below 45 and at least 58% waking village leisure for every resident. Ready ingredients, prepared meals, milk and honey remain between seven and sixty-two portions. Basic ingredients and meals alone sometimes reach zero; the first such sample has twelve directly edible, unreserved milk and honey portions. Eggs and committed cooking inputs do not count as ready food.

Both paid utility villages pass their independent 24-day comparison, with valid resources, exact saves, useful connected flow and majority leisure. Their stricter basic-food measure stays positive. The long runs use the earned continuation checkpoint, preserved before the later fresh replay. Matching source/build identity and results are in [.github/suppliers-review/results.json](.github/suppliers-review/results.json). Hosted CI cannot start because of the GitHub account billing/spending limit. PR #61 remains a draft and is unmerged. Stage 7 retains its full scope.
