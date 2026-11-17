# Economy calibration and validation — 17 November 2026

## Why

Close the realistic-economy implementation with inspectable evidence. Separate normal-command progression from injected mechanical tests, analytical estimates and browser observations.

## Model and provenance

The reference is an already-owned rural Campinas plot, working capital of R$500 / R$2,000 / R$6,000, and two already-owned cars. Prices, physical units and provenance for all 36 materials, 22 recipes and 68 buildable types are in [the parameter register](../economy-parameter-register.json). [Calibration sources](../economy-calibration.md) identify dated fuel, utility, timber, tank, solar/battery, crop-yield and wall-labor references. Other coefficients are explicit engineering estimates or gameplay assumptions. This is not a surveyed turnkey construction budget or a species-specific agronomic model.

Current fresh-start evidence: [all 18 configurations](2026-11-17-final-bootstrap.json).

## Fresh starts

Current-price tests cover three biomes, three savings levels and nearby/remote towns. Commands place and purchase five camp structures, residents collect and build, and optional outside work provides income. Tight starts additionally select at most six nearby trees for cutting and sell raw wood through real trips. No cash, stock or completed structures are injected.

Default and comfortable cases run three days. The initial fourteen-day tight Caatinga/remote case remained solvent and fed but had only four of five structures. A twenty-one-day continuation strategy placed the gathering place around Day 16 and finished all five. The original failure is retained in `2026-11-17-water-defaults-caatinga-fourteen-days.json`; it is not replaced with a fabricated pass. A tight budget therefore means staged development, not a promise of the full camp on the first evening.

## Production reaches a buyer

Three separate continuations use an actual paid catalog village, preserved at `evidence/2026-11-17-income-start-save.json`. They select ordinary jobs, queue production, preserve household food, and sell through resident trips. No stock/cash/building injections occur. Existing capital was built under earlier recorded price revisions.

| Approach | Elapsed game days | Actual sales receipts | Cash change | Interpretation |
| --- | ---: | ---: | ---: | --- |
| Selected trees → sawmill → timber | 1 | R$216 | +R$149.97 | Two finite wild trees selected; no outside wage paid in this interval. |
| Hens → eggs | 13 | R$18 | +R$129.77 | Recovered from neglected animal care; one outside job also earned R$900. |
| Garden → vegetables | 46 | R$48 | +R$2,410.52 | Two outside jobs earned R$5,220 while the crop grew. |

These are working supplemental income chains, **not proof that a single tiny garden or coop can fund five adults**. Reports include food, transport, utility and wage postings; retained operation counts are bounded history, not lifetime totals. The [seven-chain analytical comparison](2026-11-17-income-opportunities.json) includes recurring feed and planting replacement costs, and explicitly excludes unallocated capital, water labor, utilities and shared logistics. Its contribution figures must not be called net profit.

## Full-catalog coverage

The final replay starts from a real seeded story village and uses normal commands, resident work, paid supplies and physical trips. It was checkpointed and resumed as calibration defects were repaired; earlier paid bills retain their captured values. The report records source revisions. It is therefore a genuine progression continuation across revisions, not a claim that every purchase used one pristine final build.

Its strategy evolves from optional outside jobs and purchases to selected finite woodland, sawmill exports, local earth/stone, and bulk delivery for heavy construction. Once woodland is depleted, purchased raw wood feeds the sawmill. A fifth outside job is enabled while saving, with one resident retained for active construction. All are existing player controls; no funds, materials or completed buildings are injected.

Constructing every catalog variation with five residents is a coverage stress test, not a recommended build order or a prediction of normal village pacing. The [final report](2026-11-17-final-catalog.json) records **68/68 completed types**, no unfinished construction, R$640.37 cash and valid restoration after approximately 415.25 elapsed game days. The [actual resulting save](evidence/2026-11-17-final-catalog-save.json) is retained. There were 10 recorded start/resume revisions during calibration; this is not a single-version performance benchmark.

## Biology and long-lived assets

`2026-11-17-seasonal-cycles.json` records complete biological cycles across all three biomes. These are diagnostic growth fixtures, including multi-year forestry; they are not villages financed through six years of ordinary play. Separate probes cover drought, irrigation recovery, rain substitution, fertility, animal neglect/recovery, food age in transit, cold storage, preservation, charging losses and actual replacement parts/work. Such focused tests establish mechanics, not enjoyment or whole-farm profitability.

## Ordinary UI play

[Browser observations](2026-11-17-ordinary-economy-playtest.md) cover approximately one hour of wall time, interleaved with implementation, at ordinary 1× and 4× controls. Five camp buildings finished on the first evening. At Day 2 21:30 the village had five meals plus 12 ingredients, 85 L clean water and R$1,721.63. These early purchases used preceding wood/tank prices, so current-price affordability relies on the separate matrix. The UI exposed progress, needs and shortages; routine water continued automatically. The tab is left paused.

Restart and named-save defects found during this session were fixed. A named village survived starting a different village and was loaded back through the UI at its recorded time/resources. Earlier disposable test state affected by the old defect is not claimed recovered.

## Verification boundaries

The accelerated lab keeps the same fixed simulation step; 128× through 1024× scheduling and navigation-cache invalidation are compared against ordinary stepping. Utility recipient counting was compared against the prior implementation for 2,000 steps with rain and connection toggles, with identical complete state. Skipping completed-job sorting and empty water-share entries was then compared over 4,000 full populated-village steps, including exact serialized-state equality. No larger integration step or free supplies are used to claim faster progression.

Five historical scripts (`verify-v02-buildings`, `weekend`, `art-revisions`, `consistency`, `economy-soak`) retain obsolete expectations such as old prices/timing, overnight growth, instantaneous relocation or former artwork proportions. They are not included in the current economy regression set. Relevant mechanics are covered by current targeted checks and the paid catalog replay; this report does not claim every historical repository script passes.

## Deliberate boundaries

- Fixed integer packs remain serialized behind a kg/L/count accounting boundary; paid bills and older saves are not silently reinterpreted.
- Cash posts in centavos through the transaction boundary, retaining the existing reais-facing API and sub-cent utility accrual.
- Current ownership is derived from authoritative orders/projects; detailed ledgers are bounded.
- Construction is an unfinished, stylized shell model. Cement, reinforcement and finishes are aggregated, and construction stages are estimates rather than separate curing jobs.
- Supplier limits, buyer bands, wages and many prices remain transparent authored contracts. No inflation, credit, taxes, permitting or financial depreciation simulation is claimed.
- Smallholder farming mainly supports food security and supplemental income. Optional outside work and finite standing timber bridge the early investment period.
- Deployment is separate from local implementation. Nothing in this report establishes that production has been updated.


The catalog continuation exposed a late hauling/rest deadlock: an empty-handed resident returning for the next load was barred from taking urgent personal breaks by the operation phase alone. The cargo flag now determines that restriction. The actual affected save is retained in `evidence/2026-11-17-hauling-rest-deadlock-save.json`; `verify-v02-hauling-needs-recovery.mjs` advances it five days without injections and requires every affected resident to recover food, sanitation and energy through ordinary actions. The separate needs/cargo and multi-load ownership regressions also pass.


The [regression record](2026-11-17-economy-regressions.json) contains 87 passing current focused scripts. The opening test’s historical half-day deadline was replaced by a two-day upper bound after actual completion at 3,042 simulation seconds (less than one game day); the original failure remains recorded. Site build and whitespace checks pass.


## Final electrical-independence check

The actual completed catalog village then ran three further game days with the Power screen's grid-import setting disabled. [The continuation report](2026-11-17-offgrid-continuation.json) records zero additional grid imports, zero additional electricity expense, zero powered-load outage steps across 96,000 fixed steps, food remaining, and a valid save. This proves electrical independence for this layout and observed weather period; it does not claim year-round independence or independence from purchased food/fuel.

## Completion

Local implementation and validation are complete within the boundaries above. All implementation increments are committed on `main`. The site build and `git diff --check` pass. Production was not pushed or deployed as part of this calibration request.
