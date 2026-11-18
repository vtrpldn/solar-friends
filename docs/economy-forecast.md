# Community cash forecast

## Why

A growing crop or a queued export is not money available to spend. Players need to distinguish sunk construction costs, operating costs and the uncertainty of future cash flow.

Finances now keeps up to 91 daily totals in centavos in addition to the bounded transaction list. The seven-day outlook uses up to seven **complete** observed days, including days without transactions. It excludes construction purchases and projects the lowest and highest observed daily operating change for seven more days. This is a scenario range, not a confidence interval or a guarantee. New saves and older saves without daily records wait for complete observations; past activity is not invented.

The screen separately shows construction investment and other cash expenses. Inventory and installed buildings are explicitly not cash. The forecast assumes unchanged purchasing, outside work, bills and exports, so it does not anticipate seasonal harvests or new projects.

Verification: `scripts/verify-v02-forecast.mjs` checks complete versus partial days, quiet days, construction exclusion, persistence and malformed totals. This does not replace long-run economic balance validation.

Finances also derives a replacement-cost breakdown for available stores, project/export reservations, processing inputs, travelling goods and installed building materials. Project pickup manifests are references to already-owned materials and are not counted twice. Land, vehicles, labor, depreciation and separately installed upgrades are excluded and explicitly labeled in the screen.

Food replenishment now supports a target in days (an assumption of three portions per resident per day) and a daily purchase ceiling including transport. The default R$150 allowance can fund multiple pickups. The forecast counts incoming deliveries and protects money committed to collection. It is a spending cap, not an escrow account. A resident without bus fare can take optional outside work with the fare deducted by the employer from the completed shift; the village receives only the net amount.
