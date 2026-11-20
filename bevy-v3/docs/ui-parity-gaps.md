# V3 UI parity gaps against V2

Compared screen by screen in the in-app browser at the owner's pane size (about 800×877 CSS px), on the same village: V2 at `http://localhost:4174/v2/?downtime-preview`, V3 at `http://localhost:4180/?downtime-preview` (`bevy-v3/web/build.sh release` first).

## The root difference

V2 builds every screen as **one self-contained dialog**: a paper card with a caption and title, a close ×, its own tabs or sidebar, and widgets inside (cards, meters, inputs, buttons). Almanac screens are a large centered modal over a dimmed village with a left sidebar (Finances, Items & equipment, Crafting, Food, Resources, Water, Power) and "Paused while you plan". Small tools (Projects, Terrain, Lenses, View & options) are compact cards near the button that opened them. **The dock never changes.**

V3 splits every screen across three places at once: a text sheet on the left (`show_hud` in `village.rs`), a column of buttons on the right (`PanelMenu` in `toolbar.rs`), and extra contextual buttons appended to the dock (Previous/Next page, Close panel, Find material, Manage food…). Most content is long `·`-joined text rather than widgets. That is why V3 reads as busy and unfinished next to V2.

Fixing parity means moving each screen into a real dialog with widgets, and keeping the dock fixed.

## Shell-level gaps
1. Sheets start at a fixed `TOP_BAR_CLEARANCE` (112 px). When the stat cards wrap to two rows (narrow windows), the sheet heading hides under them. Position sheets from the top bar's measured height, or make almanac screens centered modals like V2.
2. The dock changes with context (Previous page, Next page, Close panel, Show items and equipment, Find material, Manage food, Finish terrain…). V2's dock is constant; those controls belong inside the dialog.
3. No dimmed backdrop or "Paused while you plan" for almanac screens.
4. Dock buttons lack V2's small icons (⌂ Build, ▤ Projects, ♡ Residents, △ Terrain); the UI font lacks those glyphs, so use small images or drawn shapes.
5. Stat cards are left-aligned; V2 centres them between the edge and the clock card. Water card has a key chip in V2 (M for savings).

## Screen-by-screen

| Screen | V2 | V3 now |
|---|---|---|
| Build catalog | Sheet above dock, category sidebar, picture cards, search, Auto-buy, Close | Close to V2 (done) |
| Selected building | Right card: art, state caption, title, benefit with left bar, status inset, "Resident work" select, actions | Close (done), but the select is still missing and actions are a button stack |
| Projects | Compact card "Your projects" with collapsible "Around the village · N built" list of project rows (icon, name, ✓) and "Recent events" | Narrow text card plus project buttons in the right column and paging buttons in the dock |
| Residents | One dialog: roster cards left inside the dialog, portrait header, tabs, "Find in village", "View project", activity inset, paid work card with button, home select | Sheet with header and meters (Neon), but roster, tabs, priorities and actions sit in the separate right column |
| Terrain | Card "Shape the land": Tool picker, Brush radius picker, hint, Pick flatten height, Undo, protection note | Instructions as text in the status card, tool buttons in a bottom-right stack, dock shows Finish terrain |
| Items & equipment | Almanac tab: tiles (savings, items owned, crafting jobs), searchable item cards with count and "Trade in town", right "A trip to town" panel (store item, fetch/queue sale buttons, storage note) | Text list in a sheet, "Trade · X" buttons in the right column, dock buttons |
| Crafting | Almanac tab: Make/Repair/Jobs tabs, recipe list with art and status, detail card (materials with needed/available, workspace, qualified residents, time, Make this item) | Text plus right-column recipe buttons |
| Food | Almanac tab: tiles (portions, reserve coverage, spoilage, cold storage), pantry search, kitchen policy with targets, refrigeration, trip-to-town panel | Text sheet; tiles partly done (Astra) |
| Resources | Almanac tab: tiles, store search, material cards with amounts, trip-to-town panel | Merged into Stores text |
| Finances | Almanac tab: tiles (savings, income, expenses, net), records, paid work card per resident with Book button, seven-day outlook sections | Tiles (Astra) then a long wall of text; paid work buttons in right column |
| Water / Power | Almanac tabs with per-building cards and actions | Close (Astra); connection controls still in right column |
| View & options | Popover above the button: camera row (?, Q, E, −, +), Camp/River/Grid, New village / Main menu, Saved villages, Copy bug report with explanation, Art collection link, Sound sliders | Two-column stack of plain buttons in the right column |
| Map lenses | Card "READ THE LAND · Map lenses" with a two-column grid of lens buttons and close | Numbered text list in the status card plus a button grid bottom-right |
| Advance days | Centered modal over dimmed scene: title, explanation, days input, upcoming milestones, Cancel / Advance time | Text in status card plus buttons in right column |
| Guide | Dialog with topic list and article | Close (Neon) |
| Setup / title | Menu and "Your village" dialog | Close (title done, setup by Neon) |

## Scene
- Night is now close to V2 (sun bug fixed, warm ambient, campfire glow). Windows do not glow like V2's (V2 uses emissive window panes when powered at night).
