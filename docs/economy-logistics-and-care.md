# Logistics, care and outside income

## Why

Long crop growth needs a practical source of interim income. Transport and routine care must continue without tying the entire community to one vehicle or repeated manual orders.

## Implemented behavior

Resources → Village work & trade offers an optional minimum cargo fill and maximum game-hour wait for automatic construction pickups and exports. A Send waiting loads now override releases pending loads early. The default zero threshold preserves immediate blueprint pickup; essential food shopping and explicit manual trips bypass consolidation.

Both cars can carry independent orders with separate drivers. Each manifest owns its quantities, and both survive save/load. Paid supplier delivery is an alternative for purchases: a 5,000 kg / 12 m³ load, six hours handling plus the selected town travel time, and R$35 plus R$0.80 per round-trip kilometer. These are scenario assumptions, not supplier quotes. Exports still require a resident trip. Goods arrive physically; freight is paid once and protected from other spending.

Each resident can book one eight-hour shift in town for the next morning they can leave. Shifts pay R$160 for Iara or Luz, R$180 for Nina and R$200 for Bento or Cauã. The village receives the wage when the resident returns. A round-trip bus ticket costs R$8. If cash is short, the employer deducts the ticket from the wage on return. Residents can instead take recurring four-hour weekday shifts at the same hourly rate. A one-day booking takes priority, and a resident can only work one shift per day.

These contracts use the game’s existing R$20–25 hourly rates. As a regional comparison, Easy Freela reports R$120–150 per shift for freelance kitchen assistants in Campinas. The five in-game rates are scenario estimates. [Easy Freela’s Campinas shift survey](https://easyfreela.com/freelancer-campinas/)

Completed equipment wears over time; vehicles wear with distance and, parked in the open, with weather: an authored 30 condition points a year (about one extra service per car). A car shelter built over the parking clearing cuts that weathering to a third; it has one fixed site and is built like any other project. Automatic service uses stored tools and fasteners, a daily materials allowance and resident labor. The allowance limits materials consumed, not an additional cash charge. Service warnings explain missing supplies or inaccessible work positions. Condition affects generation and treatment throughput. Battery units now consistently store 4 kWh each and solar panels provide 0.6 kW peak each. Battery capacity declines to 80% over eight game years; automatic replacement needs a stored battery, electrical supplies, a sufficient daily service allowance and resident installation. These are engineering assumptions, not equipment warranties. Pumps, roofs and panels also have lifetime replacement work with real parts; vehicle purchase/replacement and tax depreciation are outside the current model. Unaffordable service jobs no longer prevent affordable animal care later in the queue. Finances lists each pending job, its parts and a location shortcut.

Hens and goats consume stored feed and water daily, even when collection is idle. Resident care refills those reserves; it does not immediately heal animals. Neglect reduces health and accumulated output. This remains active independently of the equipment-maintenance toggle.

New Story villages start with R$3,000 (tight), R$10,000 (modest) or R$20,000 (comfortable). The friends already own their land and cars. With standard camp supplies and normal town access, the starter studio requires R$8,110 in materials and R$333.68 for collection. The modest start covers that bill and keeps R$1,556.32 for other expenses. Existing villages keep their saved balance.

## Evidence and limits

Focused regression scripts exercise concurrent trips, paid freight, deferred outside wages, biological growth, animal care, maintenance and save restoration. They include diagnostic fixtures and therefore do not establish first-hour playability or long-run economic viability. Full-catalog normal construction, regional calibration and seasonal balance remain separate release gates in the main plan.

## Production loads and local buyers

Production returns use at most 30 kg and 0.12 m³ per hand-carried load. Residents walk back for remaining output; a 288 kg managed timber harvest takes multiple deliveries. Partial batches remain owned, retain food age, and persist across reload. These are authored carrying limits. Oversized indivisible output blocks with an explanation rather than bypassing capacity.

Town produce, café, builders’ cooperative, smallholders’ cooperative and hardware resale buyers now have explicit per-resource daily limits and two disclosed price bands. Additional batches earn less, quotes lock on reservation, cancellation releases demand, and the next calendar day renews it. Terms appear in resource tooltips. These are transparent game contracts, not researched farm-gate prices. Supplier names identify the food market, agricultural store or hardware store; finite supplier allocations are reserved when purchasing and replenish each game day.

Equipment and roofs now also have finite replacement lifetimes: ten years for pumping equipment, twenty for roof materials, twenty-five for panels. Automatic jobs consume the actual replacement materials, respect the allowance and require 13.5 resident-hours. Routine service restores condition without resetting this lifetime clock. These intervals and work estimates are engineering/game assumptions; no vehicle replacement market is implemented.

The calibrated catalog run exposed a separate access problem: buildings could surround the original camp and occupy its tent doors. New blueprint validation preserves reachable camp entrances. Older layouts can use another accessible edge of the same tents. `verify-v02-camp-access.mjs` replays the captured exhausted village for three days with no stock/cash injection and checks sleep/food recovery and restoration.


Camp drinking reserves, newly completed water storage/cistern reserves and sanitation now default to automatic maintenance. Explicitly switching a routine off remains saved. This closes the normal-play gap where animals could wait indefinitely for drinking water while every tank routine was left off. Water still requires a reachable source, hauling/purification work and available residents; the default does not grant free water.

## Resident hydration

Each resident has an individual hydration meter and visits reachable potable-water stores to drink. Drinking consumes 0.5 L per action, creates no immediate greywater, and does not require wastewater capacity. The baseline is 2.5 L/day, increased by physical work and heat up to 5 L/day. These are authored game parameters. Low hydration slows productive work but leaves movement and essential water work available. Residents wake for urgent hydration.

Town drivers pack at least 0.5 L, increased for trip duration, from camp water. Packed water remains on the resident until drunk and survives reload. Employers supply hydration during outside jobs. A village shortage warning names residents who cannot satisfy hydration; absent residents do not consume camp water.
