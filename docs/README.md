# Documentation index

Updated 2026-11-09.

## Why

Separate current gameplay and operational guidance from historical plans and dated evidence. v1 is preserved; v2 is the active implementation. Source directory names still use `v02`, but browser routes use `/v2/`.

## Current guides

- [Project setup, routes, checks and deployment](../README.md)
- [v2 gameplay, economy, residents and infrastructure](../web/v02/weekend/README.md)
- [3D collection](../web/v02/library/README.md)
- [Model workshop](../web/v02/workshop/README.md)
- [Editable asset garden](../web/v02/land/README.md): 64×64 cells, separate from the playable 128×128 map.
- [Resident animation rehearsals](../web/v02/residents/README.md)
- [Deferred gameplay ideas](gameplay-ideas.md): proposals, not promises or implemented mechanics.

## Recent evidence

- [16× playtest observations](playtests/2026-11-08-story-16x.md): original findings; see subsequent fixes.
- [Save, water, power and planning fixes](playtests/2026-11-08-fixes.md)
- [All 68 buildable types through regular gameplay](playtests/2026-11-08-regular-catalog.md): accelerated lab UI, normal purchases, production and resident work.
- [Surplus policies, work priorities and income balance](balance/2026-11-08-economy.md): theoretical chain comparison plus automated three-day replay from the genuine Day 61 save.
- Responsive UI shipped in commit `0f0408d7`: browser checks at 800×600, 1000×750 and 1280×720; production stylesheet matched the tested build. This is desktop-window evidence, not mobile/touch validation.

Evidence is tied to the documented build and scenario. Historical successes do not establish current universal coverage or player enjoyment.

## Historical reference

[V1.md](../V1.md) preserves the former root README. Root `*-plan.md` files, `plan.md`, `playtest.md` and `IDEAS.md` describe the v1 exploration, its plans or deferred work. The map/scenario builder and resident-creator planning history must not be interpreted as current v2 feature commitments; the resident creator was dropped.

The [first-evening opening](v02/first-evening-opening.md) and [early interaction audit](v02/building-interaction-audit.md) record earlier v2 iterations. The playable guide supersedes their onboarding and catalog descriptions. Dated reports and saved evidence remain intact rather than being rewritten to imply newer tests were performed.
