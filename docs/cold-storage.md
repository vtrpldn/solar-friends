# Kitchen cold storage — 2026-11-17

## Why

Food storage now offers an infrastructure tradeoff: spend materials and resident work on refrigeration, then pay for electricity to reduce spoilage. Capacity remains limited and outages matter.

## Behavior

Select **Install kitchen cold storage** under a completed kitchen in Resources. Installation consumes one refrigeration kit, one electrical supply and one fastener pack, requiring 120 work units (54 base game person-minutes). A resident performs the work; installation itself does not require electricity. It cannot repeat or be installed twice on the same kitchen.

Each enabled, powered installation cools up to 40 available food units. Their remaining shelf life decreases at one-quarter speed. Cooling never restores freshness or rescues already-expired food. Existing chilled lots retain priority, then the earliest-expiring food fills remaining space. Dried provisions, reserved goods and carried cargo do not occupy cooling capacity.

Cooling draws an average 0.08 kW even when empty while switched on. The kitchen has a separate cooling switch; closing the whole kitchen also stops refrigeration. Outages and insufficient power return food to ordinary aging. Grid costs use the existing metered billing and protected collection budget.

This is shared-pantry allocation, not physical transport to an individual refrigerator. There is no thermal inertia, ambient-temperature modifier, maintenance cost or refrigerator model inside the kitchen yet. Kit price (R$600), cargo size (35 kg / 0.35 m³), capacity and aging coefficients are provisional game values, not calibrated Brazilian appliance data. Sandbox disables spoilage.

## Evidence

`node scripts/verify-v02-cold-storage.mjs` covers finite capacity, outages, switching off, expired and preserved exclusions, resident installation without power, material consumption, duplicate/repeat protection, grid billing and save validation. This uses a diagnostic kitchen fixture, not a new-game affordability run.

Food storage, preservation, procurement-budget, physical trade, construction migration and lab scheduling checks pass. `docs/balance/2026-11-17-cold-storage-soak.json` records a three-day continuation of the established Day 61 village; it is a regression replay, not a long-term refrigeration balance test. The resource icon and installation controls were inspected in the in-app browser.

The full realistic-economy plan remains in progress.
