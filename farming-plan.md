# Farming and animal husbandry

## Why

Give village planning more choices about land, water, food, livestock feed and community work without replacing residents' leisure with constant chores.

## Implementation

- [x] Expand garden crops with maize, cassava and fodder. Give rotations a visible soil benefit and retain the existing rain, local irrigation, compost and crop controls.
- [x] Add a perennial orchard, a two-goat pasture and an apiary, with construction recipes, delivered planting/animal stock and consistent painted artwork.
- [x] Keep fodder, milk and honey in actual local stores and carried shipments. Respect expiry, storage, production limits and material/water accounts.
- [x] Let residents tend animals and collect products during community work hours. Require delivered feed and fresh drinking water; pause production when care or supplies are missing. Bees need nearby flowering plots.
- [x] Integrate readable building controls, pantry and town supplies, Story introductions, Sandbox and a protected farming development scene.
- [ ] Check actual resident work, dry/wet conditions, overcrowding, moving/removal, invalid saves and exact save round trips. Play through the new controls and visually inspect every new sprite against existing buildings and terrain.

## Review

This branch builds on the interface polish in PR #56. Keep the implementation in incremental commits and a draft pull request; do not merge it without individual approval.

## Evidence in progress

The 398 native tests and strict all-target lint pass. An 18-day farming run produced fruit, milk and honey through actual resident work, completed a bean rotation, kept every material and liquid account balanced and restored exactly at every daily checkpoint. Each resident retained more than half their waking time for rest, hobbies and social life. The desktop walkthrough passes 13 captures including all 108 artwork entries. Fresh Story and wider regressions are still being replayed.

Longer playtests exposed overdue feed deliveries and kitchen ingredients losing priority to optional hauling. Pastures now hold six feed, overdue animal care receives attention during normal work windows, and an empty kitchen receives ingredients before optional feed or compost trips.
