---
description: Remaining art, playtesting, performance, documentation and integration steps for the current Solar Friends build.
---

# Solar Friends finishing plan

## Why

Make the current village feel coherent, readable and dependable before expanding the game. The six simulation systems are implemented; this pass addresses visual quality, player experience and release confidence.

The starting point is the 32×32 map, energy-driven resident work, starter shed and storage, and the painted shed replacement. The [simulation plan](simulator-plan.md) and [Story plan](story-plan.md) retain the delivered feature scope. Their earlier progress notes are historical.

## Contents

- [Order and evidence](#order-and-evidence)
- [1. Finish the artwork review](#1-finish-the-artwork-review)
- [2. Play the first hour of Story](#2-play-the-first-hour-of-story)
- [3. Validate sustained performance](#3-validate-sustained-performance)
- [4. Reconcile documentation](#4-reconcile-documentation)
- [5. Integrate and check the final build](#5-integrate-and-check-the-final-build)
- [Completion checklist](#completion-checklist)

## Order and evidence

Complete the visual review first, then play Story with the corrected assets. Run sustained performance checks after the resulting fixes. Documentation can proceed alongside these stages; integration follows their acceptance checks.

Before starting, record the commit, build identity, current browser, viewport and test saves. Preserve the player's saves and use protected scenes or separate test saves. Every finding records its reproduction, expected behavior, observed behavior, severity and evidence. Mark it fixed only after checking the changed build.

Keep screenshots, recordings, measurements and the finding list together under `artifacts/finishing/`; retain a compact durable result record and selected images under `.github/finishing-review/`. Update this checklist as each stage finishes. Existing test reports remain evidence for their recorded builds, not automatic proof of later changes.

## 1. Finish the artwork review

Review the active art against the existing illustrated houses and residents. An installed asset or an earlier agent-written acceptance record does not establish that its style is right.

- [x] Inventory all active building variants and their associated props, crops and resident interactions from the runtime registries. Keep rejected candidates clearly separated in the art tools.
- [x] Compare each building at normal and close gameplay zoom beside a resident, an established home and an adjacent road. Check doors, headroom, seats, worktops, tools, roof tiles and vegetation as well as overall size.
- [x] Inspect actual roof, wall, frame and furniture geometry. Include structural edges that were not used to calibrate the sprite. Check upright posts, centered gables, consistent overhangs and supported furniture.
- [x] Inspect ground contact, road joins, placement ghosts, selection, construction, working and removal states where applicable. Include crop growth and resident carrying/working poses around the changed assets.
- [x] Check day/night continuity and powered/unpowered lighting. Repair source artwork only where a visible defect is identified, then recheck the installed result in the village.

Acceptance: every active building has recorded style, geometry, proportions, ground-contact and applicable state findings; no unresolved visible distortion, floating contact, clipped silhouette or material-style mismatch remains. Preserve the painted treatment and requested subject. No local sprite warps or added platforms to conceal errors. Mechanical grid checks support the visual review but cannot replace it, and passing them does not justify calling painted geometry mathematically perfect.

Use the existing [artwork inspector](web/artwork/projection.html), [catalog](web/artwork/catalog.js), [projection checks](scripts/verify-building-projection.mjs), [sprite-fit checks](scripts/verify-sprite-grid-fit.mjs) and [browser checks](scripts/verify-isometric-browser.mjs). Extend a tool only when a concrete review gap requires it. Refresh source fingerprints after reviewing the exact delivered pixels.

## 2. Play the first hour of Story

Start a fresh Story village through the normal menu and play for one real hour, including reading and decision time. Use ordinary player controls and the available speed controls. Keep debugging tools for observation and reproduction; progression must use earned resources and resident work.

- [x] Check the arrival with shed and storage, the first quest explanation, the first purchase or local collection decision, construction and early food/water management.
- [x] Record the next goal and its explanation at 5, 15, 30 and 60 minutes. Note confusing terminology, repeated menu searching, unexplained waiting, overwhelming choices and periods without a useful decision.
- [x] Observe energy-driven work, meals, rest, shelter use and outside jobs. Confirm that the interface explains interruptions without implying the removed community work schedule still exists.
- [x] Exercise an accepted request for help and observe acceptance, movement, useful progress and completion. Check a declined or unavailable request for a clear explanation.
- [x] Save, return to the menu and continue once. Confirm the village, current work and chosen mode survive correctly.
- [x] Fix reproduced pacing or feedback problems in small increments, then replay the affected section from its checkpoint.

If a relevant action is unavailable during the first hour, test it afterward from an earned checkpoint and label that evidence separately. Include one local-production versus purchase choice, one recoverable shortage and one layout improvement; compare the expected cost/time benefit with what residents actually do.

Acceptance: the first hour has no reproducible progression blocker; each observed wait or refusal has an understandable cause and a usable next action. At least one resource or layout choice produces a visible consequence. The playtest report includes the tester's pacing judgment and unresolved minor issues separately from automated campaign results. Exact quest timings are observations, not a reason to force every player through the same schedule.


The awake [first-hour record](.github/finishing-review/story-awake-session.json) reached chapter eight with seven chapters earned. The six reproduced clarity findings are fixed and covered by live rechecks, native tests and the complete desktop browser flow; see the [recheck record](.github/finishing-review/polish-rechecks.json).

## 3. Validate sustained performance

Measure the actual desktop browser used to play the game. The existing [performance report](.github/isometric-performance/scene-performance.json) covers 120 frames per scene in software-rendered Chromium, so it does not establish sustained smoothness in that browser.

- [x] Record hardware, browser, viewport, render backend, build, selected speed and whether automatic acceleration is active.
- [x] Run a continuous 30–60 minute session with normal play, a dense supported village, rain, night lighting, and 1×, 8× and 16× operation. Density means buildings, crops, resource piles and concurrent jobs with the supported resident population.
- [x] Pan and zoom, open ordinary game panels, queue construction and hauling, change a utility and save/reload. Distinguish initial loading and deliberate pauses from stalls during active play.
- [x] Record real frame intervals, simulation work, rendering work and input response in five-minute windows. Track resource/cache use across repeated scene and zoom changes to detect growth rather than treating a single high sample as a leak.
- [x] Reproduce the largest stalls, identify their cause and fix the measured bottleneck. Recheck material, liquid and energy accounting if an optimization changes simulation behavior.

Proposed desktop targets: normal 1× play should approach the display's refresh rate, with a 95th-percentile frame interval at or below 33 ms; dense rain/night or fast-forward should remain at or below 50 ms. Investigate unexplained pauses above 100 ms and visible input lag. Record target misses honestly rather than lowering targets to match a run.

Acceptance: no crash, growing backlog, recurring input stall or unbounded resource growth during the session; report all scenarios and their measured limits. The [sprite cache](web/paint-cache.js) stays within its defined budget. Preserve exact simulation progress at higher speed. Recheck [live-edit recovery](scripts/check-iteration.mjs) only if the development loop changes.

The [thirty-minute baseline](.github/finishing-review/dense-performance-baseline.json) meets the frame targets in all six windows, but records recurring fast-forward simulation stalls. The cable-anchor geometry bottleneck has a focused fix and exact [simulation parity evidence](.github/finishing-review/cable-anchor-parity.json); the [focused browser recheck](.github/finishing-review/dense-performance-recheck.json) meets the target and does not repeat those simulation stalls. Initial loading and isolated long frames remain explicitly recorded.

## 4. Reconcile documentation

- [x] Update the [README](README.md) to the 32×32 map, starter shed/storage, current save behavior, energy-driven work and current development commands.
- [x] Remove obsolete claims that production, utilities or the six simulation stages are still unfinished. Preserve older reports as clearly dated history and link to current results.
- [x] Reconcile [construction](plan.md), [resident autonomy](resident-autonomy-plan.md), [farming](farming-plan.md) and [playtest](playtest.md) descriptions that still mention removed work windows or missing features already delivered.
- [x] Reconcile [future ideas](IDEAS.md) with shipped behavior. Keep genuinely new features outside this finishing checklist.

Acceptance: current-facing documentation matches source and observed behavior, local links resolve, and readers can distinguish delivered mechanics, remaining finishing work and optional future ideas. Documentation-only changes need content and link checks; they do not justify repeating long simulation campaigns.

## 5. Integrate and check the final build

- [x] Inspect the complete parent-branch chain before integration. At planning time, [PR #66](https://github.com/vtrpldn/solar-friends/pull/66) depends on [PR #65](https://github.com/vtrpldn/solar-friends/pull/65), which itself targets the Story planning branch. Resolve the full dependency order and any conflicts without dropping earlier work.
- [x] Run the relevant checks after each fix. Once the final candidate is stable, run `npm run dev:check` for formatting, native tests, lint, build, script checks, gameplay/art verifiers and desktop regressions. Tie results to the exact candidate commit.
- [x] Inspect hosted requirements and record blocked jobs accurately. The current branch endpoint reports no protection and no required checks. Actions jobs cannot start because of account billing/spending; account-owner resolution and a hosted rerun remain pending. Required blocked checks would prevent integration; the current optional block must be disclosed and explicitly accepted in the individual merge decision. No protection or billing settings were changed.
- [x] Refresh PR descriptions and include the visual and performance evidence needed for review. Keep each PR unmerged until it receives individual, explicit user approval.
- [x] After approved integration, launch the final branch and check New Game, Continue, Sandbox, save/reload, one construction/request interaction and the active artwork preview. Confirm that the served build is the integrated one.

Acceptance: approved changes reach the intended branch in dependency order, required checks pass on the final candidate, and the integrated game passes the launch checks. Record local readiness and any external check limitation separately. A required hosted check that cannot run keeps integration incomplete.

## Completion checklist

- [x] Artwork review complete; source identities and visual findings recorded.
- [x] Manual first-hour Story playtest complete; blocking and material pacing/clarity defects fixed and rechecked.
- [x] Sustained desktop performance measured; remaining limitations documented.
- [x] Current documentation reconciled with the game.
- [x] Final checks complete and individually approved PRs integrated.
- [x] Integrated build launched and checked, with a concise completion report linking the evidence.

This plan adds no new simulation systems. Housing assignment, additional upgrades, new buildings and other expansion ideas remain separate future work. Finishing the current pass does not authorize merging any PR.

The final [local validation](.github/finishing-review/validation-final.json) passed all 268 checks, including 513 native tests and the complete desktop browser flow, on candidate `81fdb3f`. The user subsequently approved each of PRs #33–#63 and #65–#67 with the hosted-check limitation explicitly accepted. All 34 are merged; the integrated file tree exactly matches the validated candidate. The [integrated launch record](.github/finishing-review/integration-final.json) covers New Story, Continue, separate Sandbox saves, construction/request completion and the 27-variant artwork preview. PR #64 remains untouched as agreed.
