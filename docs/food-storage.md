# Food storage checkpoint — 2026-11-17

## Why

Food previously lasted indefinitely. Hoarding had no cost, and reserving ingredients or exports removed them from any future freshness accounting. Perishable food now retains batch age through consumption, reservations, processing and travel.

## Implemented rules

The authored shelf lives are ingredients 3 game days, fresh prepared meals 2, eggs 7 and milk 1. Kitchen-made dried provisions keep for 10 game days. These are gameplay parameters, not real-world food-safety guidance. A game day is 3200 simulation seconds; speed changes observation time, not expiration.

Residents and production jobs take the oldest stock first. Nearby expiration times are coalesced into hour-sized buckets using the earliest time, so bookkeeping stays bounded without refreshing older food. New output receives a shelf life when processing finishes, not when delivered. Purchased food starts aging at departure. Queued exports keep their original ages; cancelling an order does not reset them.

Expired stock becomes an equal count of organic residues. When part of an export batch expires, the whole quoted order is rejected without payment. Usable stock still waiting in stores is released immediately; usable cargo already loaded must return in the car. Cooking ingredients that expire before processing finishes cannot become meals: the operation returns any usable remains instead. Finished food also ages while output is being carried or waiting for storage space.

Resource management explains shelf lives, next stored-batch expiry and cumulative spoiled quantities. Sandbox disables spoilage.

## Ownership and saves

`foodStorage.version: 1` stores available lots and cumulative spoilage. Export orders, production operations and town purchases retain their own lots while goods are reserved or carried. Available lot quantities must reconcile with inventory on restore. Negative/invalid lots and export lots exceeding reserved amounts are rejected. Ordinary consumption, production, purchases and export cancellation use the same stock-change function.

Old saves have no historical freshness data. Their existing stock and outstanding jobs receive a full shelf life when first tracked; this is an explicit migration grace period, not reconstructed history. Saving tracked food preserves its deadline. Already completed old jobs are not retroactively aged or counted.

## Intentional limitations

- Optional [kitchen refrigeration](cold-storage.md) slows aging within powered capacity. Biome/temperature modifiers remain outstanding. Kitchens now offer [dried provisions](food-preservation.md); warehouses do not pretend to be refrigerators.
- Honey and dry supplies remain durable abstractions; not every material decays.
- Spoilage is batch expiry rather than gradual quality loss or health simulation.
- Organic residues enter the shared residue stock immediately; hauling waste separately is not modeled.
- The mass of food units remains approximate. This does not complete the whole-village physical inventory ledger.
- A partly spoiled sale batch is rejected rather than repriced; the rest returns for village use.

## Evidence

`verify-v02-food-storage.mjs` covers oldest-first removal, expiration boundaries, repeated ticks, preserved cancellation age, spoiled export rejection, physical return of usable cargo, spoiled cooking ingredients, aging prepared output, malformed saves, old-save loading, sandbox and elapsed-time equivalence.

`verify-v02-economy-soak.mjs` runs ordinary export funding and resident construction from the genuine Day 61 village. The three-day continuation passed with food/water/cash available and the house complete. Report: `docs/balance/2026-11-17-food-storage-soak.json`. This established village test is not proof that every new-game starting preset is balanced.

Production, procurement, physical trade, urgent needs, save protection and accelerated fixed-step regression checks passed. The normal-game Resources guidance was inspected in the in-app browser.
