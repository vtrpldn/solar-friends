# Economy calibration register

## Why

A realistic economy needs traceable physical assumptions and consistent quotes before price tuning. This register separates observations from estimates; it does not certify the full catalog as calibrated.

## Reference setting

Rural Campinas, São Paulo, an already-owned plot with road access, an existing residential grid connection, and two already-owned compact four-wheel-drive cars. Land and vehicles are starting assets, not income. Their valuation and depreciation remain pending. Climate varies by selected biome; prices do not automatically change with vegetation.

Research snapshot: 17 November 2026. Electricity uses a June 2026 published reference. Fuel now uses the municipal ANP observation for 8–14 November 2026. The power reference remains an earlier tariff publication; this is not presented as a single-month catalog price survey.

## Applied references

| Input | Observation | Applied model | Classification |
| --- | --- | --- | --- |
| Electricity | ARSESP's June 2026 ranking reports CPFL Paulista at R$0.739/kWh, REH 3579/2026 | R$0.95/kWh after an assumed combined 22% tax allowance, rounded to centavos | Published base; estimated tax allowance, not an actual bill |
| Gasoline | ANP week 8–14 November 2026, Campinas: 25 stations; mean R$6.47/L, range R$5.99–6.99 | R$6.47/L | Observed municipal retail mean |
| Fuel economy | Not yet verified for the exact modeled vehicle/conditions | 10 km/L | Engineering assumption |
| Distance | Player's town-access choice | 4 / 6 / 18 km each way | Scenario assumption |
| Travel | Round-trip distance at 40 km/h plus 12 minutes trading | 24 / 30 / 66 game minutes, excluding walking/parking | Scenario assumption |

Sources: [ARSESP tariff guide, table on page 22](https://www.arsesp.sp.gov.br/Documentosgerais/Cartilha%20Tarifas%20de%20Fornecimento%20de%20Energia%20El%C3%A9trica%2021-09-26.pdf), [ANP municipal workbook, row 877, columns D–K](https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/arquivos-lpc/2026/resumo_semanal_lpc_2026_11_08-2026_11_14.xlsx). CPFL's [current distributor page](https://www.cpfl.com.br/empresas/tarifas-cpfl-paulista) confirms the resolution and notes variable PIS/COFINS; its business tariff table is not used as a residential rate.

Trip fuel costs are R$5.18 / R$7.76 / R$23.29, charged once at departure. These exclude wear; no maintenance reserve is secretly deducted. The shared reference module drives quotes, construction collection commitments, trip timing and finance forecasts. Collection budgets now round to cents, including available-cash subtraction. Already-departed trips keep their stored duration and paid fare; historical durations remain loadable.

Electricity excludes fixed/minimum billing, public lighting charges and tariff flags for now. These limitations must remain visible in calibration work. A residential baseline is a scenario choice; agricultural tariff eligibility is not assumed merely because the plot is rural.

## Research leads, not applied catalog prices

- [IBGE SINAPI](https://www.ibge.gov.br/estatisticas/economicas/servicos/9270-sistema-nacional-de-pesquisa-de-custos-e-indices-da-construcao-civil.html) distinguishes regional construction references. Per-square-meter aggregates cannot replace material quantities and task labor; do not multiply them into a money charge for resident construction.
- [Embrapa lettuce guide](https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1009227/1/DOC142.pdf) identifies a 45–60 day production cycle. This is evidence against treating every crop as an overnight crop, not a calibrated generic ingredient yield.

Still required: matching-date local prices, equipment specifications, canonical pack definitions, construction bills of quantities, labor rates, agricultural yields and sale prices, livestock care, forestry rotations, utility capacities and upkeep. All nonlisted catalog prices remain provisional.

## Evidence

`verify-v02-economy-reference.mjs` checks the independently calculated fares, travel minutes and shared power forecast. Physical trade and procurement tests exercise settlement, multi-trip budget preservation, all catalog collection manifests and legacy trip restoration. These are accounting checks, not evidence of new-game economic viability.

A follow-up regression exposed a real boarding consolidation defect. Adding a compatible prepaid blueprint while the driver was boarding did not refresh the manifest. Boarding now repacks compatible pending orders within capacity; the derived budget excludes the already-paid first fare. Departure locks the manifest. Regression checks cover both branches, overflow trips, restored manifests and no duplicate material payments. Older blueprint checks were also updated to include explicit fuel charges introduced by physical trading.

Power-screen tariff copy and new-game travel estimates now use the shared numeric model rather than independent hard-coded labels. Broader financial, trade, production, spoilage, preservation and cold-storage checks pass; accelerated fixed-step checks pass through 1024×. These remain bounded regression results, not completion of seasonal or full-catalog release gates.


## Construction magnitude check — 17 November

The [IBGE October 2026 release](https://ftp.ibge.gov.br/Precos_Custos_e_Indices_da_Construcao_Civil/Fasciculo_Indicadores_IBGE/sinapi_202610caderno.pdf), published 12 November, lists São Paulo's aggregate construction cost at R$2,096.45/m² with payroll relief, or R$2,216.38/m² without it (tables on pages 5–6). This includes labor and a reference mix of construction, not a quote for a self-built adobe home. It is a magnitude warning: the current toy catalog bills must not be described as realistic house budgets. It is not multiplied into a direct cash charge.

Per-project bills are now captured when the blueprint is purchased. Hauling, ownership valuation and salvage read that captured bill. Future catalog quantity changes therefore cannot retroactively invent or remove paid materials. Historical projects without a captured bill are initialized from their applicable catalog recipe during restore; this is a prerequisite for the remaining bill-of-quantities revision.


## Solar equipment quotes — 17 November

[Minha Casa Solar's module catalog](https://www.minhacasasolar.com.br/painel-solar) lists a TSUN 600 W module at R$719 by card or R$668.67 by PIX. The model now rounds to R$700 per 0.6 kW module, excluding transport and installation. These are national retail listings, not a Campinas delivered quotation.

[Buyers Solar's battery listings](https://buyersenergy.com.br/baterias/) show 4.8 kWh lithium units at R$5,499 (ZTROON), R$6,400 (EPEVER) and R$6,800 (Unipower). The game uses R$6,000 per battery and 4 kWh usable capacity; that usable allowance is an engineering simplification. Vendor-specific discounts and financing are not simulated. The old R$420 unit was incompatible with the modeled storage capacity.

New solar farms now purchase six modules, matching the six modules in the model: 3.6 kW peak before sun/weather/condition. Older paid two-module installations retain their captured bill and 1.2 kW peak; no extra equipment is granted on reload. The grid remains the affordable setup option; rooftop storage is optional for homes.
