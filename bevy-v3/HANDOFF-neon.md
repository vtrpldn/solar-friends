# Round 5 Handoff — Neon (`neon/residents-guide-setup`)

## Summary of changes

Rebuilt V3's title screen to match V2's poster menu (`web/v02/weekend/menu.html`, `menu.css`, `menu.js`) at desktop proportions while keeping every V3 action reachable and adding full keyboard navigation and focus styling:

1. **V2 Title Screen Layout & Typography (`src/theme.rs`, `src/setup.rs`)**
   - Added V2's title-screen palette tokens at the end of `src/theme.rs` (`TITLE_BG`, `TITLE_FRAME`, `TITLE_INK`, `TITLE_ART_CAPTION`, `TITLE_PRIMARY_*`, `TITLE_ROW_*`, `FOCUS_RING`) without modifying any existing tokens.
   - Rebuilt the title backdrop (`SetupSection::Backdrop`): warm parchment `#e9e0c8`, outer hairline frame (`#8b9875`), large right-side sun-and-leaf poster art (`title-art.png`, horizontally compensated for its transparent padding so the artwork centers directly above its caption) with `"GROW SOMETHING GOOD"` underneath in `#5b704d`, and bottom-left `"SOLAR FRIENDS"` / `"v3"` colophon aligned on the `10vw` brand axis.
   - Rebuilt the left brand & menu column (`SetupPanel` in title mode):
     - Small uppercase tagline `"A LITTLE LAND. A LIFE TOGETHER."` above the heavy two-line `"Solar\nFriends"` display heading (`100px` unscaled / `~82px` at `UI_SCALE = 0.82`, weight `800`, `LineHeight::RelativeToFont(0.88)`).
     - Dynamic primary deep-green block (`#36523f` fill, `#f7edcf` cream text, hard bottom shadow): promotes **`Resume current village`** (with active-village summary line) when a session is in progress, else **`Continue`** (with saved Story summary line) when a Story autosave exists, else **`New game`**.
     - Remaining menu actions rendered as V2 plain text rows (transparent at rest, soft green tint + `4px` right shift on hover): **`New game`** (when not primary), **`New sandbox`**, **`Continue sandbox`**, and slightly smaller offset **`Sound settings`** (matching V2's `.menu-actions .settings`).
     - Utility row aligned with the menu text column: underlined **`Browse the art collection ↗`** link beside a raised V2 paper **`Load village`** button (`theme::button()`), plus an inline status line for launch feedback.
   - Preserved the unified two-column Land Setup sheet (`choosing_land == true`) unchanged in layout and styling.

2. **Keyboard Focus & Navigation on Title Screen (`src/setup.rs`, `src/village.rs`, `src/village/library_ui.rs`)**
   - Added `TitleFocus` resource (separate from `WorldSetup` so moving focus never triggers terrain redraws).
   - `ArrowDown`/`Tab` and `ArrowUp`/`Shift+Tab` cycle focus across all currently visible title actions; `Enter`/`NumpadEnter`/`Space` activates the focused action (including shared helpers `village::continue_saved_village` and `village::open_save_library`); `Escape` or pointer hover clears keyboard focus.
   - Focused title controls show V2's `3.5px` `#aa773c` `Outline` focus ring (`offset: 3.5px`), and focused plain text rows also receive the hover tint and right-shift so focus is unmistakably visible.

3. **Art Collection & Native Art Tools Integration (`src/workshop/navigation.rs`, `src/workshop/collection.rs`)**
   - Wired **`Browse the art collection ↗`** on both platforms:
     - Native desktop: launches V3's 3D Art Collection (`--collection`) with duplicate-window detection and inline status feedback.
     - Web (`wasm32`): navigates to `?collection`, with `#solar-friends` canvas binding added to `workshop/collection.rs` and `ArtTool::open_in_browser()` wired so clicking `"Game menu"` inside the collection navigates back cleanly.
   - Converted the native-only bottom-right `ArtTools` box into a compact collapsible **`Art tools`** toggle button anchored at bottom-right (`right: 46px, bottom: 46px`) and hidden during Land Setup, keeping the right-hand sun-and-leaf poster art completely unobstructed at rest while every art tool (`Collection`, `3D inspector`, `Scene editor`, `Biome landscapes`, `Resident animations`, `Balance Lab`) stays reachable.

4. **Tests (`src/main.rs`, `src/setup.rs`)**
   - Updated renamed title-screen button labels in `src/main.rs` integration tests (`"Continue"` and `"Load village"`, plus the corrupted-autosave notice in `src/village.rs`).
   - Added unit tests in `src/setup.rs` verifying V2 poster copy/footer presence, dynamic primary-action promotion (`Resume` > `Continue` > `New game`), plain-row hover tint/shift, keyboard focus cycling with `#aa773c` outline, and `Enter` activation.

## Verification

- `cargo fmt`: clean.
- `cargo build`: succeeded.
- `cargo clippy --all-targets -- -D warnings`: clean (0 warnings).
- `cargo test --bin solar-friends-v3`: all **362 tests passed** (including `every_character_in_game_text_exists_in_the_ui_font` and `bevy_update_enters_a_village_and_places_a_camp`).
- `cargo check --target wasm32-unknown-unknown`: clean (0 errors, 0 warnings).

## What could not be verified

- Live visual inspection in a desktop window or browser (e.g., exact visual balance of `title-art.png`'s `+10.8%` horizontal centering offset above `"GROW SOMETHING GOOD"`, and runtime `?collection` navigation in a live WebGPU browser tab).

## Open questions / Notes for coordinator

- **Title screen `"Load village"` vs in-game `"Saved villages"`**: On the title screen `Action::Library` is now labeled `"Load village"` to match V2's menu (and the corrupted-autosave notice on the title screen refers to `"Load village"`), while the in-game View & options popover keeps `"Saved villages"`.
- **Art collection on web**: Clicking `"Browse the art collection ↗"` on WASM navigates to `?collection`, which launches `workshop::collection::run` on `#solar-friends`. If the web host serves a separate static art library page instead, `ArtTool::open_in_browser` in `src/workshop/navigation.rs` is the single place to redirect it.
