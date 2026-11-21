# Fast iteration on V3

Iterate on the desktop build. The web build needs a release-style WASM link and
`wasm-bindgen` on every change, so keep it for final checks.

All commands run from the repository root.

## Run modes

```sh
scripts/v3-dev.sh                   # fast relinks + live asset reloading
scripts/v3-dev.sh --hot             # also patches edited systems into the running game
scripts/v3-dev.sh --inspector       # also the egui entity inspector
```

Game arguments pass through, for example `scripts/v3-dev.sh --hot --play --sandbox`.

| Mode | Cargo feature | What you get |
| --- | --- | --- |
| default | `dev` | Bevy linked as a shared library, so a change to the game relinks in seconds. Includes everything in `dev-tools`. |
| `--hot` | `hot` | Runs through `dx serve --hot-patch`. Saving a `.rs` file patches the changed **system bodies** into the running game without a restart, so the village, camera and open panels stay as they are. |
| `--inspector` | `inspector` | Adds [bevy-inspector-egui](https://github.com/jakobhellermann/bevy-inspector-egui). Press Alt+` to browse and edit entities, components and resources live. |

Every mode includes the `dev-tools` feature. Release builds, CI and the web build leave
these features off.

### Hot patching limits

Hot patching replaces function bodies only. These changes still need a restart, which
`dx` does automatically:

- adding or removing systems, components, resources or plugins
- changing a struct's or enum's fields
- changing `Startup` systems, since they already ran
- changing anything in `main`

Hot patching needs the Dioxus CLI that matches Bevy 0.18's `subsecond`, installed once:

```sh
cargo install dioxus-cli@0.7.10 --locked
```

Homebrew's `dx` is Deno's, which is why the script calls `~/.cargo/bin/dx` directly.

## Live asset reloading

Assets registered with `embedded_asset!` reload when their source file changes: the
`.glb` model bundles, dock icons, resident portraits, guide diagrams and the UI font.
Re-run an export script, such as `node scripts/export-v3-building-models.mjs`, and the
open game picks up the new models.

The JSON catalogs in `bevy-v3/data/` are compiled in with `include_str!`, so they still
need a rebuild. Bevy's warning that `bevy-v3/assets` does not exist is expected: the
game embeds its assets instead of reading that folder.

## In-game keys

| Key | Action |
| --- | --- |
| ` | Outline every UI node: the quickest way to check padding, gaps and alignment |
| Shift+` | Frame-rate and frame-time graph overlay |
| Alt+` | Entity inspector (`--inspector` only) |
| Ctrl+` | Screenshot to `bevy-v3/target/screenshots/` |

`--performance` still shows the detailed frame readout from `performance.rs`.

## Driving the running game from scripts

Every dev mode starts the [Bevy Remote Protocol](https://docs.rs/bevy_remote/0.18.1) on
`http://127.0.0.1:15702`. Agents and scripts can press keys and take screenshots without
screen control:

```sh
# Open the build catalog, choose the second category, then capture the window.
curl -s localhost:15702 -d '{"jsonrpc":"2.0","id":1,"method":"dev.keys","params":{"chords":[["KeyB"],["ArrowDown"],["Enter"]]}}'
sleep 0.3
curl -s localhost:15702 -d '{"jsonrpc":"2.0","id":2,"method":"dev.screenshot","params":{"path":"/tmp/build.png"}}'
```

- `dev.keys` takes `chords`, a list of key chords pressed one frame each, using
  [`KeyCode`](https://docs.rs/bevy/0.18.1/bevy/input/keyboard/enum.KeyCode.html) names
  such as `[["ShiftLeft","KeyD"]]`. `text` types characters into a focused field.
- `dev.screenshot` saves the window to `path`, or under `target/screenshots/` when no
  path is given. The file appears a frame or two after the reply.
- Bevy's built-in `world.query`, `world.get_components`, `world.insert_components` and
  `world.list_resources` work on reflected types: `Transform`, `Node`, `Visibility`,
  `Name` and other Bevy built-ins. The game's own components aren't reflected yet.

## Build profile

`[profile.dev]` compiles dependencies at `opt-level = 3` and the game at `opt-level = 1`.
Debug builds run close to release speed, and edits to the game still rebuild
incrementally. Each mode has its own dependency build, so the first run in a mode takes 10–15 minutes.
After that, a change to the game rebuilds in about 7 seconds in the default mode.
