---
description: Independent saved Sandbox construction, living-land and utility constraints, with comfortable defaults and protected previews.
---

# Sandbox simulation options

## Why

Players need to compare village layouts and resource choices without replaying Story unlocks. Free placement remains the default. Optional constraints use the same resident work, accounts and needs as Story.

- [x] Add saved, independent construction/supplies, living-land and utility options. Story keeps all three constraints; Sandbox starts with all three off.
- [x] Construction and supplies: new projects require delivered materials and resident labour; funds, food, tools and planting stock stop replenishing. Food keeps its real dates. Existing buildings, orders and ongoing work retain their ownership when options change.
- [x] Living land: soil suitability, moisture and finite deposits affect growth and extraction when enabled. Turning it off preserves existing soil and deposit history while providing neutral growth and non-depleting extraction; enabling it resumes from the preserved state.
- [x] Utilities: the enabled rule requires local water, separate waste handling and connected electrical supply. The comfortable rule supplies local fresh water, handles buffer overflow and provides explicit free operating power without changing owned battery energy or paid lines.
- [x] Expose the options in the game settings with their current effects. Use normal saves and Continue sandbox; changes in protected scenes never affect the saved village. Artwork scenes explicitly select the constraints they demonstrate.
- [x] Verify option independence, real construction/hauling and shortages, stock dates, land persistence, utility consumption and exact saved continuation. Review desktop controls and art in the running game.

Changes do not grant Story progress or retroactively charge free buildings. Pending resident work is retained when an option is disabled. Free operating power is reported separately from physical battery generation and consumption. Seasons, equipment wear, resident learning and supplier variation keep their existing independent options.

This is Stage 7 of [the simulator plan](simulator-plan.md). Outcome-based Story teaching and the paired housing-expansion balance remain required after these options.

The native core passes 478 tests and strict all-target lint. Eleven regressions cover real material trips and building, paused projects, original food dates, preserved land reserves, comfortable power, independent water/pantry rules, orders, invalid imports and exact continuation for every rule combination. The compiled replay also compares a full Story day with the supplier release and follows actual extraction under both land choices. Five focused desktop captures cover Settings, Continue sandbox, real map placement, preserved projects, Construction access and protected night power. All 60 public verifiers in this increment and 166 JavaScript syntax checks pass. The complete desktop walkthrough passes 196 captures with no browser errors, including keyboard controls, existing artwork tools and protected save isolation.

A further seven-day Sandbox replay enables all three physical constraints on the protected starter layout. Residents finish the workshop, retain 2–100 sampled owned portions of the four directly edible food kinds, keep hunger below 34 and energy above 73, and spend at least 53% of waking village time on leisure. A real R$67 order arrives and the resulting R$99,933 fund stays unchanged, proving that the constrained fund is not replenished. Eight exact checkpoints and material, four-liquid and electrical accounts pass. This week uses familiar weather and disabled equipment wear; those options remain separate.

The full campaign, seasonal and utility comparisons were not repeated for this Sandbox increment. The one-day comparison confirms unchanged Story village and resident state on the matching supplier release. Their earlier long-run evidence remains in [.github/suppliers-review/results.json](.github/suppliers-review/results.json). The current build and measured scope are recorded in [.github/sandbox-review/results.json](.github/sandbox-review/results.json). Hosted CI cannot start because of GitHub account billing limits; PR #62 remains draft and unmerged. Outcome-based Story and the integrated paired housing comparison remain required.
