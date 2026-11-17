---
description: Fresh meals, dried provisions and automatic kitchen reserve policies.
---

# Food preservation checkpoint — 2026-11-17

## Why

Spoilage needs a planning response beyond frequent shopping or selling everything. Kitchens can now prepare dried provisions as an optional tradeoff: lower edible yield and more labor/energy in exchange for a longer shelf life.

## Player behavior

Open the Food Almanac, find a completed community kitchen, and select **Prepare dried provisions**. Start a batch or enable the existing stock-target automation. Ordinary meals remain the default recipe.

| Requirement | Ordinary meals | Dried provisions |
| --- | ---: | ---: |
| Ingredients | 4 | 6 |
| Water | 2 | 2 |
| Usable meals | 4 | 4 |
| Organic residues | 1 | 2 |
| Base resident work | 25 simulation seconds | 75 simulation seconds |
| Equivalent game work time | 11.25 minutes | 33.75 minutes |
| Shelf life from processing completion | 2 game days | 10 game days |
| Biogas alternative when unpowered | 0.2 | 0.6 |

Electric cooking uses the existing kitchen demand for the longer processing duration. Time and energy depend on actual work conditions; this is not a fixed cash construction fee. The shelf life and coefficients are authored game assumptions, not real-world food-preservation instructions or measured regional yields.

Provisions remain in the existing meals resource; their individual lots carry preservation identity and expiry. The Food Almanac freshness summary reports how many stored meals are provisions. Residents use the earliest-expiring meals first. Fresh and preserved meals share the same inventory total. Buying prepared meals still supplies ordinary fresh meals, and provisions receive no resale price premium.

## Accounting and saves

The approximate mass equation is 6 kg ingredients + 2 kg water = 4 kg meals + 2 kg residues + 2 kg drying loss. It uses the shared provisional measurements and adds an eighth transformation to processing accounting.

Preservation starts only when resident processing completes. Inputs that spoil while waiting cannot be rescued by completing the recipe. Output ages while carried. Selling, cancelling a sale, returning cargo, consuming part of a lot and saving/loading preserve its original deadline and identity. Fresh and preserved lots are not coalesced together. Existing saves and ordinary recipes are unchanged.

## Evidence and remaining work

`verify-v02-preservation.mjs` checks ingredient/work tradeoffs, mass reconciliation, actual resident kitchen work and delivery, mid-carry reload, mixed fresh/preserved expiry, oldest-first use and cancellation. Its kitchen and utilities are a diagnostic fixture; it is not evidence of a viable new-game build sequence.

The three-day continuation of the genuine Day 61 village passed with construction complete and food/water/cash available. Report: `docs/balance/2026-11-17-preservation-soak.json`. Fixed-step equivalence checks passed through 1024× scheduling. The new recipe was selected and visually inspected in the in-app browser.

Kitchen [refrigeration](cold-storage.md) is now available. Temperature effects, crop-specific preservation and regional calibration remain outstanding. This increment does not complete the full realistic-economy plan.

## Automatic kitchen policy

The Food Almanac offers opt-in automatic cooking, initially off for new and existing saves. Defaults are one day of fresh meals and two days of provisions, with two portions per resident per day and targets from zero to seven days. Whole batches must fit the selected target. Kitchens with explicit repeating recipes remain under manual control.

Idle kitchens choose feasible fresh-meal recipes before provisions, using the earliest-expiring ingredients first. The planner protects one day of edible stock after reserving inputs, skips ingredients that expire before base processing completes, and checks storage space including unfinished output. Real delays can still spoil reserved ingredients; normal food storage rules handle that loss. Kitchens that are switched off do not receive automatic work.

`verify-v02-food-policy.mjs` checks scheduling, conflicting kitchens, reserve protection, expiry, storage, save validation and sandbox. `verify-v02-food-policy-soak.mjs` runs three days with a completed kitchen and finite supplied ingredients; it tests real cooking, accounting and reloads, not the affordability of building a kitchen from a new village.
