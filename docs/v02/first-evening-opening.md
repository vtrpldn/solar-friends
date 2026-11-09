# First evening: a playable planning loop

> Historical v2 iteration record. Opening goals, catalog counts and behaviors describe that iteration, not the current release. See the [current v2 guide](../../web/v02/weekend/README.md) and [later catalog playthrough](../playtests/2026-11-08-regular-catalog.md).

## Why

The opening should reward making a place for friends, not waiting for arbitrary day changes. It now asks for three outcomes: a gathering place, dry communal cover and protected supplies. They can be built in any order or location that preserves access. The full catalog remains available.

## Decisions

The group brings 36 timber, eight roof sheets, one spare tarp and R$220. The gathering table needs eight timber and one fastener pack; it no longer consumes a tarp.

- Shared rain tent + covered supply rack: quick, keeps money available, adds storage; the temporary cover adds no beds.
- Permanent shelter + tarp-covered supplies: more labor, uses all initial timber, preserves money; the tarp cover adds no storage capacity.
- Permanent shelter + covered rack: requires more timber and roofing. Buying both batches spends R$165 and sends a resident away for each trip.

Every option reserves actual materials and requires delivery and construction by residents. An exposed entrance campsite can still use the existing boards/uphill response. Completing protected storage also resolves that exposure. A shower starts after four active minutes, with a 20% construction slowdown while communal cover is missing. It does not destroy stock or impose a fail deadline.

## Feedback and payoff

The journal opens after choosing camp. A compact goal button keeps it discoverable. Suggestions disappear once their outcome is planned, and work cards distinguish hauling from assembly. Resident comments mark completed needs. Dinner becomes available when all three are met, the town traveler is back, and any exposed supplies are resolved. The ending summarizes temporary/permanent choices, trips and remaining funds. Continue building returns to free play.

Existing saves without the opening marker retain their former ending conditions. New progress, choices and trip counts persist in saves.

## Evidence and limits

`node scripts/verify-v02-opening.mjs` completes temporary, permanent and investment routes, checks scarce tarp rejection without deductions, exposed-site rain, save restoration and goal gating. Immediate-plan scripted routes take about five to eleven active minutes including procurement; this measures simulation work, not a human first-session duration or enjoyment. A browser playtest completed arrival, camp choice, all three temporary-route placements, construction and dinner without spending money.

This is a focused iteration toward a 20–30 minute first session once exploration and decisions are included. That human playtime target and whether the tradeoffs feel fun still need player feedback. There is no new relationship, skill or conversation simulation.
