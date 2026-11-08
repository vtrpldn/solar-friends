# Our first weekend

A standalone v0.2 playable at `/v02/weekend/`. It uses the shared 3D catalog and resident rigs, but no v0.1 simulation code or saves.

## Why

Test a short loop of choosing a campsite, placing practical projects, watching friends carry and build, and improving the arrangement. The first evening is available after a gathering place and one practical improvement; there is no multi-day unlock gate. This is a compact first playable, not yet a 20–30 minute campaign.

Choose one of three camps, select a project, then click a clear grid square. Project buttons in the journal open priority and relocation controls. Drag to orbit, right-drag to pan, scroll to zoom. Pause and 4× speed are available. The evening button ends construction for this session; New weekend asks before replacing its save.

- Five autonomous friends share work, carry materials, recover energy and use an installed tank for washing breaks.
- Resources are reserved at planning time. Work access is protected during placement and relocation. Two friends can work on each project.
- An entrance camp needs a runoff decision during the shower. Other sites drain well. Raising supplies consumes timber; moving them is free.
- Town trips cost R$45, take 55 active simulation seconds, and bring 12 timber. Reloading preserves the remaining trip time without paying twice.
- Meals, drinking water and tents cover initial essentials. Detailed consumption, sanitation processing, overnight sleep, tool inventory, terrain excavation and a second day are not simulated here. The temporary toilet contributes to the evening outcome.
- Time pauses in hidden tabs. Saves use `solar-friends-v02-first-weekend-1` in local storage. The restart action never touches other modes.

`simulation.js` contains serializable state and rules. `game.js` renders the scene and UI. Run `node scripts/verify-v02-weekend.mjs` from the repository root for deterministic playthroughs and regression checks.
