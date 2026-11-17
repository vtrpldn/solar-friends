# Logistics, care and outside income

## Why

Long crop growth needs a practical source of interim income. Transport and routine care must continue without tying the entire community to one vehicle or repeated manual orders.

## Implemented behavior

Resources → Village work & trade offers an optional minimum cargo fill and maximum game-hour wait for automatic construction pickups and exports. A Send waiting loads now override releases pending loads early. The default zero threshold preserves immediate blueprint pickup; essential food shopping and explicit manual trips bypass consolidation.

Both cars can carry independent orders with separate drivers. Each manifest owns its quantities, and both survive save/load. Paid supplier delivery is an alternative for purchases: a 5,000 kg / 12 m³ load, six hours handling plus the selected town travel time, and R$35 plus R$0.80 per round-trip kilometer. These are scenario assumptions, not supplier quotes. Exports still require a resident trip. Goods arrive physically; freight is paid once and protected from other spending.

Residents can opt into individual outside jobs. A four-hour weekday shift pays R$80–100 after returning, costs R$8 commuting, and consumes energy. Departure requires adequate needs and energy. These are authored part-time contracts, not a wage survey. Disabling a job does not cancel a shift already underway.

Completed equipment wears over time; vehicles wear with distance. Automatic service uses stored tools and fasteners, a daily materials allowance and resident labor. The allowance limits materials consumed, not an additional cash charge. Service warnings explain missing supplies or inaccessible work positions. Condition affects generation and treatment throughput. Battery units now consistently store 4 kWh each and solar panels provide 0.6 kW peak each. Battery capacity declines to 80% over eight game years; automatic replacement needs a stored battery, electrical supplies, a sufficient daily service allowance and resident installation. These are engineering assumptions, not equipment warranties. Pumps, roofs and panels also have lifetime replacement work with real parts; vehicle purchase/replacement and tax depreciation are outside the current model. Unaffordable service jobs no longer prevent affordable animal care later in the queue. Finances lists each pending job, its parts and a location shortcut.

Hens and goats require periodic resident care, fodder and water even when production is idle. Neglect reduces health and output. This remains active independently of the equipment-maintenance toggle.

New starts have R$500 / R$2,000 / R$6,000 working capital for tight / modest / comfortable settings. Land and cars are already owned. Existing saves retain their balance. An 18-case automated three-day fresh-start matrix completed basic infrastructure across all three biomes, three capital levels and near/remote access. This is not normal-speed browser evidence or a claim about the cost of establishing a real ecovila.

## Evidence and limits

Focused regression scripts exercise concurrent trips, paid freight, deferred outside wages, biological growth, animal care, maintenance and save restoration. They include diagnostic fixtures and therefore do not establish first-hour playability or long-run economic viability. Full-catalog normal construction, regional calibration and seasonal balance remain separate release gates in the main plan.

## Production loads and local buyers

Production returns use at most 30 kg and 0.12 m³ per hand-carried load. Residents walk back for remaining output; a 72 kg timber batch takes three deliveries. Partial batches remain owned, retain food age, and persist across reload. These are authored carrying limits. Oversized indivisible output blocks with an explanation rather than bypassing capacity.

Town produce, café, builders’ cooperative, smallholders’ cooperative and hardware resale buyers now have explicit per-resource daily limits and two disclosed price bands. Additional batches earn less, quotes lock on reservation, cancellation releases demand, and the next calendar day renews it. Terms appear in resource tooltips. These are transparent game contracts, not researched farm-gate prices. Supplier names identify the food market, agricultural store or hardware store; supplier stock is still assumed available at the posted retail price.

Equipment and roofs now also have finite replacement lifetimes: ten years for pumping equipment, twenty for roof materials, twenty-five for panels. Automatic jobs consume the actual replacement materials, respect the allowance and require 13.5 resident-hours. Routine service restores condition without resetting this lifetime clock. These intervals and work estimates are engineering/game assumptions; no vehicle replacement market is implemented.

The calibrated catalog run exposed a separate access problem: buildings could surround the original camp and occupy its tent doors. New blueprint validation preserves reachable camp entrances. Older layouts can use another accessible edge of the same tents. `verify-v02-camp-access.mjs` replays the captured exhausted village for three days with no stock/cash injection and checks sleep/food recovery and restoration.


Camp drinking reserves, newly completed water storage/cistern reserves and sanitation now default to automatic maintenance. Explicitly switching a routine off remains saved. This closes the normal-play gap where animals could wait indefinitely for drinking water while every tank routine was left off. Water still requires a reachable source, hauling/purification work and available residents; the default does not grant free water.
