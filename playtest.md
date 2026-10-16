---
description: Gameplay and artwork playtest coverage, reproduced issues, fixes and evidence from 2026-10-08.
---

# Gameplay and artwork playtest

## Why

A passing simulation suite can miss a confusing player flow, a broken control after cancellation, or an unreachable work destination. This pass exercised the shipped game through its controls and compared its artwork at the scale used in play.

## Coverage

The first browser playthrough began with the real fresh-arrival state. I placed the cistern, two homes, garden and kitchen through the toolbar, combined their supplies in Town, received the delivery, and reached shelter, a harvest and cooked meals. I then built a food forest, hosted a welcome supper with actual attendance and contributed to the tool library. All four quests completed by game day five in that parallel-build playthrough. Dev Tools advanced time; it did not grant quest completion or bypass the controls.

The revised build was checked again for the first-project supply blocker, keyboard pause/resume, the project-to-Town shortcut, active supper feedback, cancellation, imported checkpoints and material collection. Earned checkpoints came from that browser playthrough and the public game API.

Established and concern scenarios provided staged coverage of greenhouse crop changes and paused replanting, named building visits, chicken care, pantry conservation, workshop controls, a protected day off, nighttime power switches and rooftop lighting. These fixtures are not evidence that those buildings were earned in the browser playthrough.

The artwork pass covered 75 entries across 47 source images, including 303 live-checked cells, all four house variations, 60 crop/structure/light combinations and the resident poses. House/resident proportions and day/night scenes were reviewed visually. Architecture checks retain the documented maximum painted-edge drift of 1.23 pixels at zoom 1; exact plot edges and roads use the shared grid geometry.

## Reproduced issues and fixes

| Finding | Resulting change | Evidence |
| --- | --- | --- |
| Cancelling an early blueprint relabelled a greenhouse as a solar farm; another cancellation crashed Power with an undefined building lookup. | Lighting controls resolve persistent building identities rather than array positions. | Browser reproduction and replay; public-API cancellation regression. |
| The tutorial removed its Plan action after placement without offering a useful next step. | Goals link to construction, missing supplies or a completed building. Project supply buttons open a combined Town quote. | The revised cistern flow named its missing pump and quoted R$ 220 including delivery. |
| A new ready project waited while builders finished long walks during work hours. | Available work can wake autonomous hobbies during normal work blocks, preserving meals, rest, social needs and agreements. | The revised first cistern foundation finished within the first work hour; work-hour regression. |
| Routine food jobs could indefinitely postpone making workshop tools. | Bento gets a tool-making turn; local collection allows timber for one eight-unit maintenance batch. Conservation stops that demand. | The complete quest/reward playthrough now crafts tools; bounded maintenance tests. |
| The welcome-supper button still offered hosting while the gathering was running. | Both goal actions show an underway state, attendance and time remaining. | Real hosting and attendance controls; underway screenshot. |
| Removing an earlier home changed a later home's artwork. | Newly placed homes persist their assigned variation; ghosts use the next variation. | Cancellation and reload regressions. |
| Resource props were much darker at night than unlit buildings. | Props share the unlit brightness/saturation rule; the calibration bench uses that rule too. | Day/night world review and shared-rendering check. |
| Resource workers could be sent to the riverbank; preparation offsets could enter a neighbouring building. | Workspots validate land, actual tile plots and personal space. Building approaches also use actual plot boundaries. | Cauã's old destination (24, 0.70) was outside the allowed land; the corrected destination (20.52, 1.48) was reachable. In the browser, the earth deposit fell from 140 to 136. |
| Collection used a hammer pose for earth and stone. | Earth/stone collection uses the existing digging pose; farm shifts use the tending pose. Paused Dev Tools advances show the current task pose. | Animation regression and material-worker scene. |
| Project refreshes lost button focus; zoom had an invisible range; the sandbox badge covered the goal card. | Focus survives project updates, zoom stops at its visible limit, and the badge sits below the goal tracker. The dock is more compact and keeps horizontal access when needed. | Keyboard pause/resume, desktop zoom regression and browser layout checks. |
| An exported sandbox could not be replayed without importing into the saved village. | Dev Tools imports validated checkpoints into a protected sandbox; malformed files leave the current scene intact. | Earned checkpoint replay and rejected empty checkpoint, with the scene clock unchanged. |

## Validation

- PASS: 74 Rust tests, formatting, clippy and the release WebAssembly build.
- PASS: JavaScript syntax and all 15 verification scripts, including the new playtest regressions.
- PASS: 24 game days each of funded, empty-fund and depleted properties. All three projects completed, saves round-tripped, funds/storage stayed valid, and every resident retained at least 58% waking leisure. Peak hunger in those scenarios stayed below 48.
- PASS: 14-day arrival, relaxed, hungry and surplus scenarios retained at least 56% waking leisure. The deliberately hungry fixture recovered without crossing the suite's starvation threshold.
- PASS: 75 artwork entries / 303 cells / zero live crop failures; reviewed source hashes and architectural projection checks.
- PASS: final material-worker browser replay produced actual collection with no observed runtime errors or warnings. Earlier intentionally reproduced failures are kept separately in the evidence.

The local report and screenshots are in `artifacts/playtest-2026-10-08/`; Dev Tools opens the current report from `web/dev-report/`. These generated folders are ignored by Git. Browser testing used the in-app browser manually; the separate Playwright runner was not executed. The UI review also consulted the [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md), with desktop game scope taking precedence.

## Scope limits

This covers every shipped building kind and major mechanic in bounded playthroughs and scenarios, not every possible layout or a full-year economy. This is historical evidence for the build tested then. Later builds added obstacle routing and resident demolition, salvage and relocation work; those changes need their own matching-build evidence. No phone layouts or device-specific checks were added.
