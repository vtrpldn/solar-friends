# Round 3 Handoff — Neon (`neon/residents-guide-setup`)

## Summary of changes

All four assigned screens have been rebuilt as self-contained V2-style widget modules with their own button components, refresh systems, and input systems, and their duplicated text has been removed from `show_hud` in `src/village.rs`:

1. **Residents dialog (`src/village/resident_meters.rs`, `src/construction/resident_work.rs`, `src/village.rs`, `src/main.rs`)**
   - Placed the 5-resident roster cards (portrait, name, current activity, lowest need with severity colour) inside the Residents sheet on the left, beside the selected resident's detail column.
   - Added portrait header action buttons inside the sheet: `"Find in village"` (disabled while away for paid work) and `"View project · <name>"` (visible when the resident has an active project).
   - Added segmented profile tabs (`Overview`, `Story`, `Skills`, `Relationships`) with V2 active-button styling.
   - Built widgets for all four tabs:
     - **Overview**: activity inset (`RIGHT NOW`), paid-work card (`Book one day shift` / `Cancel day shift` + active-styled `Repeat weekday shifts` toggle, hidden in Sandbox), home assignment `‹ home ›` stepper with housemate note, 8 rounded need meters, village work priorities & worker reservation `‹ ›` steppers (`Food & water`, `Maintenance`, `Production`, `Construction`, and essential/production worker reservations), plus structured `ON MY MIND`, `A PERSONAL HOPE`, `ABOUT`, and `RECENT MEMORIES` sections.
     - **Story**: 7 captioned backstory/motivation/growth sections.
     - **Skills**: `Specialties · 25% faster` pill chips, `Learning by doing` rounded progress bar, and craft skill cards (`Woodworking`, `Basketry`, `Repair`).
     - **Relationships**: 4 partner rows with portrait thumbnails, friendship labels/scores, progress bars, and shared memories.
   - Removed the duplicated Residents text from `show_hud`. Updated one assertion in `src/main.rs` (`"Click home"` -> `"Complete a house to assign a permanent home."`) to reflect the home stepper widget.

2. **Terrain card "Shape the land" (`src/village/terrain_card.rs`, `src/terrain.rs`, `src/village.rs`)**
   - Added a compact floating paper card at the top-left under the stat cards (`left: 22px`, `top: TOP_BAR_CLEARANCE`, `width: 280px`) while `village.terrain_editor.open` is true.
   - Includes `‹ ›` steppers for Tool (`Raise`, `Lower`, `Flatten`, `Smooth`) and Brush radius (`Small · 2 cells`, `Medium · 4 cells`, `Large · 6 cells`), flatten grade/sculpting hint inset, `"Pick a new flatten height"` (shown on Flatten), `"Undo terrain edit"` and `"Redo"` with hover disabled-reason messages, protection note, and circular close `×` button.
   - Added read-only accessors on `TerrainEditor` (`brush`, `radius`, `flatten_level`, `status`) and `Brush::ALL`/`Brush::label`; removed dead `TerrainEditor::label()` and the terrain instructions block from `show_hud` (while offsetting any ground elevation hover readout right of the card).

3. **Map lenses card (`src/village/lens_card.rs`, `src/village/lens_picker.rs`, `src/village.rs`)**
   - Added the `"READ THE LAND · Map lenses"` card at top-right under the Guide/Lenses buttons (`right: 22px`, `top: 142px`, `width: 304px`) while `village.lenses.open` is true.
   - Renders all 13 map lenses from `LensPicker::all_choices()` plus a `Normal view` / `Clear lens` slot in a two-column grid with active highlighting and a circular close `×` button.
   - Removed the numbered lens list text from `show_hud` and removed unused `LensPicker::text()`. Active lens legends continue to display normally once a lens is selected.

4. **Advance days modal (`src/village/advance_modal.rs`, `src/time_advance.rs`, `src/village.rs`)**
   - Added a centered modal dialog over a dimmed full-screen backdrop (`GlobalZIndex(25)`) while `village.advance.open` is true.
   - Includes title/explanation, days stepper (`-7`, `‹`, days display, `›`, `+7`), active-styled `"Fast simulation"` toggle with explanation, live rounded progress bar while a run is underway, structured `"UPCOMING MILESTONES"` list, mouse-wheel scrolling, and `"Cancel"` / `"Advance time"` / `"Stop advance"` actions driving `Village::apply_advance_action` (which calls `Advance::apply` and checkpoints pause on stop).
   - Added accessors on `Advance` (`days_selected`, `target_days`, `progress`) and removed open advance text and milestones from `show_hud` (keeping the post-run result notice when closed).

## Verification

- `cargo fmt` clean.
- `cargo build` succeeded.
- `cargo test --bin solar-friends-v3`: all **347 tests passed**, including `every_character_in_game_text_exists_in_the_ui_font`, full integration tests in `src/main.rs`, and new unit tests in `resident_meters.rs`, `terrain_card.rs`, `lens_card.rs`, and `advance_modal.rs`.
- `cargo clippy --all-targets -- -D warnings`: clean (0 warnings).

## What could not be verified

- Visual layout in a running browser/desktop window (e.g., exact vertical clearance under the wrapped top bar on narrow ~800px viewports, font wrapping on narrow sheets while the old right-hand toolbar column still exists).

## Open questions / Notes for coordinator

- **Temporary duplicated buttons**: Per instructions, `toolbar.rs`, `toolbar/top_bar.rs`, `build_menu.rs`, and `theme.rs` were left untouched. Once the coordinator removes the legacy right-column/dock buttons for Residents, Terrain, Lenses, and Advance:
  - In `src/main.rs`, tests currently press `"Find resident in village"` (line 1725), `"Other lenses"` (lines 1270, 1282), `"+7 day(s)"` (line 1593), and `"Start advance"` (line 1594), which still hit the legacy toolbar buttons. When those toolbar buttons are removed, update those test labels to `"Find in village"`, direct lens clicks (no `"Other lenses"` paging needed), `"+7"`, and `"Advance time"`.
- **Top-bar clearance**: `lens_card.rs` uses `LENS_CARD_TOP = 142.0` and `terrain_card.rs` uses `TOP_BAR_CLEARANCE = 112.0`. When the coordinator switches sheets/cards to measured top-bar height, both constants can be wired into the shared measurement.
- **Residents modal frame**: `resident_meters::spawn` lives inside `VillageHud` and uses a wrapping two-column row (`196px` roster + `flex_grow: 1` detail), so it will automatically expand cleanly when the coordinator moves Residents into a centered modal over a dimmed village.
