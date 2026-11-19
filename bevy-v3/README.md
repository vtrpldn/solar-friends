# Solar Friends V3

Run the desktop preview from the repository root.

```sh
cargo run --locked --manifest-path bevy-v3/Cargo.toml
```

Pass `-- --play` to open the default Story plot directly.

Choose Story or Sandbox, a biome, landscape, water availability, resource richness, land seed, starting savings, supplies, and distance to town, then select **Enter village**. Pan with WASD, the arrow keys, or left drag. Hold Shift to pan faster. Rotate with Q/E or right drag horizontally, and right drag vertically to tilt. Zoom with the wheel, middle drag, or +/−. Press Home to center on camp, Shift+Home to reset the camera, Shift+End to frame the whole plot, and Escape to return to setup.

After the cars arrive, click the ground to place camp or select a preset with 1 (shade), 2 (entrance), or 3 (clearing). Press Space to pause or resume the village clock. After placing camp, press B to open the build catalog. Use Tab for categories and Page Up/Down to browse. Select a blueprint with its number key, R to rotate it, and click the plot to reserve materials and mark the site. The placement outline follows the model and changes color when the site or supply plan is blocked. Residents carry each reserved load to the site before assembly. The project model appears when they finish. Press Ctrl+D or Command+D on a selected project to place another copy of its blueprint. Select a project to prioritize or cancel an unstarted plan, or to queue relocation, salvage, or demolition.

V3 runs as a standalone Bevy desktop application. The preview covers land generation, navigation, the opening camp, and construction, including orders and town pickup for missing materials. The V2 browser game remains available at `/v2/`.

Press F for the three-day forecast, P for power, V for water, and N to see what the residents are doing. Use O in the power panel to switch the grid connection, or J after selecting a powered building to switch it off or on. Use 1–4 to change simulation speed with the build menu closed. Open Sound settings from setup or press Shift+F1. Choose Music or Interaction sounds with Up/Down, adjust by 1% with Left/Right, or hold Shift to adjust by 5%. Press M in the sound panel to mute the selected channel.

With the build menu closed, click a natural resource and press G to assign it for gathering, extraction, or felling. Output enters inventory when the resident brings it back.

The clock switches to 64× while all five residents are asleep or away in town. It returns to your selected speed as soon as one is available.

Click a completed workbench, workshop, or kitchen and press C to open its recipes. Residents bring inputs to the building and carry the finished batch back to stores.

Select a completed field, garden, or greenhouse and press K to manage its beds. Prepare the soil, sow a crop, and return to harvest when it is ripe. Bed settings cover crop, density, irrigation, and residues.

A completed coop or goat pen can store feed and drinking water, then produce eggs or milk. Residents take fodder to the animals when supplies are available. Select a pen and press C to see its care and collection options.

Story reserves cash for town pickup when a blueprint needs materials beyond current stock. Press U to toggle automatic ordering.

Sandbox skips the arrival and pitches camp in the clearing when it is free. If the clearing is occupied, choose your campsite immediately. Materials are unlimited. Press I to toggle instant building.

In Story, press H for finances and paid town shifts. Book one day shift or turn on repeating weekday work for a selected resident. Wages reach village savings when the resident returns. Press Tab in Finances to open town trade, buy for pickup or freight, quote and reserve a sale, or set an automatic sale policy. Households can restock food automatically. Tab again to inspect food expiry and cold-storage use. Dried provisions keep longer, and powered cold storage slows aging for the food that fits.

Press **F** or choose **Find in village** to center the camera on the selected project. **Alt+F** opens the forecast while a project is selected.

Press L to advance between 1 and 365 days. Use Alt+L when L controls sanitation or cold storage. Exact replay uses normal simulation steps. Fast approximate uses larger steps. Press L while advancing to stop at the time shown.

With the Flatten terrain tool open, press **P** or choose **Pick a new flatten height**. The next click samples a grade for subsequent strokes.

Choose Cultivated field in the build menu. Use brackets to change its width, Shift with brackets for depth, and R to rotate. To resize a field already on the map, select it, open Beds with K, and use the same bracket controls. Existing beds stay anchored to their ground.

Press F7 in Story to see maintenance jobs and inspect a completed building. Press T to toggle automatic maintenance or use brackets to adjust the daily parts allowance.

Residents share equipment from storage. Tools wear as residents use them. Select a timber workbench and open Recipes with C to schedule a repair. Use Page Up or Page Down to browse its recipes. Crafting requires a resident with the right skill and usable shared tools. The Residents panel shows skill levels.

Select a kitchen with cold storage and press L to switch cooling. A kitchen can cook with stored biogas when electrical power is unavailable.

Select a completed home and open Recipes with C to install a rooftop panel and battery. Residents bring the parts from storage and install them on site.

Press P or V to see the automatic power and water networks. Dark lines indicate inactive connections. The power network draws grid power at camp when enabled. In Water, click a facility as the destination or press C for camp. Shift-click a source to carry between reservoirs. The panel also queues river collection, hand purification, and waste service, and toggles automatic drinking reserves and sanitation.

Choose Village road in the build menu to pause for road planning. Click the first tile, then Shift-click to preview and place a connected route. Press Z to undo the last stroke or Esc to finish planning and let residents build the road.

Press N to view residents and assign beds. Pick a resident with 1–5, click a completed home, then press T to assign it or Y to clear the assignment. Residents prefer their assigned home and can use spare beds or the camp tents when needed. The selected resident shows recent memories, friendships, and their building aspiration. Idle residents use outdoor walks, sheltered reading, exercise spaces, and fireside gatherings as the village grows.

Press F4 after pitching camp to edit terrain. Use 1–4 for Raise, Lower, Flatten, or Smooth. Use brackets to change the brush radius, then click the terrain. Flatten keeps the height of the first click until you reselect it. Press Z to undo an edit. Your edits are saved with the village. New building plans and completed moves grade their footprint. Foundations stay in the terrain after a project moves or is removed.

Use **Copy bug report** in View & options to copy the current village and simulation diagnostics. If the clipboard is unavailable, the game saves the report locally. **Shift+F5** exports the file directly.

Press F5 to save the current village and F9 to reload it. Press F6 to name, load, rename, recover, or export villages. Drop an exported V3 save or lab checkpoint onto the game window while the library is open to import it as a new named village. An active named village autosaves and retains its previous snapshot. Story and Sandbox have separate save files under `Solar Friends V3` in the local application data directory.

Use **Tab** or the mode button in Saved villages to browse the other mode. Loading a village switches the game to that village's mode.

The opening models are embedded in the executable. To regenerate them after changing the source artwork, run `npm ci` and `node scripts/export-v3-opening-models.mjs` from the repository root.

Refresh the construction data with `node scripts/export-v3-catalog.mjs`.

In the in-game reference, open a chapter and press **D** or select **Show diagram**. The diagrams are embedded in the executable. To regenerate them from V2's guide artwork, run `npx playwright install chromium` and `node scripts/export-v3-guide-diagrams.mjs` after installing the repository's npm dependencies.

Regenerate native trees, deposits, and scenery with `node scripts/export-v3-land-models.mjs`.

Regenerate the build catalog models with `node scripts/export-v3-building-models.mjs`.

## macOS desktop bundle

The Bevy desktop CI job extracts the macOS app archive, runs and replays a village scenario with the packaged executable, then uploads the archive. Unzip it and open **Solar Friends V3.app**.

To package a local build from the repository root:

```sh
cargo build --locked --manifest-path bevy-v3/Cargo.toml
bash scripts/package-bevy-macos.sh bevy-v3/target/debug/solar-friends-v3 dist/solar-friends-v3-macos.zip
```

## Simulation lab

Run a headless scenario through the same 0.1-second simulation steps as the desktop game.

```sh
cargo run --locked --manifest-path bevy-v3/Cargo.toml -- --lab scenario.json > report.json
```

Pass a V3 save path after the scenario path to start from that village. With no save path, the lab starts from the default Story camp. The JSON report includes sampled resident activity and supplies, each order's result, and the final village state.

To start from another plot, include a `setup` object in the scenario and omit the save path. Use a nonzero 32-bit `seed` and the following indices:

| Setting | 0 | 1 | 2 |
| --- | --- | --- | --- |
| `biome` | Mata Atlântica | Cerrado | Caatinga |
| `landscape` | Gentle | Rolling | Rugged |
| `water` | Dry | Seasonal | Abundant |
| `resources` | Sparse | Balanced | Rich |
| `savings` | Tight | Modest | Comfortable |
| `supplies` | Essentials | Camp | Prepared |
| `town` | Nearby | Drive | Remote |

`mode` defaults to `"Story"` and also accepts `"Sandbox"`. `resources` and `town` default to 1.

An example scenario with one construction order:

```json
{
  "steps": 1200,
  "orders": [
    {"step": 0, "order": {"type": "build", "key": "gathering", "x": 40, "z": 36}}
  ]
}
```

Order types include `build`, `move`, `salvage`, `demolish`, `produce`, `move-craft`, `buy`, `sell`, `bed`, `configure-bed`, `outside`, `food-policy`, `grid`, `collect-water`, `purify`, and `service-water`. Project, bed, and resident numbers start at 1. Use site 0 for the camp water facility. For `move-craft`, supply the source project as `site` and the target project as `destination`. Build and move coordinates use map cells, rotation takes 0–3 quarter turns, and fields accept a `size` pair in cells.

Use `{"type":"install-connection","from":1,"to":2,"channel":1}` to queue a manual irrigation line between completed sites. Water channels run from 0 for drinking water through 3 for sewage. Omit `channel` to install a power line. The lab uses the same resident work and material requirements as the desktop game. Use `switch-connection` with the same endpoints and `"enabled":false` to close a line, or `remove-connection` to cancel a queued installation or remove an installed manual line.

Use `{"type":"supply-transport","freight":true}` to select supplier freight for automatic construction purchases, seed orders, and pantry restocks. Set `freight` to `false` to prefer resident pickup.

Set `"stop"` in the scenario to `"harvest"`, `"crop-failed"`, `"hydration"`, `"water"`, or `"blocked"` to stop at that condition. The blocked condition detects resident jobs waiting for a navigable route. The report includes the actual end step and a final sample.

`{"type":"carry-water","source":1,"site":0,"channel":"irrigation"}` queues a resident to carry water from project 1 to the camp reservoir. Channels are `drinking`, `irrigation`, `greywater`, and `sewage`.

In Sandbox, use `{"type":"instant-build","enabled":false}` to queue new buildings for resident construction. Set `enabled` to `true` to make subsequent placements instant.

Use `{"type":"building-power","site":1,"enabled":false}` to switch off a completed facility with a power switch. Set `enabled` to `true` to reopen it.

Use `{"type":"assign-home","resident":1,"home":1}` to assign a resident to a completed home with a free bed. Omit `home` to clear the assignment.

Use `{"type":"copy","site":1,"x":49,"z":36}` to place another copy of a blueprint with the source project's rotation and field dimensions. Use `{"type":"resize-field","site":1,"size":[4,3]}` to resize a field using its unrotated width and depth.

Use `{"type":"terrain-stroke","brush":"raise","points":[[40,24],[42,24]]}` to shape terrain. Supply 1–256 brush samples as world coordinates in meters. Brushes are `raise`, `lower`, `flatten`, and `smooth`. Flatten samples the grade at the first point. The same terrain protections apply as in the desktop editor. Use `{"type":"terrain-reset"}` to restore the original heights.

`{"type":"road","start":[44,36],"end":[46,37]}` plans a connected route in one order. Residents still haul materials and build each tile.

`{"type":"work-priority","group":"construction","level":3}` sets a priority from 0 (low) to 3 (highest). Groups are `essentials`, `maintenance`, `production`, and `construction`. Use `{"type":"worker-reservations","essentials":1,"production":2}` to reserve workers, up to five in total.

`{"type":"sale-policy","material":"wood","enabled":true,"reserve":24,"trigger":24,"limit":12}` enables automatic sales above 24 units of wood, keeps 24 in reserve, and limits sales to 12 units per day. Set `limit` to 0 for no player-set daily cap.

`{"type":"food-policy","enabled":true,"reserve_half_days":3,"allowance_cents":15000}` enables pantry restocking with a 1.5-day reserve and a R$150.00 daily budget. Each optional setting keeps its current value when omitted.

Verify a lab report with `cargo run --locked --manifest-path bevy-v3/Cargo.toml -- --lab-replay report.json`. The verifier replays the bundled starting village and orders and exits with an error if the results diverge. Use `--lab-replay-ui report.json` to step through the same report in the desktop lab and see the verification result at the end.

Use `--lab-ui` to start a paused, isolated Story lab run with a 365-day limit. Press **F7** to start a new Story lab run with a chosen seed, biome, landscape, water, resources, savings, supplies, and town access. Pass `scenario.json [village.json]` after the flag to open a scripted run. Press **Space** to run or pause, **J** for one simulation step, or **1–9** to choose a speed from 1× through 1024×. The lab reports achieved speed and indicates when CPU time limits playback. Press **F2** to cycle preset intervals, **Shift+F2** to enter a custom duration of up to 365 days, **F3** to run it, or **Shift+J** to advance one game hour. Intervals stop at the scenario limit or its configured stop condition. Press **F4** to choose an additional pause condition while playing a scenario.

In the native lab, press **O** to enter a JSON order at the current step and **F5** to export a report through the current step. Press **F6** to save to the isolated lab slot, **F9** to load it, or **Shift+F6** to export a separate checkpoint. Drop a checkpoint onto the lab window and press **F8** to open it as a fresh run with the saved village and clock. Drop an exported lab report and confirm to open its replay in the same window. The command window pauses the scenario while you type.

In the lab map, drag to pan, scroll to zoom, and press **Home** to focus camp. Use **Page Up/Down** to browse village sites. Press **/** to find a blueprint by name, then **Enter** to select it for placement. Select a completed production site to choose a recipe and queue a batch. With camp selected, use **U** for grid power and **F** for Story food restocking. Use **Tab** to reach **Resources & trade** for town purchases, sale quotes, and shared pickup, **Residents** for needs and town work, or **Simulation trends** and review savings, clean water, lowest resident hydration, and food ingredients over the latest 240 hourly samples. The lab retains up to 90 game days of hourly trend history.

Press **F8** twice to reload the scenario file and any starting checkpoint. This starts a new run at step 0, so export the current report or save a checkpoint first if you want to keep it.

## Model workshop

Pass `--workshop` to inspect the full bundled V2 asset collection. Use **←/→** to browse, **/** to find an asset by name, **V** to compare the reference assets together, **Q/E** to orbit, **↑/↓** to tilt, **R** to rotate the model, **+/−** to zoom, **N** to change lighting, **G** to toggle the grid and footprint guides, and **Home** to reset the view.

Drag to orbit, right-drag to pan, and scroll to zoom. Press **H** to show a resident beside the model for scale, and **M** to switch between original materials, clay, and wireframe. Press **T** to remove the roof from models with an authored interior. Sprite sheets always include the roof.

Press **F5** to export the current workshop view as a PNG without the controls overlay. A JSON sidecar records the model, footprint, lighting, and camera settings. The workshop shows the saved path. Press **F6** for a transparent four-view sheet and placement JSON with fixed camera and anchors. Press **F7** to preview the same sprite sheet inside the Workshop. Press **F8** in the model view to export the selected asset as a standalone GLB.

### Asset Garden

Pass `--asset-garden` to open the native flat V2 gallery. For a separate layout, pass a V2 scene JSON path as the next argument. The controls overlay lists selection, placement, rotation, undo, and save shortcuts. The default gallery autosaves in the app’s local data folder. Drop a V2 scene JSON file into the window to import it. Press **Ctrl/Cmd+S** to save a scene opened by path or export the default gallery as `solar-friends-v02-scene.json` in the current directory.

Press **B** to switch between the flat gallery, Mata Atlântica, Cerrado, and Caatinga. Press **L** to load the selected biome’s V2 landscape. Undo restores the previous props, and the scene file records the selected biome.

Adjacent garden, orchard, and solar farm sections show their connected area when selected. Sections stay individually editable, and connected solar farms share one inverter.

Select a prop with a resident interaction. Press **I** to choose a resident, **O** to change the action, **U** to send the resident from their placed location, or **Y** to rehearse nearby. **P** pauses or resumes the animation, and **Esc** returns the resident to their original pose and position.

Press **/** to search the catalog by model name, key, or category. **Enter** focuses an existing prop or starts placement for a model missing from the scene. Use the mouse or arrow keys to position a placement preview, then click or press **Enter** to confirm. For exact placement, select a prop, press **F2**, and enter its one-based column and row.

Press **N** for the night view, or start with `--asset-garden --night` followed by an optional scene path.

### Resident lineup

Pass `--residents` to view the six resident rigs and V2’s 31 poses. Pass a pose name as the next argument to start with it. Use **Up/Down** to select a pose, **V** to switch between front, side, and back, and **N** to change the light. Press **Space** to freeze, **Left/Right** to scrub, or **Home** to reset time. Hold **Shift** while scrubbing to step by half a second.

The game menu opens the 3D inspector, Asset Garden, biome landscapes, and resident animations in separate windows. You can also pass `--biome-landscapes` to start a Mata Atlântica study with its own scene. Export that scene with **Ctrl/Cmd+S** to keep your changes.

### Collection

Open **Collection** from the game menu or pass `--collection`. Browse all 370 V2 models, filter by category, rotate the previews, or enlarge small props. Click a model card to open it in the inspector.

In the Asset Garden, **Home** focuses the house or first placed prop. **End** frames the entire plot.
