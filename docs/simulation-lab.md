---
description: Running farming experiments, inspecting simulation bottlenecks, and exporting or replaying high-speed lab evidence.
---
# High-speed simulation lab

Open `/v2/lab.html` on the local game server or a preview build. The lab uses the game simulation with 0.1-second ticks and an isolated save. Its controls issue ordinary game orders; they do not grant money, supplies, completed construction, or growth.

## Start and control a run

Choose a seed and expand **New-run world settings** to set biome, water abundance, terrain, resources, savings, supplies, and town distance. **New story run** applies these settings to a fresh paused village. Changing the selectors does not modify an existing world.

Choose a speed up to 1024×. The actual speed display reports CPU throughput. **Advance 1 hour** runs 1,334 ticks, rounding one game hour up to the next 0.1-second tick. **Run interval** accepts up to 365 game days and pauses at the requested tick. Both honor the selected pause condition: harvest ready, failed/expired crop, hydration below 20%, potable water below 0.5 L, or a job deferred for inaccessible work. Resuming while the condition remains true pauses again; choose another condition to continue.

## Test farming

1. Build a garden, greenhouse, or cultivated field. Fields have width and length controls in grid cells. Construction uses normal purchases and resident work.
2. Select the completed site. Choose one bed or **All beds**, then crop, density, irrigation policy, and residue policy.
3. Order **Prepare**, purchase seeds through **Resources & trade**, then order **Plant**. Bulk orders return a result for every bed. Accepted beds keep their orders if another bed is rejected.
4. Set **Pause when: Crop ready** and run an interval. This stops when the first bed ripens; other beds may still be growing. Harvest ready beds individually or continue until the remaining beds mature.
5. Use a kitchen's production controls to cook harvested ingredients. Consumption remains autonomous. Trade controls fetch supplies or sell an available sale batch.

Coops and goat pastures show health, feed, water, and collectible output. Their ordinary production and repeat controls collect output; care uses village supplies. Each resident has an outside-job toggle, with the contract and working conditions in its tooltip. This allows employment-heavy and farming-heavy comparisons without editing saves.

## Inspect a bottleneck

Expand **Simulation diagnostics & trends** for savings, potable water, lowest hydration, and food-ingredient charts. Current weather, shared source levels, income, expenses, spoilage, and inventory appear below. Filter jobs to waiting/deferred work or the selected site; **Inspect site** opens that site's orders and reserves. Residents show hunger, hydration, energy, current action, and reported need/employment blockers.

Hourly evidence includes individual needs/actions, inventory, financial categories, weather, hydrology accounting, bed moisture/damage/yield, animal reserves/output, and active jobs with assigned workers. Charts show the latest 240 sampled hours. Exports retain up to 2,160 hourly samples, approximately 90 days, and explicitly report how many older samples were omitted. The final state is exported in full.

## Save, branch, and replay

**Save lab** and automatic saves store a checkpoint in the lab's own local-storage key. **Load lab save** starts a new evidence segment from that checkpoint. **Import checkpoint** accepts a game save or the final state from a lab export. The game validates imported state before replacing the active run. These actions do not read or write normal-game save slots.

**Export evidence** downloads a version 2 JSON report containing the initial checkpoint, fixed-step count, all recorded game orders and results, retained hourly samples, recent lab events, and final state. Export before loading another checkpoint if the current history matters. Order history is bounded at 10,000 commands; the lab then requires an export and a new checkpoint segment before accepting more orders.

**Replay evidence** loads the initial checkpoint, reissues orders at their recorded tick, and pauses at the exported end tick. Orders are disabled during replay. A changed order result pauses with a divergence notice; completion compares the entire final state with the exported state. Engine changes can produce a mismatch. Keep the corresponding commit or preview URL with exported evidence when reporting a bug. Import the final checkpoint to branch into a new experiment.

Sandbox checkpoints retain sandbox supply and growth rules. Label sandbox or fixture runs separately from story-mode balance evidence. Successful subsystem or accelerated runs do not by themselves establish normal-speed playability.
