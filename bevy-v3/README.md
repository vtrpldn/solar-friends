# Solar Friends V3

Run the desktop preview from the repository root.

```sh
cargo run --locked --manifest-path bevy-v3/Cargo.toml
```

Pass `-- --play` to open the default Story plot directly.

Choose Story or Sandbox, a biome, landscape, water availability, resource richness, land seed, starting savings, supplies, and distance to town, then select **Enter village**. Pan with WASD, the arrow keys, or left drag. Rotate with Q/E or right drag. Zoom with the wheel or +/−, reset the camera with Home, and return to setup with Escape.

After the cars arrive, click the ground to place camp or select a preset with 1 (shade), 2 (entrance), or 3 (clearing). Press Space to pause or resume the village clock. After placing camp, press B to open the build catalog. Use Tab for categories and Page Up/Down to browse. Select a blueprint with its number key, R to rotate it, and click the plot to reserve materials and mark the site. Residents carry each reserved load to the site before assembly. The project model appears when they finish.

V3 runs as a standalone Bevy desktop application. The preview covers land generation, navigation, the opening camp, and construction, including orders and town pickup for missing materials. The V2 browser game remains available at `/v2/`.

Press F for the three-day forecast, P for power, V for water, and N to see what the residents are doing. Use O in the power panel to switch the grid connection, or J after selecting a powered building to switch it off or on. Use 1–4 to change simulation speed with the build menu closed. Press M to mute music and interface sounds.

With the build menu closed, click a natural resource and press G to assign it for gathering, extraction, or felling. Output enters inventory when the resident brings it back.

Click a completed workbench, workshop, or kitchen and press C to open its recipes. Residents bring inputs to the building and carry the finished batch back to stores.

Select a completed field, garden, or greenhouse and press K to manage its beds. Prepare the soil, sow a crop, and return to harvest when it is ripe. Bed settings cover crop, density, irrigation, and residues.

A completed coop or goat pen can store feed and drinking water, then produce eggs or milk. Residents take fodder to the animals when supplies are available. Select a pen and press C to see its care and collection options.

Story reserves cash for town pickup when a blueprint needs materials beyond current stock. Press U to toggle automatic ordering.

In Sandbox, materials are unlimited. Press I to toggle instant building.

In Story, press H for finances and paid town shifts. Book one day shift or turn on repeating weekday work for a selected resident. Wages reach village savings when the resident returns. Press Tab in Finances to open town trade, buy for pickup or freight, quote and reserve a sale, or set an automatic sale policy. Households can restock food automatically. Tab again to inspect food expiry and cold-storage use. Dried provisions keep longer, and powered cold storage slows aging for the food that fits.

Press L to advance between 1 and 365 days. Exact replay uses normal simulation steps. Fast approximate uses larger steps. Press L while advancing to stop at the time shown.

Press F5 to save the current village and F9 to reload it. Press F6 to name, load, rename, recover, or export villages. An active named village autosaves and retains its previous snapshot. Story and Sandbox have separate save files under `Solar Friends V3` in the local application data directory.

The opening models are embedded in the executable. To regenerate them after changing the source artwork, run `npm ci` and `node scripts/export-v3-opening-models.mjs` from the repository root.

Refresh the construction data with `node scripts/export-v3-catalog.mjs`.

Regenerate native trees, deposits, and scenery with `node scripts/export-v3-land-models.mjs`.

Regenerate the build catalog models with `node scripts/export-v3-building-models.mjs`.
