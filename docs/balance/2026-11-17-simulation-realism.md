---
description: Evidence and limits for v2 weather, hydrology, crop stress, hydration, and animal care.
---
# Simulation realism validation

## Why

Environmental rules must conserve resources, survive saves, and allow residents to recover through ordinary actions. Desktop controls must expose those rules without requiring repeated care orders.

## Automated evidence

The [30-day observations](2026-11-17-simulation-realism-soak.json) cover default, tight, and remote starts on implementation commit `8b08c1f6`. Each run used 960,000 normal 0.1-second ticks, weekly save/reload, and five enabled outside contracts. No diagnostic inventory or cash was supplied. At day 30 all residents had hunger, hydration, and energy above 15; all balances were nonnegative. These are camp survival/income scenarios, not complete village buildouts or evidence that every player strategy succeeds.

Subsequent integration checks cover the final urgent-hydration recovery adjustment: five residents at zero energy and hydration recover from empty tanks through rest, river hauling, purification, and drinking over two days. The original starving-village recovery replay also passed for three days.

Focused scripts check:

- 1,000 generated years against each station's monthly rain, wet-day, and temperature normals; forecast purity and cloud attenuation.
- Nine 365-day watershed balances, shared extraction limits, delayed recharge, roof ownership, overflow, and reload.
- Nine coupled 365-day environmental scenarios with crops and hens. This uses diagnostic immediate farm labor and allocated feed; it establishes subsystem behavior, not resident labor capacity.
- Year-long dry-crop failure, irreversible damage, watering rescue, ripe irrigation, and clearing biomass accounting.
- Actual drinking, full-sewage independence, carried water, unreachable-source warnings, and exhausted-village recovery.
- Animal production ceilings, deprivation, gradual recovery, output ownership, and one-time legacy progress conversion.
- Identical simulation snapshots at supported 1×/4×/8×/16× speeds, legacy-save initialization, and malformed-state rejection.

Existing cultivation, biological production, water sources/storage/carriers, animal care/upkeep, needs, urgent needs, outside work, physical trade, economy policies, personality, resident agency, downtime, and expressive-motion regressions passed. The site build, JavaScript syntax checks, and whitespace checks passed.

## Desktop evidence

The browser check opens and closes the forecast, clears a failed bed through its visible primary action, inspects animal reserves and watershed levels, opens resident hydration, and reloads without browser exceptions. Forecast bounds are checked at 1000×750 and 1280×720; the main interaction fixture uses 1440×900. Screenshots are stored in [.github/simulation-realism-review](../../.github/simulation-realism-review/).

These are rendered fixture-based interactions. They do not establish normal-speed multi-day browser playability. Climate normals are measured references; weather persistence, hydrology, drought thresholds, hydration, and health coefficients remain disclosed game assumptions. No production deployment or PR merge is part of this evidence.
