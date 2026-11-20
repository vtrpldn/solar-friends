# Round 4 Handoff — Neon (`neon/residents-guide-setup`)

## Summary of changes

All three Round 4 tasks are complete and committed in incremental steps on `neon/residents-guide-setup`:

1. **View & options popover (`cb49847b`)**
   - Added `src/village/view_options.rs`: a compact V2-style paper popover (`312px` wide, `GlobalZIndex(12)`) anchored directly above the dock's `"View & options"` button (horizontally aligned to the button's right edge relative to the dock, vertically 12px above the dock, with clean layout fallbacks).
   - Popover contents:
     - Camera controls row: `?` (opens Keyboard & camera guide), `Q`, `E`, `−`, `+`.
     - Location & grid row: `Camp`, `River bend`, `Grid` (active toggle styling when grid overlay is enabled).
     - Camera helpers row: `Whole plot`, `Reset camera`.
     - Session row: `New village` (saves session and opens land setup via `WorldSetup::open_new_village`), `Main menu` (saves session and opens the title screen via `WorldSetup::open_main_menu`), followed by `Saved villages`.
     - `Copy bug report` button with a one-line explanation and inline copy-status feedback.
     - `SOUND` section with `Music` and `Interaction sounds` sliders rendered as rounded meters (`TRACK`/`LEAF`) with percentage readouts, `−` / `+` 5% steppers, clickable/draggable meter tracks (via `SoundSettings::set_volume`), and mute hint.
   - Removed the old right-column View & options buttons (`Camera`, `CameraControls`, `GridOverlay`, `Diagnostics`, `Setup`, and the column copies of `Forecast`, `Library`, `Sound`) from `PanelMenu` in `src/village/toolbar.rs`, keeping `interact_with_button` working with `"View & options"` and updating `src/main.rs` integration test button labels.

2. **Projects card (`3f5003c0`)**
   - Added structured project list accessors in `src/construction/project_list.rs` (`ProjectRow`, `ProjectsView`, `project_list_view`, `project_page_models`) and `recent_event_lines` in `src/construction/events.rs`.
   - Added `src/village/projects_card.rs`: a single compact V2-style floating paper card (`"VILLAGE WORK · Your projects"`, `316px` wide, `left: 22px`, `top: TOP_BAR_CLEARANCE`, bounded above the dock with mouse-wheel scrolling and a circular `×` close button).
   - Card contents:
     - Optional reserved-freight notice inset.
     - Underway project rows with live 3D building thumbnails (reusing `thumbnails.rs` slots `0..8` while Projects is open), name, priority tag, phase badge, rounded progress bar, and crew/delivery status.
     - Optional collapsible `"Roads · N tiles · M ready"` toggle row when roads exist.
     - Collapsible `"Around the village · N built"` section listing completed project rows with small thumbnail, name, and green `✓` (or operational blocker text).
     - In-card paging (`‹  page / pages  ›`) when projects span multiple pages.
     - Collapsible `"Recent events"` section with up to 8 recent village events.
   - Hid `VillageHud` and `almanac.rs` headers while `projects_card` is visible, removed `project_row` string rewriting from `src/village.rs`, and removed all duplicate `Action::Project*`, `Page`, and `ClosePanel` buttons for Projects from `PanelMenu` in `src/village/toolbar.rs`.

3. **Removed legacy duplicates for Terrain, Map lenses, and Advance days (`d415a938`)**
   - **Terrain**: removed `Action::TerrainBrush`, `Action::TerrainRadius`, `Action::PickFlattenHeight`, `Action::UndoTerrain`, and `Action::RedoTerrain` from `PanelMenu`; removed the dock's `"Finish terrain"` label swap (the dock button now stays `"Terrain"` with active highlight when open, and the rest of the dock remains usable while terrain tools are open, closing terrain tools if another dock button is pressed).
   - **Map lenses**: removed `Action::Lens`, `Action::LensPage` (`"Other lenses"`), and `Action::ClearLens` from `PanelMenu`; `LensCard` remains the sole lens picker and `Action::LensFilter`/`Action::LensSite` stay on the dock for active filter/facility stepping.
   - **Advance days**: removed right-column adjust/fast/start `Action::Advance` buttons from `PanelMenu` (keeping only top-bar `Action::Advance` `"Advance days"`), suppressed `VillageHud` while `AdvanceDialog` is open, and replaced the legacy `advance.status(...)` HUD line (which appended `· L Advance days`) with only the plain post-run `advance.result()` notice.
   - Moved `terrain_card::input`, `lens_card::input`, and `advance_modal::input` to `.after(read_camp_pointer).before(village_input)` so clicks take effect before `village_input`, `advance_days`, `autosave_continue`, and `toolbar::refresh` on the same frame.
   - Updated `src/main.rs` integration tests to click lenses directly in `LensCard` (without `"Other lenses"`) and advance controls directly in `AdvanceDialog` (`"+7"`, `"Advance time"`, `"Stop advance"`).

## Verification

- `cargo fmt` clean.
- `cargo build` succeeded.
- `cargo clippy --all-targets -- -D warnings`: clean (0 warnings).
- `cargo test --bin solar-friends-v3`: all **350 tests passed**, including `every_character_in_game_text_exists_in_the_ui_font`, `bevy_update_enters_a_village_and_places_a_camp`, and new unit tests in `view_options.rs` and `projects_card.rs`.

## What could not be verified

- Live visual inspection in a running browser/desktop window (e.g., exact pixel alignment of the View & options popover above a wrapped dock on narrow viewports, and visual thumbnail framing at 36×30 inside project rows).

## Open questions / Notes for coordinator

- **Sound settings overlay on Title screen**: `audio.rs`'s `VolumePanel` and the dock's `Close sound settings` / volume buttons remain wired for `sound.open` (still reachable from the Title screen's `"Sound settings"` button and `Shift+F1`), while in-village sound sliders live directly inside the `"View & options"` popover.
- **Map lens dock filter/facility buttons**: `Previous filter` / `Next filter` and `Previous facility` / `Next facility` remain in the dock when a filterable or network lens is active, matching existing gameplay and tests.
