# Rejected light-tiling experiment

Why: determine whether reducing the final screen-blend area improves the dense night renderer while preserving its pixels.

The experiment passes the retained three-biome pixel checks at desktop pixel ratios 1 and 2, plus synthetic overlap/edge/empty/fractional-scale checks. It does not improve measured frame cost, so none of its production changes are retained. `experiment.patch` records the rejected implementation. The archived verifier sources belong in the repository's scripts directory if replaying the patch; they are not active production checks. The last camera-pan extension in the archived browser verifier was not run, so no camera-pan pixel equivalence is claimed.

The profile is instrumented and scoped to the paused fixture. Final-copy time can include previously queued Canvas work; it is not proof that screen blending alone consumes that time. Do not enable the separate diagnostic occlusion bypass in the game.
