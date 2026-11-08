# Resident animation and interaction rehearsals

## Why

Props need believable human use before v0.2 simulation is built. These rehearsals establish shared scale, articulated motion, approach routes and contact positions without importing v0.1 behavior.

The land preview renders all six resident studies as jointed models in the existing palette. Idle breathing, walking, sitting, hammock rest, crouched gardening, watering, work, hand washing and carrying use procedural poses with blended joints. The static collection/workshop models and optional reference sprite exports remain unchanged.

Select a supported prop, choose a resident and interaction, then **Send resident** to walk from their placed position. **Preview nearby** starts a short approach beside the prop for inspection. Supported props: garden bench, shed, picnic table, hammock, garden, seedling bench, workshop, kitchen, outdoor wash station and produce crates. Joined gardens expose only outer edges. The navigation grid avoids occupied footprints and other residents; blocked approaches report a reason.

One rehearsal runs at a time. A new rehearsal or Stop restores the previous resident's authored placement. Editing the scene cancels rehearsals before rebuilding models. Animation can be paused and suspends while the tab is hidden. Rehearsal positions, cargo and progress are transient; saves retain the authored placement records. Carrying picks up a demonstration crate and walks back to the start, without changing inventories or consuming the stock prop.

`rig.js` owns articulated models and poses; `interactions.js` owns rotated contact/approach positions and grid routing; `director.js` owns walk, enter, action and carry-return transitions. `verify-v02-residents.mjs` covers all actions at four rotations, geometry, blocked routes, connected garden access, carrying and reset.
