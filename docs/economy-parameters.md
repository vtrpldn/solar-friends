# Economy parameter register

## Why

Keep measured references separate from authored game values. The physical-trade increment makes money and deliveries less artificial; it does not yet make the full economy a calibrated Brazilian rural economy.

## Reference baseline

Reference setting: rural Campinas, São Paulo, road access and an existing grid connection. Land ownership and the two starting vehicles are pre-existing assets; starting cash is working capital. Their acquisition and depreciation values remain uncalibrated.

Research sources identified on 2026-11-16:

- [IBGE SINAPI](https://www.ibge.gov.br/estatisticas/economicas/servicos/9270-sistema-nacional-de-pesquisa-de-custos-e-indices-da-construcao-civil.html): regional construction prices and labor references. Aggregate cost per square meter is not a substitute for a building bill of materials. No SINAPI number has been applied to the catalog yet.
- [ANEEL tariff explanation](https://www.gov.br/aneel/pt-br/assuntos/tarifas/entenda-a-tarifa/custo-da-energia-que-chega-aos-consumidores): tariff components. CPFL Paulista residential base and an explicit tax assumption are applied; see the calibration register.
- [Embrapa forestry guidance](https://www.embrapa.br/web/agencia-de-informacao-tecnologica/cultivos/eucalipto/producao/gestao/tecnica/idade-otima-de-corte): forestry rotations must be calibrated separately from short-cycle crops. Existing growth timers remain gameplay values.

These are research inputs, not evidence that current prices match reality. Supplier quotes, crop yields, farm-gate prices and labor quantities remain research tasks. Fuel has a dated municipal observation.

## Implemented parameters

| Quantity | Current value | Classification / limitation |
| --- | --- | --- |
| Cash settlement | whole centavos | Accounting rule; `transact` posts cents, retaining sub-cent utility carry. Existing `money` API remains reais for save/UI compatibility. |
| Simulation clock | 0.45 game minutes per simulation second | Existing abstraction. Acceleration does not change this ratio. |
| Cargo per trip | 350 kg and 1.2 m³, both enforced | Provisional game capacity, not a manufacturer specification. |
| Fuel per round trip | R$5.18 nearby / R$7.76 normal / R$23.29 remote | Distance-based, ANP Campinas observation for 8–14 November 2026; excludes wear. See [calibration register](economy-calibration.md). |
| Export quote | floor(purchase batch price × 0.5) reais | Existing authored spread, not observed farm-gate prices. |
| Buyer demand | eight purchase batches per resource per game day | Provisional. Demand is reserved at order acceptance; confirmed orders retain their quote across days. |
| Export consolidation delay | 40 simulation seconds = 18 game minutes | Gameplay pacing. Existing purchase trips can take queued exports immediately. |
| History | at most 100 trade orders, preserving active ones | Storage bound. Finance history separately retains 100 recent entries and aggregate totals. |

Cargo measurements are shared with processing in `web/v02/weekend/material-measures.js`; see [material accounting](material-accounting.md) for revised assumptions and named losses. Existing resource units remain authored pieces, packs or kits. Cargo weight does **not** convert inventory into kilograms. Every resource now has an explicit measurement; unknown IDs throw rather than receiving a fallback. Several kit measurements remain provisional and need specification research.

## Ownership and settlement

Queued exports are removed from available inventory but still count toward store capacity. Loading moves them into vehicle ownership. The buyer pays when the vehicle starts its return journey. Order status prevents repeated settlement. Cancellation returns only queued goods; loaded goods cannot be cancelled through the UI.

Purchases are prepaid. Ordinary purchases arrive on return. Construction purchases remain in each project's pending materials until unloaded; oversized orders travel in separate manifests. Outbound exports and inbound purchases use separate directional capacity. Both cars can travel concurrently, with separate drivers and manifests. Paid bulk supplier delivery is available without a resident driver.

Blueprint affordability includes all remaining collection trips across outstanding orders. The budget packs the same manifests as dispatch, excluding already-paid active shipments. Grid charges and ordinary purchases cannot spend that reserve. Finances shows committed and available cash separately. This is a derived commitment, not an extra deduction or a separate saved wallet. Provider-specific markets remain outstanding; paid freight and storage-blocked delivery waiting are implemented.

## Construction estimates

Construction keeps its existing authored quantities. Core buildings now use task-based authored labor requirements; see [construction checkpoint](construction-economy.md) for coefficients, limitations and save migration. Assembly estimates convert work into game hours at the existing clock rate, excluding hauling, breaks, weather and skill. Each active worker contributes `1 / (1 + 0.12 × (crew size − 1))` of their individual output: cooperation helps, with diminishing returns. The 0.12 coordination factor is a gameplay assumption, not a researched labor coefficient. Delivery quantities remain unchanged; older construction work migrates by completion percentage to the revised requirements.

## Evidence

- `scripts/verify-v02-procurement-budget.mjs`: multi-trip reserves, consolidated orders, active/legacy shipments, restoration, protected cash and diminishing crew estimates.
- `scripts/verify-v02-physical-economy.mjs`: reservation/cancellation, real trip stages, delivery, demand limits, save/load, cargo sizing, duplicate settlement and fractional electricity charges.
- `scripts/verify-v02-economy-soak.mjs`: three-day automated continuation from the genuine Day 61 save; initial report `docs/balance/2026-11-16-physical-economy-soak.json`; collection-budget continuation in `docs/balance/2026-11-16-procurement-economy-soak.json` earns the transport shortfall through exports before ordering. This is not ordinary browser play or evidence of realistic long-term yields.
- Existing finance, policies, needs, playtest-fix and acceleration regression scripts also passed during this increment.

Do not declare the realistic-economy release gates complete from these tests. Fresh-start play, seasonal runs, all-biome comparisons and ordinary catalog construction must follow the later model changes.

The collection-budget replay earned enough through exports after 39.735 game minutes, then completed the shared house during the following three days. Cash after placing the blueprint was R$106.02 and ended at R$1,192.02. Food and water remained positive. Fixed-step equivalence checks passed through 1024× scheduling. These results concern the established Day 61 village, not a new-game bootstrap.

## Food storage (2026-11-17)

Perishable shelf lives are authored game values: ingredients 3 days, meals 2, eggs 7 and milk 1. Batches retain age through reservation and travel; spoilage is disabled in sandbox. No real-world safety or climate calibration is claimed. See [food storage](food-storage.md) for migration, limitations and tests.

Kitchen [dried provisions](food-preservation.md) add a 10-day meal batch with six ingredients, two water, four meals, two residues, 75 work units and 0.6 biogas when unpowered. These remain provisional game values. Ordinary meals remain the default; food storage reports preserved meal counts separately.

Kitchen [cold storage](cold-storage.md) uses a provisional R$600 refrigeration kit (35 kg / 0.35 m³ cargo), one electrical supply and one hardware pack, plus 120 work units. Each powered installation covers 40 stored food units at one-quarter aging speed and draws 0.08 kW while enabled. These are game assumptions awaiting regional calibration.

Electricity and transport now share [a reference model](economy-calibration.md), with published observations separated from tax, distance and vehicle assumptions. The historical replay figures above describe their original parameter versions.


## Later checkpoint — 17 November

The earlier three-day established-village figures above retain their original parameter versions. Current evidence includes an 18-case fresh-start matrix (`docs/balance/2026-11-17-bootstrap-matrix.json`) and a seven-day outside-income replay (`docs/balance/2026-11-17-outside-income-soak.json`). The matrix predates the new R$100 expansion reserve and the latest equipment-price revision; it is retained as comparative evidence, not a final all-parameters certificate.

The ordinary-command catalog run subsequently exposed starvation recovery and blocked-navigation failures after the first few days. Its recorded failure is retained at `docs/balance/evidence/2026-11-17-starved-catalog-save.json`. `verify-v02-economic-recovery.mjs` resumes that exact village for three days and requires every resident to recover hunger and energy, wages to replenish cash, and save/load to remain valid. No stock or cash is injected.

New villages keep R$100 aside when quoting blueprint auto-buy. Finances exposes this expansion reserve; it prevents optional construction from spending the last food allowance, while ordinary purchases can still use it. It is not an additional deduction or an immutable locked balance. Existing saves without the setting retain zero until the player changes it.
