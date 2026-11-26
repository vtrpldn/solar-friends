# Project instructions

- Commit completed work directly to `main` as soon as it is ready, in small incremental commits.
- Pull requests are optional; create one only when explicitly requested or when review is needed.
- Never merge a pull request without individual, explicit user approval.

## UI platform scope

Prioritize the desktop game experience. Solar Friends is a game, not a website; mobile support is not required. Do not add mobile-specific layouts, touch adaptations, or phone viewport checks unless explicitly requested.

## Landing work

Sessions work on a `claude/*` branch in a worktree and land it on `main` like this:

1. Commit on the branch.
2. `git fetch origin && git merge origin/main` (merge, don't rebase; other sessions are pushing too).
3. Run `npm run check:changed`, then `git push origin HEAD:main`.
4. Netlify builds and deploys `main` only; deploy previews and branch deploys are off because build minutes are limited, and every push to `main` spends some. A push is not proof of publication: compare the live `/v2/build-info.js` revision with `main`, and for releases run `scripts/check-production-release.mjs`.

Land each piece as soon as it passes. Long-lived branches collide with the many parallel sessions on the hub files.

## Where things live

The playable game is `web/v02/weekend/` (served at `/v2/`; the folder name is historical). It is plain JavaScript with no build step. Other routes are in the README.

- **Simulation** (`simulation.js`, headless, deterministic: no randomness or clock reads).
  - **Per-tick behaviour:** one tick runs `TICK_STEPS` in order, sharing `ctx = {dt, sys}`. Add a step there, or call your subsystem from the step it belongs to. A before/after message diff stays inside one step.
  - **Resident behaviour:** each resident's turn is `residentTurn`, a priority ladder in which each `continue` ends the turn. Construction is its last rung, `constructionTurn`.
  - **Production jobs:** `operationalWork`, with `waterOperation` and `returnOperation` split out.
  - **Saves:** `restore()` returns null for a bad save. `restoreWithReason()` says which check failed, so use it when a save won't load. Add a validator to the named list near the end of `restoreState`, and old-save migrations beside the others.
  - Subsystems live in their own modules (`weather.js`, `cultivation.js`, `infrastructure.js`…). They must never import `simulation.js`; there are no import cycles.
- **Presentation** (`game.js`, one big module whose top-level variables are shared state).
  - **HUD:** `renderUI` calls one `render…` function per HUD area. Add a new area as its own function and call it there; `refreshUI()` forces a redraw.
  - **Animation:** `frame` steps the simulation, then calls one function per kind of animation (`animateResidents`, `placeVehicles`, `animateBuildings`, `updateSkyAndShadows`…).
  - **URL flags:** `url-flags.js` lists every URL flag; a preview scene goes in `PREVIEWS`.
  - **Management screens:** `SCREENS` in `management.js`. A new screen also needs both `data-manage` button rows in `index.html` and a binding in `keyboard-shortcuts.js`; `verify-v02-screens.mjs` checks that they agree.
- **Some checks read hub source text** and must change when that code moves:
  - `verify-v02-keyboard-shortcuts.mjs` reads `shortcutActions` in `game.js`.
  - `verify-v02-resident-picking.mjs` appends code that uses `game.js`'s top-level `controls`, `actors`, `camera` and `THREE`.
  - `verify-v02-world-settings.mjs` and `verify-v02-save-slots.mjs` match the reset code in `game.js`.
  - `scripts/profile-v02-release.mjs` swaps `game.js` wholesale.

## Verifying a change

```sh
npm run check:quick     # while iterating: owned checks plus a smoke set, seconds
npm run check:changed   # before pushing: every check whose imports reach your changes
npm run build:site
```

- Only one check run works at a time on this machine. A run from another worktree waits, which is normal. Run a single check with `node scripts/<name>.mjs`.
- UI changes need a rendered look. Use the browser checks, and for HUD refactors `node scripts/ui-snapshot.mjs --record/--compare`.
- Simulation refactors must be proven byte-identical with `node scripts/golden-sim.mjs --record` before and `--compare` after (`--quick` for a fast pass).
- New checks build their state with `scripts/fixtures.mjs`: `village()`, `addSite()`, `advance()`, `advanceUntil()`, `seedSave()`. Checks about the arrival, opening or camp choice build their own.
- A failing historical check may encode an older design decision. Investigate it before changing or deleting it, and say which you did.

## History is not the spec

Dated documents and evidence are records, not current behaviour: everything under `docs/balance/`, `docs/playtests/`, `docs/releases/` and `docs/v02/`, and the review captures in `.github/*/`. The root `.ignore` keeps them, vendored Three.js and generated exports out of search results; `rg -uu` searches everything. The current behaviour is the code, `web/v02/weekend/README.md` and the undated docs in `docs/`.
