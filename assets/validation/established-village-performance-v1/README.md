# Established-village performance evidence

Why: fresh stress fixtures cannot establish how a village with lived history behaves, and preferred 1× may include automatic 16× while everyone sleeps.

`public-play/` retains a new actual player-control completion of An inherited village, three later game days, exact reload, and unchanged return to its draft. Its checkpoint hash matches the retained benchmark input. `measured/` records four sequential 60-second still/panning phases at preferred 1× and fixed 16×, with effective-speed observations and five-second cache/optional JavaScript heap samples. All six public/measured captures were inspected. `generated-branch-regression/` checks the existing fresh-fixture path with five-second windows; its images are not visual acceptance.

`verdict.json` records values and limitations. The independent verifier restores both input and canonical checkpoints, compares the actual roster/buildings/appearances, checks source identities, effective-speed time, sampling bounds and native checkpoint assertions.

Reproduce from the repository root after building the release engine:

```sh
node scripts/playtest-example-public-controls.mjs an-inherited-village --post-days=3 --output=artifacts/established-public
node scripts/benchmark-mixed-play.mjs artifacts/established-measured --snapshot=artifacts/established-public/an-inherited-village-established.snapshot.json --seconds=60
node scripts/verify-mixed-play-evidence.mjs artifacts/established-measured
```

No gameplay code changed. These measurements do not close the entire original performance, art, biome, recovery or unfamiliar-player gates.
