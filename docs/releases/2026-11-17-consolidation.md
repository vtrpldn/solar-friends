# Active-chat consolidation — 17 November 2026

## Why

Publish the completed active Solar Friends work together, resolve overlapping mechanics and interfaces, and retain evidence before cleaning up source checkouts.

Included branch tips:

- `codex/basic-needs-status` — `d9a2ab40`: Guide, charts and compact needs indicators.
- `codex/simulation-realism` — `78b81922`: seasonal weather, watershed reserves, individual hydration, animal care, crop failure and removal of generic repeating jobs.
- `codex/food-management` — `8fe2f238`: Food Almanac, expiry-aware reserves, optional kitchen policies and volume-based cooling.
- `codex/shared-meals` — `7d305380`: shared meals in the Rust/v1 simulation.
- `codex/crafting-workflow` — `4257fde2`: Make / Repair / Jobs desktop workflows.
- `codex/farming-field-models` — `f7148c59`: field and coop models, whole-field controls and utility lenses.
- `codex/auto-speed-64x` — `aa576217`: automatic speed, resident selection/animation, bug reports and calendar/weather controls.

Integration decisions:

- Generic repeat jobs stay removed. Separate opt-in Food Almanac kitchen policies remain available.
- The clock reads the actual simulated weather instead of the earlier display-only temperature estimate.
- The needs summary uses individual hydration demand and eligible potable water, excluding animal tanks; thirsty residents override an apparently adequate village total.
- Whole-field management retains failed/expired crop handling, with individual bed inspection available.
- Guide content describes these implemented flows. The existing biogas cooking fallback is documented accurately; it is not an electricity generator or bounded gas network.
- The compact status UI stays inside existing counters. Guide/Lenses controls clear the expanded clock.

Validation, deployment identity and the requested timed sessions will be recorded after their actual completion. The one-hour playtest starts only after production identity is confirmed; the separate performance hour starts after that playtest.

Integration regressions found and corrected before publication:

- Static resident catalog previews now discard the hidden chopping axe, just as they already discard cargo and watering cans. The existing geometry budget and chopping animation tests pass without relaxing their limits.
- Expired-crop browser inspection now enters the individual-bed view introduced by whole-field management. The full field placement/configuration/reload check passes after that adjustment.

Prepublication validation completed 1,474 runner commands, including a Rust test command with 795 passing tests, Rust lint, JavaScript syntax and 161 v2 verification scripts. Five checks initially failed: one real catalog geometry regression and four assertions tied to superseded UI/weather/soil behavior. All five were corrected and rerun; the initial report is retained as evidence rather than relabeled green. Three 30-day ordinary-command village scenarios and the nine-environment seasonal diagnostic passed.

The consolidated release was verified live as `71bf72cd` at 18:34 UTC. Eight other completed Solar Friends chats were archived, including three newer chats that appeared during the playtest; their completed UI and road fixes were reconciled into the follow-up release. See [playtest and performance evidence](2026-11-17-playtest-performance.md).
