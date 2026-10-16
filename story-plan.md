---
description: Outcome-based Story progression with linear introductions, optional building paths and evidence from real village play.
---

# Story planning outcomes

## Why

Story should teach a working village rather than require a collection of every building. Keep thirteen linear chapters and their unlocks, but let players choose farming, construction methods and service layouts.

- [x] Unify food readiness with the real eater: ingredients, meals, milk and honey; exclude committed cooking inputs, cargo and inaccessible stock from observed pantry achievements. Requests and pantry feedback use the same food kinds.
- [x] Record quarter-hour observations of useful pantry reserves, dry-period reserves, local services and powered evenings. Preserve current and best durations in saves; queries never advance them. Observe actual resident needs and a complete day with majority village leisure.
- [x] Credit short completed construction deliveries and actual housing expenditure. Keep net external spending distinct from outside income, refunds and owned starting materials. Budget challenges remain optional and earlier valid work counts.
- [x] Rewrite required objectives around shelter, food, shared life, supplying projects, improved soil, varied production, working energy/water cycles, housing and sustained care. Retain linear introductions to all mechanics and buildings as actionable optional journal choices.
- [x] Keep optional choices separate from chapter completion and the main goal tracker. Explain current conditions, measured time, alternatives and next steps in the existing illustrated journal.
- [ ] Verify competing food claims, routes, unmet needs, observations, spending/refunds, interruptions and exact continuation. Complete a fresh campaign through real purchases, work and player commands without building every type; retain a complete optional-path replay.
- [ ] Review desktop controls and artwork, then record measured pacing for the first fifteen minutes and first week. Preserve Story/Sandbox and protected-scene isolation.

Observation intervals are game balance rules. A successful period requires qualifying consecutive observations; gaps cannot manufacture credit. A lapse resets the current period, while the best earned period remains. Food access and actual hunger are separate checks. Housing budgets measure net external spending while a second or later home is built; salaries and sales cannot hide those purchases. An over-budget optional challenge never blocks the campaign.

This continues Stage 7 of [the simulator plan](simulator-plan.md). The final paired housing comparison covers layouts, work preferences and material methods after the first nine earned Story chapters. Its result is recorded in `artifacts/housing-balance/report.json`.

The first integrated pass completes a fresh minimal campaign on day 38 without nine optional building types, and a full optional-path campaign on day 92 with all twenty-one types and all 47 measurable optional lessons. Seven additional entries are reference guides. The five-way housing comparison passes paid resident installation, dry-period operation, relocation recovery, 249 exact checkpoints and all physical accounts, with more than 62% waking village leisure per resident. Another 84 days passes two seasonal cycles, seven paid-part service jobs, healthy food and at least 68% waking village leisure. Desktop journal checks pass at 1600 and 1280 pixels. These runs used the engine before the pickup handoff correction.

The completion audit found that a town pickup could retain a resident's previous water or material trip until the next tick, making an immediate save invalid. The command now releases that ownership immediately and preserves carried goods in their recovery location; battery carriers finish their handoff before driving. Eight new pickup scenarios and the existing battery-carrier check cover the correction. All 507 native tests and strict all-target lint pass. A normal-step versus selected-16× replay produces exact matching deliveries, wages, completed construction, consumption and saves over 5,120 native steps. The complete release check is running again on the corrected engine before final campaign, seasonal and desktop results are recorded.
