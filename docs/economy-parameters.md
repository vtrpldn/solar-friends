# Economy parameter register

## Why

Keep measured references separate from authored game values. The physical-trade increment makes money and deliveries less artificial; it does not yet make the full economy a calibrated Brazilian rural economy.

## Reference baseline

Working research region: rural São Paulo, southeastern Brazil, road access and an existing grid connection. Land ownership and the two starting vehicles are pre-existing assets; starting cash is working capital. Their acquisition and depreciation values remain uncalibrated.

Research sources identified on 2026-11-16:

- [IBGE SINAPI](https://www.ibge.gov.br/estatisticas/economicas/servicos/9270-sistema-nacional-de-pesquisa-de-custos-e-indices-da-construcao-civil.html): regional construction prices and labor references. Aggregate cost per square meter is not a substitute for a building bill of materials. No SINAPI number has been applied to the catalog yet.
- [ANEEL tariff explanation](https://www.gov.br/aneel/pt-br/assuntos/tarifas/entenda-a-tarifa/custo-da-energia-que-chega-aos-consumidores): tariff components. A specific distributor, tariff class, month and tax treatment still need selection.
- [Embrapa forestry guidance](https://www.embrapa.br/web/agencia-de-informacao-tecnologica/cultivos/eucalipto/producao/gestao/tecnica/idade-otima-de-corte): forestry rotations must be calibrated separately from short-cycle crops. Existing growth timers remain gameplay values.

These are research inputs, not evidence that current prices match reality. Supplier quotes, fuel prices, crop yields, farm-gate prices and labor quantities remain research tasks.

## Implemented parameters

| Quantity | Current value | Classification / limitation |
| --- | --- | --- |
| Cash settlement | whole centavos | Accounting rule; `transact` posts cents, retaining sub-cent utility carry. Existing `money` API remains reais for save/UI compatibility. |
| Simulation clock | 0.45 game minutes per simulation second | Existing abstraction. Acceleration does not change this ratio. |
| Cargo per trip | 350 kg and 1.2 m³, both enforced | Provisional game capacity, not a manufacturer specification. |
| Operating cost per round trip | R$4 nearby / R$6 normal / R$12 remote | Provisional combined operating charge, not researched fuel or depreciation. |
| Export quote | floor(purchase batch price × 0.5) reais | Existing authored spread, not observed farm-gate prices. |
| Buyer demand | eight purchase batches per resource per game day | Provisional. Demand is reserved at order acceptance; confirmed orders retain their quote across days. |
| Export consolidation delay | 40 simulation seconds = 18 game minutes | Gameplay pacing. Existing purchase trips can take queued exports immediately. |
| History | at most 100 trade orders, preserving active ones | Storage bound. Finance history separately retains 100 recent entries and aggregate totals. |

Cargo measurements are explicit in `web/v02/weekend/physical-trade.js`. Existing resource units remain authored pieces, packs or kits. Cargo weight does **not** convert inventory into kilograms. Unknown pack types currently use a provisional 2 kg / 0.01 m³ fallback; this must be replaced during unit calibration.

## Ownership and settlement

Queued exports are removed from available inventory but still count toward store capacity. Loading moves them into vehicle ownership. The buyer pays when the vehicle starts its return journey. Order status prevents repeated settlement. Cancellation returns only queued goods; loaded goods cannot be cancelled through the UI.

Purchases are prepaid. Ordinary purchases arrive on return. Construction purchases remain in each project's pending materials until unloaded; oversized orders travel in separate manifests. Outbound exports and inbound purchases use separate directional capacity. One trip is active at a time; both cars are selected in alternation, not dispatched concurrently.

Blueprint affordability includes at least one collection fee, but full future transport budgets are **not** reserved yet. Subsequent spending can still delay collection. Multiple-trip costs, failed deliveries, provider-specific markets and paid delivery fallback remain outstanding.

## Evidence

- `scripts/verify-v02-physical-economy.mjs`: reservation/cancellation, real trip stages, delivery, demand limits, save/load, cargo sizing, duplicate settlement and fractional electricity charges.
- `scripts/verify-v02-economy-soak.mjs`: three-day automated continuation from the genuine Day 61 save; report `docs/balance/2026-11-16-physical-economy-soak.json`. This is not ordinary browser play or evidence of realistic long-term yields.
- Existing finance, policies, needs, playtest-fix and acceleration regression scripts also passed during this increment.

Do not declare the realistic-economy release gates complete from these tests. Fresh-start play, seasonal runs, all-biome comparisons and ordinary catalog construction must follow the later model changes.
