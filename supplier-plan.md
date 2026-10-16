# Town suppliers and seasonal offers

Why: buying locally prepared materials, waiting for a better offer, and spending resident time on a pickup should become predictable planning choices. Essential supplies must remain available.

Build on resident learning in PR #60. Preserve the full simulator roadmap; Story outcomes, optional Sandbox constraints and the final paired housing comparison remain separate required stages.

- [ ] Add a saved supplier switch, deterministic weekly offers and modest seasonal prices. Give new Story villages fourteen steady introductory days; keep Sandbox steady by default. Limited discounts do not restrict ordinary purchases or reward repeated resale.
- [ ] Quote baskets in the simulation, including partial offer allocations, transport fees and the announced delivery date. Reject stale confirmations without spending money. Store agreed terms with orders so later prices, seasons or option changes cannot reprice them.
- [ ] Preserve offer ownership through cancellation, pickups, delivery conversion, history pruning and saving. Repeated cancellation cannot refund twice, switching modes cannot refresh stock, and used offers cannot be claimed twice.
- [ ] Show the current town notice, remaining offer, upcoming prices and delivery calendar in the existing game book. Keep the basket and focus stable during updates; show fixed resale contributions separately. Add a protected supplier scene and a saved Sandbox control.
- [ ] Verify seed/future stability, useful purchase tradeoffs, essential access after an offer sells out, exact continuations, real pickups and deliveries, strict malformed-save rejection and resource accounts. Check desktop controls and artwork at game scale.
- [ ] Complete the campaign, seasonal and utility regressions with the same release build; record measured tradeoffs, local checks and review evidence. Keep the PR unmerged until individually approved.

Prices are fictional game balance values. Weekly regular prices stay within 10% of the base price; limited offers receive a further 10% discount. Delivery variation adds at most one announced day, with resident pickups retaining their existing travel, capacity and availability rules. The saved simulation seed determines future offers, prices and delivery calendars; looking at forecasts never advances random state.
