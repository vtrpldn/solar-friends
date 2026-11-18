# Solar Friends V3

Run the desktop preview from the repository root.

```sh
cargo run --locked --manifest-path bevy-v3/Cargo.toml
```

Choose a biome, landscape, water availability, and land seed, then select **Enter village**. Pan with WASD, the arrow keys, or left drag. Rotate with Q/E or right drag. Zoom with the wheel or +/−, reset the camera with Home, and return to setup with Escape.

After the cars arrive, choose the camp with 1 (shade), 2 (entrance), or 3 (clearing). Press Space to pause or resume the village clock.

V3 runs as a standalone Bevy desktop application. The preview covers land generation, navigation, and the opening camp. The V2 browser game remains available at `/v2/`.

The opening models are embedded in the executable. To regenerate them after changing the source artwork, run `npm ci` and `node scripts/export-v3-opening-models.mjs` from the repository root.
