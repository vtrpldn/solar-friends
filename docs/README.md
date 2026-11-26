# Documentation index

Updated 2026-11-17.

## Why

Separate current gameplay and operational guidance from historical plans and dated evidence. v2 is the only implementation; the original v1 exploration and its plans were removed from the repository and remain in git history. Source directory names still use `v02`, but browser routes use `/v2/`.

## Current guides

- [Autonomy mechanics implementation plan](autonomy-implementation-plan.md)

- [Project setup, routes, checks and deployment](../README.md)
- [High-speed simulation lab](simulation-lab.md): farming controls, breakpoints, telemetry, checkpoints and deterministic replay.
- [v2 gameplay, economy, residents and infrastructure](../web/v02/weekend/README.md)
- [3D collection](../web/v02/library/README.md)
- [Model workshop](../web/v02/workshop/README.md)
- [Editable asset garden](../web/v02/land/README.md): 64×64 cells, separate from the playable 128×128 map.
- [Resident animation rehearsals](../web/v02/residents/README.md)
- [Neighbours, mutirões, courses and festas](village-life.md)
- [Deferred gameplay ideas](gameplay-ideas.md): proposals, not promises or implemented mechanics.

## Active plans

- [Realistic v2 economy](realistic-economy-plan.md): phased accounting, construction, physical trade, farming, utilities, upkeep and balance work. Implementation and local calibration are complete within the documented boundaries; production deployment remains separate.

- [Calibration and price provenance](economy-calibration.md)
- [Calibration validation and evidence](balance/2026-11-17-economy-validation.md): 18 starts, three income continuations, all 68 buildings constructed, off-grid continuation and 87 focused regressions.
- [Full parameter register](economy-parameter-register.json)
- [Simulation realism validation](balance/2026-11-17-simulation-realism.md): 30-day ordinary starts, seasonal subsystem checks, and desktop interaction evidence.
- [Weather and watershed](simulation-climate.md): INMET station references, deterministic forecasts, shared water reserves, and disclosed model assumptions.
- [Material accounting](material-accounting.md), [biological cycles](economy-biology.md) and [logistics/care](economy-logistics-and-care.md)

## Recent evidence

- [16× playtest observations](playtests/2026-11-08-story-16x.md): original findings; see subsequent fixes.
- [Save, water, power and planning fixes](playtests/2026-11-08-fixes.md)
- [All 68 buildable types through regular gameplay](playtests/2026-11-08-regular-catalog.md): accelerated lab UI, normal purchases, production and resident work.
- [Surplus policies, work priorities and income balance](balance/2026-11-08-economy.md): theoretical chain comparison plus automated three-day replay from the genuine Day 61 save.
- Responsive UI shipped in commit `0f0408d7`: browser checks at 800×600, 1000×750 and 1280×720; production stylesheet matched the tested build. This is desktop-window evidence, not mobile/touch validation.

Evidence is tied to the documented build and scenario. Historical successes do not establish current universal coverage or player enjoyment.

## Historical reference

The [first-evening opening](v02/first-evening-opening.md) and [early interaction audit](v02/building-interaction-audit.md) record earlier v2 iterations. The current game supersedes their onboarding and catalog descriptions. Dated reports and saved evidence remain intact rather than being rewritten to imply newer tests were performed.
