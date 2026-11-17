# Regular browser playtest after fixes

Continued the named story village on the regular game at `http://127.0.0.1:4190/v2/?mode=story`, using the visible UI at 16×. No lab, injected stock, balance changes, or simulation API calls were used. Planning screens pause normally. The user approved reloading; a second named checkpoint preserved progress before loading fixes found during the run.

Timed session: **2026-11-17 12:58:45.130–13:29:09.760 UTC, 30 minutes 24.630 seconds** including normal planning dialogs and checkpoint reload. Started Day 10 03:34 at R$622.63, nine built structures. Finished paused Day 17 08:36 at R$574.00, twelve built structures, 15 ingredients and 104 drinking water in the HUD. Saved as **Completed 16x playtest — Day 17**. Screenshots: `artifacts/regular-playtest-second-30-minutes/saved.jpg` and `village.jpg` (local ignored evidence).

## Verified during play

- The Day 10 named village restored correctly rather than resetting. A later checkpoint also restored on Day 12.
- A 160 kg stone extraction batch sold for R$14 through a physical town trip, without requiring the old 240 kg minimum. A 16 kg timber batch sold for R$72, and 12 eggs for R$18; each trip still incurs fuel.
- Built a second vegetable garden, timber workbench and garden bench through ordinary material purchasing, collection and resident labor. The bench used village-made timber, leaving only R$15 of fasteners to buy.
- The new garden was planted with baby greens and reached natural growth with full soil moisture without manual irrigation. Long-cycle vegetables and compost continued developing.
- Overnight blueprints retained their prepaid supplies and collected/built after morning opening. Manual town controls explain closing hours.
- Closing a project selected from Projects resumes play. Growing work disables duplicate jobs and no longer incorrectly waits for a resident in either summary.
- Automatic water collection, purification and waste servicing maintained the village without manual care orders. Chickens remained at 100% health in sampled checks.
- Daytime power demand was zero; total grid spending was R$8.86 on Day 16. Routine purification no longer dominates toasts.
- Finance forecasts showed plausible completed-day operating variation. Old hourly electricity history now folds into recorded daily totals without changing cash or ledger totals.
- No browser console errors were reported in the sampled error log. No persistent need deadlock or crash was observed; this is sampled play evidence, not a continuous assertion over every resident.

## Additional fixes prompted by this run

Commit `2448d1d5` fixes a legacy-save placement failure: an existing blocked shelter access point rejected new construction even far away. Placement now rejects newly obstructed access but tolerates an unrelated existing obstruction. The exact formerly rejected garden location subsequently accepted its blueprint and completed. New/moved buildings still require access; regression tests also retain the test for blocking an existing reachable doorway.

That commit also corrects the growing-building service summary, groups legacy electricity history for display, avoids claiming empty ordinary stock is borrowed equipment, and uses physical quantities in new export transaction descriptions. The export-description change was covered by regression checks; the live run retained the preceding loaded description formatter.

## Remaining design concerns

- Farm products are not integrated with eating: resident meals currently consume `meals` or `food`, not eggs or milk. Six additional units spoiled during this run while ingredient purchases continued. Eggs were sold to avoid further waste. This needs a deliberate cooking/nutrition path and food-reserve accounting.
- Small sales can spend much of their revenue on transport. The stone export and food pickup departed separately a few game minutes apart. Better batching would help without changing commodity prices.
- A 21-day crop is shorter than 45 days but still does not solve all first-hour waiting. Do not equate the new option with a fully engaging farming loop; intermediate care and planning decisions remain useful.
- Biological animal jobs still use generic “Growing” copy. “Next collection” would be clearer for eggs/milk.
- The old shelter obstruction remains in this particular saved layout. Automatic approval review rejected relocating it; no relocation was performed. The fix prevents it from blocking unrelated expansion and does not pretend to repair the saved layout.

## Validation

Focused checks passed for building access (including legacy obstruction), camp access, finance reconciliation and forecasting, partial trade/save persistence, production summaries and the full v2 economy regression. The site build and diff whitespace checks passed. Changes were committed directly on main under the project instructions; this run did not deploy them.
