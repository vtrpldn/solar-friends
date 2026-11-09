---
description: Outcome-based Story progression with linear introductions, optional building paths and evidence from real village play.
---

# Story planning outcomes

> Historical v1 plan or exploration record. Retained for implementation history; unchecked items are not the active v2 roadmap and described mechanics may differ from v2. See [current documentation](README.md) and the [documentation index](docs/README.md).

## Why

Story should teach a working village rather than require a collection of every building. Keep thirteen linear chapters and their unlocks, but let players choose farming, construction methods and service layouts.

- [x] Unify food readiness with the real eater: ingredients, meals, milk and honey; exclude committed cooking inputs, cargo and inaccessible stock from observed pantry achievements. Requests and pantry feedback use the same food kinds.
- [x] Record quarter-hour observations of useful pantry reserves, dry-period reserves, local services and powered evenings. Preserve current and best durations in saves; queries never advance them. Observe actual resident needs and a complete day with majority village leisure.
- [x] Credit short completed construction deliveries and actual housing expenditure. Keep net external spending distinct from outside income, refunds and owned starting materials. Budget challenges remain optional and earlier valid work counts.
- [x] Rewrite required objectives around shelter, food, shared life, supplying projects, improved soil, varied production, working energy/water cycles, housing and sustained care. Retain linear introductions to all mechanics and buildings as actionable optional journal choices.
- [x] Keep optional choices separate from chapter completion and the main goal tracker. Explain current conditions, measured time, alternatives and next steps in the existing illustrated journal.
- [x] Verify competing food claims, routes, unmet needs, observations, spending/refunds, interruptions and exact continuation. Complete a fresh campaign through real purchases, work and player commands without building every type; retain a complete optional-path replay.
- [x] Review desktop controls and artwork, then record measured pacing for the first fifteen minutes and first week. Preserve Story/Sandbox and protected-scene isolation.

Observation intervals are game balance rules. A successful period requires qualifying consecutive observations; gaps cannot manufacture credit. A lapse resets the current period, while the best earned period remains. Food access and actual hunger are separate checks. Housing budgets measure net external spending while a second or later home is built; salaries and sales cannot hide those purchases. An over-budget optional challenge never blocks the campaign.

This continues Stage 7 of [the simulator plan](simulator-plan.md). The final paired housing comparison covers layouts, work preferences and material methods after the first nine earned Story chapters. Its result is recorded in `artifacts/housing-balance/report.json`.

The matching local release passes 507 native tests, strict all-target lint, formatting, the WebAssembly build, 175 current script syntax checks, all 67 public gameplay/art verifiers and the complete desktop suite: 200 captures without browser errors. The native engine is `2f62e43`, its WebAssembly hash begins `de542a74`, and the final presentation is `ec282d4`. Full identities, execution phases and all 44 accepted simulator requirements are in [.github/story-review/results.json](.github/story-review/results.json) and [the acceptance audit](.github/story-review/acceptance.json).

A fresh minimal campaign finishes thirteen chapters on day 38 using twelve building types, leaving nine optional types unbuilt. The complete optional route finishes on day 92 with all twenty-one types and all 47 measurable optional lessons; seven other entries are reference guides. Both routes use real purchases, resident work, care and gatherings, with exact chapter checkpoints. At the scripted first fifteen minutes at the 1× clock rate, the well is complete and the first home is half built. By the first week, the introductory chapter, shelter and core food buildings are complete. These serial choices exclude reading time and automatic acceleration.

Five independent copies of one earned one-home village complete occupied housing, paid resident service installation and at least fourteen operating days including seven dry days. All pass healthy needs, majority waking village leisure, 249 exact checkpoints and material, liquid and energy accounts. The distant home recovers through actual resident relocation and replacement services. Locally made roofing supports an adobe home for R$912.86 of external housing spending versus R$989.84 for bought parts, taking 7.04 versus 4.06 game days. A further 84 seasonal days completes seven paid-part service jobs with 8–61 edible portions and at least 68% waking village leisure per resident. Both paid 24-day manual/connected utility comparisons preserve useful production, healthy needs and all physical accounts.

The completion audit corrected immediate-save ownership when a town pickup interrupts water or material carriage. Eight pending/carried scenarios and the battery-carrier refusal cover the handoff. An exact normal-step/selected-16× comparison preserves deliveries, wages, completed construction, consumption and full snapshots over 5,120 native steps. A stale utility verifier excluded milk and honey: the reproduced low-basic-food moment held four milk and nine honey, and a real meal request claimed milk. The corrected comparison was replayed from earned installation checkpoints. Valid unchanged-engine phases retain explicit provenance, all current scripts were parsed again, and the complete desktop suite was rerun after correcting journal-header clipping. Native PNG export and protected-save isolation pass.

All local acceptance work is complete. GitHub's hosted job could not start because of account billing/spending limits. PR #63 remains a draft and has not been merged.
