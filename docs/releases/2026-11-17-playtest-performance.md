# Production playtest and performance — 17 November 2026

## Why

Verify the combined village systems in production, fix problems found through ordinary controls, and reduce rendering work with measured evidence.

## One-hour production playtest

The muted browser session ran from **18:36:38 to 19:36:38 UTC** (3,601 seconds including the final capture). It recorded 117 save/balance samples and 24 scheduled UI actions, with no browser exceptions, invalid saves, negative resource balances or tank-capacity violations.

The session started on `71bf72cd`. Other chats published during the hour; the scheduled reload retained progress while production served `ecb270e9`. Later road and hint changes received separate integration checks. This was not a fixed-revision soak of every final change.

The hosting badge blocked the normal View & options click. The follow-up positions it above the dock and below game panels; a regression reproduces its dimensions and checks clipboard and manual-copy reports. Stale Food policy wording was corrected.

Three scheduled construction attempts were hidden by catalog category filtering; a later repeated attempt had the same limitation. The runner now searches the catalog. Supplementary sessions used copies of the actual production save, without added resources: residents completed a rain tent, and a rotated grid-aligned field retained its bean selection and resident-prepared bed through reload. All five crafting thumbnails loaded without failed requests.

## Performance changes and measurements

The separate performance session started at **19:37:10 UTC**. Its actual completion time is recorded after the hour finishes.

- Paused dry scenes retain UI updates, autosaves and camera controls while skipping unchanged scene transforms and GPU submissions. Input, resize, context restoration and visibility changes request redraws; rainfall keeps rendering.
- Shadow maps follow actual drawing-buffer size: 1024, 2048 or 4096 pixels. Retina/large displays retain 4096. Bias scales with resolution to avoid tent-roof self-shadow artifacts.
- Distant crops use the same diamond outline with two triangles instead of four.
- The optional performance overlay separates frame callbacks from actual scene renders.
- Long economic recovery/soak checks have a bounded 30-minute command allowance. GitHub's previous 10-minute allowance killed a progressing recovery run after day two; its assertions remain unchanged.

Environment: Apple M3 Pro, macOS arm64, Node 24.10, headless Chromium **SwiftShader software rendering**, 1440×900 at device scale 1. These timings do not establish native GPU performance. Profiles replay the same saved village, with 20-second samples after warm-up.

| Measurement | Before | After |
| --- | ---: | ---: |
| Paused frame callback mean | 103.1 ms | 8.3 ms |
| Paused repeated scene submissions | Continuous | 0 while idle |
| 16× running mean, repeated comparison | 111.5 ms | 104.4 ms |
| 16× running p95, repeated comparison | 125.9 ms | 133.6 ms |
| Normal desktop shadow-map texels | 16,777,216 | 4,194,304 |

The repeated running mean improved about 6%; p95 did not consistently improve. This is a small set of local samples, not a statistical or hardware-wide guarantee.

Fixed farm scene: 100 beds and 10,000 leafy-green plants, with shared geometry/materials and instancing. The isolated scene uses hemisphere lighting and no shadow pass. Memory below is JS heap plus renderer resource counts, not total GPU bytes.

| Scene | Frame mean | Draw calls | Triangles | Geometries / textures | JS heap |
| --- | ---: | ---: | ---: | ---: | ---: |
| Original distant scene, crops disabled | 74.5 ms | 2 | 72,000 | 2 / 1 | 27.6 MB |
| Original distant crops enabled | 189.4 ms | 3 | 112,000 | 3 / 1 | 27.6 MB |
| Simplified distant scene, crops disabled | 78.0 ms | 2 | 72,000 | 2 / 1 | 27.6 MB |
| Simplified distant crops enabled | 191.6 ms | 3 | 92,000 | 3 / 1 | 27.6 MB |
| Full-detail scene, crops disabled | 87.8 ms | 2 | 72,000 | 2 / 1 | 21.7 MB |
| Full-detail crops enabled | 962.7 ms | 3 | 1,472,000 | 3 / 1 | 21.7 MB |

Distant crop triangles halved; no frame-time improvement was demonstrated for that change. Both detail levels add one draw call for 10,000 plants, rather than one per plant.

## Native GPU measurements

Explicit Metal rendering confirmed `ANGLE Metal Renderer: Apple M3 Pro`. The same village was already near the display limit: 16× mean frame time changed from 8.62 to 8.36 ms, with p95 remaining 9.3 versus 9.2 ms. Paused idle scene submissions fell from about 118/s to zero. These short samples support reduced idle work, not a large native frame-rate claim.

The isolated 100-bed farm measured 8.38 ms with distant crops and 9.73 ms with full-detail crops (disabled: 8.74 and 7.95 ms respectively). Both add one draw call, from two to three. Full detail uses 1,472,000 total triangles; distant detail uses 92,000. Both retain three geometries, one texture and approximately 23.1 MB JS heap. The isolated scene excludes the full game’s shadow and simulation costs.

Use `SOLAR_RENDERER=metal` with the profiling and farm commands to reproduce native measurements on supported macOS hosts. Default runs retain software rendering for comparison.

## Reproduction and evidence

[Recorded production save](evidence/2026-11-17-production-save.json) and [machine-readable measurements](evidence/2026-11-17-performance.json) are retained. Full local profiles, screenshots and action logs are retained separately with the task artifacts.

```sh
PROFILE_GAME_REVISION=cb0f01a7 PROFILE_MODES=16x PROFILE_OUTPUT=/tmp/solar-before node scripts/profile-v02-release.mjs
PROFILE_MODES=16x PROFILE_OUTPUT=/tmp/solar-after node scripts/profile-v02-release.mjs
node scripts/benchmark-v02-cultivation.mjs
FARM_DETAIL=near node scripts/benchmark-v02-cultivation.mjs
node scripts/verify-v02-paused-rendering.mjs
```

The rendering regression exercises idle submission suppression, actual visible zoom, desktop resize, placement previews, resume, GPU-context recovery, paused rain and 1024/2048/4096 shadow allocations. Lighting, navigation-equivalence and motion regressions pass. Broader UI/recovery checks and final production identity are recorded after completion.
