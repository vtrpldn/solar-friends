# Solar Friends V3

Run the desktop preview from the repository root.

```sh
cargo run --locked --manifest-path bevy-v3/Cargo.toml
```

Choose a biome, landscape, water availability, land seed, starting savings, and supplies, then select **Enter village**. Pan with WASD, the arrow keys, or left drag. Rotate with Q/E or right drag. Zoom with the wheel or +/−, reset the camera with Home, and return to setup with Escape.

After the cars arrive, click the ground to place camp or select a preset with 1 (shade), 2 (entrance), or 3 (clearing). Press Space to pause or resume the village clock. After placing camp, press B to choose a camp-essential blueprint, R to rotate it, and click the plot to reserve materials and mark the site. Residents carry each reserved load to the site before assembly. The project model appears when they finish.

V3 runs as a standalone Bevy desktop application. The preview covers land generation, navigation, the opening camp, and construction with materials already in stock. The V2 browser game remains available at `/v2/`.

Use 1–4 to change simulation speed with the build menu closed. Press M to mute music and interface sounds.

Press F5 to save the current village and F9 to reload it. The native save lives in the operating system's local application data directory under `Solar Friends V3/village.json`.

The opening models are embedded in the executable. To regenerate them after changing the source artwork, run `npm ci` and `node scripts/export-v3-opening-models.mjs` from the repository root.

Refresh the construction data with `node scripts/export-v3-catalog.mjs`.
