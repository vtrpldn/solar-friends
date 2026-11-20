# Astra handoff · resident animation

Camp residents now render between simulation samples, turn gradually, and use rendered ground speed to drive their gait clips. Pausing holds their position, facing, clip time, and any in-progress cross-fade. The simulation, arrival cut-scene, and car motion keep their existing behavior.

- Position reaches each sample in one 100 ms fixed tick. Visibility changes, entering or leaving a visual anchor, and jumps greater than 4 m snap without feeding the jump into gait speed. The cutoff leaves room for a full 16× walking tick, which typically covers about 3 m. Ground height follows the rendered position, including on bridge decks.
- Facing uses the shortest arc at up to 540°/s at 1× and 1,080°/s at 4× and above. A frame hitch contributes at most 67 ms to a turn.
- Walk, CarryWalk, and DuckWalk use reference paces of 1.8, 1.4, and 1.2 m/s. Playback tracks speed directly through 6× clip rate, gains 0.65× clip rate per additional unit, and caps at 13×. Other clips scale with the square root of game speed up to 3×.
- Gait starts at 0.12 m/s and holds for 140 ms below 0.06 m/s before switching to Idle. This covers brief path stops. Gait fades take 140 ms and other village fades take 300 ms at 1×, halving at 4× and above.

Formatting and strict Clippy passed. All 340 binary tests passed, including six new tests for smoothing, snaps, pause, turns, playback, and pose hysteresis.

## Desktop visual check

Watch residents start, stop, reverse, and turn corners at 1×, 4×, 8×, and 16×. Check foot planting on straight routes, turns at 16×, and bridge ramps. Pause mid-step and mid-fade, then resume. Check shelter and restroom entry and exit, seated rest, and the opening arrival with cars.

## Commit handoff

The sandbox denied creation of the Astra worktree's Git index lock. The changes are uncommitted. Local `main` also lacks the `bevy-v3` port.

Intended commit on the port integration branch: `Smooth resident movement and animation at all game speeds`. Include `src/village.rs`, `src/village/resident_motion.rs`, `src/resident_animation.rs`, and this handoff under `bevy-v3`.
