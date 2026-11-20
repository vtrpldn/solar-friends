# Handoff — Neon (`neon/residents-guide-setup`)

## What changed

1. **Residents detail** (`src/village/resident_meters.rs`, `src/construction/resident_work.rs`, `src/village.rs` Residents arm of `show_hud`, `src/theme.rs`):
   - Added a selected-resident header at the top of the Residents sheet showing the resident's portrait (`resident_portraits/*.png` at 4:3 inside a sage-tinted rounded frame), name, role, and traits across all four profile tabs (`Overview`, `Story`, `Skills`, `Relationships`).
   - Added V2's sage inset activity note (`RIGHT NOW` + current action, active project, and any need blockage) above rounded, color-coded need meters (`Energy`, `Food`, `Water`, `Bladder`, `Bowels`, `Hygiene`, `Social`, `Fun`) on the Overview tab.
   - Restructured `resident_overview`, `resident_story`, `resident_skills`, and `resident_relationships` into short titled sections matching V2 (`Paid town work`, `Home`, `On my mind`, `A personal hope`, `About <name>`, `Craft skills`, `Friendships`, `Recent memories`, `Growing together`), removing the duplicate plain-text `Needs` line from the Overview sheet while keeping full text output in `resident_status` for diagnostics, lab, and unit tests.

2. **Village guide styling** (`src/village/guide.rs`, `src/theme.rs`):
   - Replaced the floating guide text card and separate right-hand button strip with a V2-inspired titled paper sheet (`LEARN THE VILLAGE` / `Village guide`, `Paused while you read`, mode switch, and `×` close button) positioned cleanly between the top bar and the dock.
   - Built a two-column guide layout: a sage topic/chapter sidebar (`GUIDE_NAV`) with search (`/`), chapter index, previous/next pagination, and active highlighting on the left; and a scrollable article pane on the right with structured headings, V2's sage-bordered `MORE AUTONOMY` tip block, a `REFERENCE FIGURES` card, muted boundary notes, and inline diagram viewport + zoom controls (`Fit to window`, `Zoom in`, `Zoom out`, zoom readout).

3. **Setup screen** (`src/setup.rs`, `src/village/library_ui.rs`, `src/main.rs`):
   - Combined the land options and plot preview onto one centered paper sheet (`YOUR VILLAGE` / `Choose the land`) matching V2's dialog layout, while preserving the frameless title screen backdrop and menu.
   - Replaced the `"Option · Value"` cycling buttons with game-style picker rows: small uppercase caption (`STARTING POINT`, `BIOME`, `LANDSCAPE`, `WATER`, `RESOURCES`, `SAVINGS`, `SUPPLIES`, `TOWN`, `LAND SEED`), clickable value button, and `‹` / `›` step buttons, plus hover/press painting via `theme::paint_button`.
   - Ordered `SetupRefreshSet` after `village_input` in `library_ui::install` so returning from `Saved villages` updates `SetupPanel` visibility deterministically in the same frame.
   - Updated the four setup picker button labels in `src/main.rs`'s UI integration test (`Drive`, `Remote`, `Nearby`, seed value).

4. **Browser saves (`wasm32`)** (`src/save.rs`, `src/save_library.rs`, `src/setup.rs`, `src/village/library_ui.rs`, `Cargo.toml`):
   - Enabled `web-sys`'s `Storage` feature under `[target.'cfg(target_arch = "wasm32")'.dependencies]`.
   - Implemented `localStorage`-backed storage in `save.rs` under `target_arch = "wasm32"` (`location`, `atomic_write`, `read_bytes`, `exists`, `snapshot`, `remove_file`, `list_slot_ids`) while keeping native filesystem behavior unchanged.
   - Updated `save_library.rs`, `setup.rs`, and `village/library_ui.rs` to use `save::exists`, `save::snapshot`, `save::remove_file`, and `save::list_slot_ids`, and hid native-only Export/Import/file-drop prompts on `wasm32`.

## Verification

- `cargo fmt`
- `cargo test --bin solar-friends-v3` (336 tests passing, including `every_character_in_game_text_exists_in_the_ui_font` and `bevy_update_enters_a_village_and_places_a_camp`)
- `cargo clippy --all-targets -- -D warnings` (clean)
- `cargo build --target wasm32-unknown-unknown` (clean, zero warnings)

## What could not be verified

- Visual rendering in a desktop window or WebGPU browser (`bevy-v3/web/dist`) was not run interactively in this headless environment; layout spacing and runtime browser `localStorage` persistence should be visually and manually spot-checked in the coordinator's browser review.

## Open questions / notes

- In `src/save.rs` on `wasm32`, browser `localStorage` typically caps total storage per origin around 5–10 MB. A single village save + autosave + a couple of named slots should fit comfortably, and quota errors now return a readable `"browser storage is full or unavailable"` error; if many large named villages are expected on the web, IndexedDB could be considered later.
- On `wasm32`, native file-dialog Export/Import buttons are hidden in `library_ui.rs` because `file_dialog.rs` returns `None` on the web. Browser download/upload for save export/import can be added separately if desired.
