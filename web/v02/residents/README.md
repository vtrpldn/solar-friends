# Resident animation and interaction rehearsals

## Why

Props need believable human use before v0.2 simulation is built. These rehearsals establish shared scale, articulated motion, approach routes and contact positions without importing v0.1 behavior.

The land preview renders all six resident studies as jointed models in the existing palette. Idle breathing, walking, sitting, hammock rest, crouched gardening, watering, work, hand washing and carrying use procedural poses with blended joints. The collection, workshop and land preview share these resident models. The resident lineup at `/v02/residents/` compares all six identities and poses. Iara has a braid and overalls; Bento has short curls, a beard and vest; Luz has a bun, terracotta headband and apron; Cauã has a narrow hat with a teal band and vest; Nina has two high hair puffs and overalls. They retain shared joint lengths, human scale and matte materials, with an 800-triangle visible geometry ceiling.

Select a supported prop, choose a resident and interaction, then **Send resident** to walk from their placed position. **Preview nearby** starts a short approach beside the prop for inspection. Supported props: garden bench, shed, picnic table, hammock, garden, seedling bench, workshop, kitchen, outdoor wash station and produce crates. Joined gardens expose only outer edges. The navigation grid avoids occupied footprints and other residents; blocked approaches report a reason.

One rehearsal runs at a time. A new rehearsal or Stop restores the previous resident's authored placement. Editing the scene cancels rehearsals before rebuilding models. Animation can be paused and suspends while the tab is hidden. Rehearsal positions, cargo and progress are transient; saves retain the authored placement records. Carrying picks up a demonstration crate and walks back to the start, without changing inventories or consuming the stock prop.

`rig.js` owns articulated models and poses; `interactions.js` owns rotated contact/approach positions and grid routing; `director.js` owns walk, enter, action and carry-return transitions. `verify-v02-residents.mjs` covers all actions at four rotations, geometry, blocked routes, connected garden access, carrying and reset.

Browser review covered bench sitting, hammock rest, garden watering/crouching, workshop hand placement, wash-station use, crate pickup/return and pause. Screenshots are under `assets/art-direction/v02/resident-*.png`. The 44 rotated action checks are automated geometry/state checks, not 44 separate visual approvals. Autonomous scheduling, multi-resident task assignment and resource effects remain future simulation work.
