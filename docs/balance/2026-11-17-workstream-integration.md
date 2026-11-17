# Six-workstream integration and 100-day validation

## Why
Combine the building, lens, resident, visual, General work and quality-of-life improvements without losing their economic rules, paid materials, saved homes or resident recovery behavior.

## Integration

Merged [PR #77](https://github.com/vtrpldn/solar-friends/pull/77) into main at `31fdd5baed148c01030ef58a0b406ebc966445cb`. Every requested feature branch tip and the Building improvements snapshot is an ancestor of that merge. The 31 dirty/untracked building files exactly matched the merged snapshot before cleanup. The stacked visual PRs were closed as already integrated; their original commits remain in main.

The five feature chats and the duplicate integration chat are archived. Their worktrees and two completed General work checkouts were removed. Integration reports were retained locally under `artifacts/archived-workstreams/`. Main was synchronized with origin without rewriting published history. The unrelated banking PR #80 and its worktree were preserved, as were four pre-existing untracked art images in the primary checkout.

Integration fixes include exhausted workers recovering between loads, sealed water being set down when a reservoir fills, first-planting seeds charged once, named-save preservation, larger-building access, and safe shipment cancellation. This final run found no further assertion failures requiring gameplay changes.

## Reproduction

```sh
node scripts/report-v02-hundred-days.mjs --days=100 --seed=42 --output=artifacts/integrated-hundred-days
```

The run used commit `e1c430bd9fa0dd79bf92f4d349703f04465ec96a`, whose full Git tree is identical to merge `31fdd5ba`. It is an automated simulation, not browser play: a fresh story village, ordinary purchases and resident construction, two outside workers, a R$900 expansion reserve and affordable production-first expansion. No injected money, materials or completed buildings. Scheduling was 1024x with unchanged 0.1-second simulation steps; measured throughput was 337x (15.8 minutes wall time).

## Results

- Completed 100 days; ten paid buildings finished, including garden, compost, coop, well and workshop.
- Cash finished at R$3703.12, from R$2000.00; lowest daily closing cash was R$767.50.
- Final edible food stock: 20 units. First vegetable harvest occurred by Day 56; compost completed a cycle by Day 74.
- No resident spent any simulated time below the critical hunger threshold of 5. Lowest daily sampled hunger was 29.0, energy 39.7; these sampled minima are not continuous minima.
- Cash and material movement ledgers reconciled every day. No negative stock, invalid needs or non-finite state.
- All ten periodic saves restored successfully. No seven-day wage drought among the enabled outside workers.
- The run covered spring and summer. It does not establish balance for every seed, biome, budget, strategy or late-game building.

[Full daily report](2026-11-17-integrated-hundred-days.json) · [Final resumable save](evidence/2026-11-17-integrated-day-100-save.json).

## Regression checks

124 current v2 scripts passed, including desktop lens, resident and management browser interactions. Also passed: 792 Rust tests, Rust formatting and lint, 1,244 JavaScript syntax checks, and the v1/v2 site build. The first local suite was interrupted by sandbox denial of a localhost server; that browser check and all remaining scripts passed after rerunning with local-server permission. See [check manifest](2026-11-17-integrated-regressions.json).

## Follow-up to the regular 30-minute browser run

The preceding browser run used a pre-reload page, so findings were checked against current main before changing behavior. The follow-up changes group electricity history by calendar day, retain purification in event history without replacing important toasts, show natural growth without an idle-worker warning, keep water-carrier status out of production status, and close the paused Projects tray when closing its detail screen. Build cards expose both materials and collection commitments, and livestock descriptions warn about daily feed and water.

Town collection now departs 07:00–18:00; automatic food, construction and sale dispatch retry during operating hours. Failed manual pickups explain resident/car requirements. Manual sales accept available partial batches, preserve equipment reservations, prorate quotes across price bands, and survive save/load. Gardens offer a smaller 21-day baby-greens harvest as an alternative to 45-day vegetables. This is an authored balance choice, not a promise of real-world yield.

The reported flat finance forecast was not reproduced against current code. Completed-day totals, quiet days, construction exclusion and persistence checks pass; no unsupported forecast reset was introduced. The user subsequently approved reloading. The follow-up regular browser run restored the named Day 10 village and reproduced a plausible seven-day outlook. See the follow-up playtest report for the timed results.
