# Runtime clothing resampling evidence

The retained-canvas source is a rejected experiment, never a game import. The comparison tool serves it only under an isolated experimental module URL. Bitmap mode transforms that experiment in memory; each report pins the actual served bytes.

Run `node scripts/compare-clothing-colour-surfaces.mjs /tmp/solar-colour-production` to require exact production equality against the PNG implementation frozen at commit c1dfccf. This checks all 41 bundled sources in three tinted palettes and all 48 native registered crops per palette. Source-only equality is insufficient: downsampling a canvas/bitmap differs from downsampling the decoded PNG despite identical full-resolution channels.

`--canvas` and `--bitmap` intentionally exit unsuccessfully while these candidates differ. Their reports retain the failed criteria. Neither alternative was installed. Timings are diagnostic, not a performance acceptance gate.

The maximum-roster report comes from `node scripts/benchmark-mixed-play.mjs artifacts/short-sleeve-max-play-v1 --resident-style=short-sleeve --seconds=10`. It uses the actual production pipeline, twelve distinct appearances and 256 buildings. This is a short stress observation, not a balanced scenario or sustained-performance approval.
