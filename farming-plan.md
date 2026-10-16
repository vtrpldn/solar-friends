# Farming and animal husbandry

## Why

Give village planning more choices about land, water, food, livestock feed and community work without replacing residents' leisure with constant chores.

## Implementation

- [x] Expand garden crops with maize, cassava and fodder. Give rotations a visible soil benefit and retain the existing rain, local irrigation, compost and crop controls.
- [x] Add a perennial orchard, a two-goat pasture and an apiary, with construction recipes, delivered planting/animal stock and consistent painted artwork.
- [x] Keep fodder, milk and honey in actual local stores and carried shipments. Respect expiry, storage, production limits and material/water accounts.
- [x] Let residents tend animals and collect products when their energy and needs allow. Require delivered feed and fresh drinking water; pause production when care or supplies are missing. Bees need nearby flowering plots.
- [x] Integrate readable building controls, pantry and town supplies, Story introductions, Sandbox and a protected farming development scene.
- [x] Check actual resident work, dry/wet conditions, overcrowding, moving/removal, invalid saves and exact save round trips. Play through the new controls and visually inspect every new sprite against existing buildings and terrain.

## Review

This branch builds on the interface polish in PR #56. Keep the implementation in incremental commits and a draft pull request; do not merge it without individual approval.

## Evidence

All 400 native tests, strict all-target lint, 149 JavaScript syntax checks and 58 public regression scripts pass. The fresh Story completes all 13 chapters on day 148 through actual placement, purchases, resident work and gatherings; every chapter restores exactly, and all 21 building kinds are introduced.

The 18-day farming run collects 24 milk, nine honey and 60 orchard fruit, completes a bean rotation, keeps every material and liquid account balanced and restores exactly at all 18 daily checkpoints. Each resident retains more than half their waking time for rest, hobbies and social life. Another 84 earned Story days across two seasonal cycles, plus a 24-day manual/connected utility comparison, preserve healthy reserves, exact checkpoints and residents' leisure.

The full desktop walkthrough passes 169 captures without browser errors. A separate 13-capture farming and artwork walkthrough passes at 1600×900 and 1280×800, including targeted resident care and actual production. All 108 artwork entries pass the live checks; all 26 building variants appear in the game previews and day/night grid tools.

Playtests exposed overdue feed, optional hauling delaying essential cooking, crowded kitchen residues blocking inputs and a stale meal reservation when sending an eating resident on a town pickup. The fixes preserved actual local ownership and the work schedule in that tested build. The current build uses resident energy and needs instead of shared work hours. Farm inspectors now update their title and portrait while paused, and care warnings replace irrelevant visit messages. The standard local game package has been rebuilt with the same tested engine as the protected farming preview.
