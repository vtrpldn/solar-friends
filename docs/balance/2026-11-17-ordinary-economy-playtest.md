# Ordinary economy playtest — 17 November 2026

## Why

Check the actual player interface and early decisions separately from accelerated simulation and injected diagnostic fixtures.

The session began at 05:47 UTC on the local `/v2/?mode=story` page, at normal 1× speed. Menus pause the village. The session ended at 06:46 UTC (59 minutes wall time), interleaving UI play with implementation and diagnosis. This is approximately a first-hour observation, not 60 minutes of uninterrupted player attention.

- First test: chose a custom tent site, placed water storage, toilet, shelter, protected stores and gathering place through the build menu. Water storage completed by Day 1 11:22; other residents carried supplies and built the toilet. Cash remained R$1,714.48 at 11:31. This used the preceding timber/tank prices.
- Found a reproducible restart defect: New village called `createWeekend()` without a fresh seed. The zero-seed legacy map contained no natural extraction projects. Fixed both story and sandbox restart; regression checks fresh deposits and restoration. Restarted the disposable test village through the UI to verify.
- Corrected restart: the Resources screen lists four earth deposits and four stone outcrops, with coordinates and distance from stores. The nearest stone site is 13 cells away; others require longer hauling. Earth output and targets display in kilograms, including 240 kg per extraction batch and a 480 kg target.
- Pitched tents on clear ground near the entrance, then planned water, toilet, shelter, protected stores and gathering place. The rejected first camp location left an obsolete error toast after successful placement; corrected that feedback.
- Day 1 11:16: water storage complete, toilet 28%, shelter supplies 7/12 loads with two moving. Cash R$1,722.24; food 20 meals plus 12 ingredients; water 33. The player can inspect crew counts and assembly estimates. No test inventory or funds injected.
- Enabled Bento's optional carpentry job for subsequent mornings. The profile explains four hours, R$100 gross, R$8 commuting cost and the morning/rest requirement. Remaining friends continue camp construction.

 Later calibrated wood/tank prices require a new budget report; these observed purchases must not be represented as purchases at the later rates.

At Day 1 15:58, the toilet and water storage were complete; shelter was 86% with three builders and about half a game-hour of assembly left. Food remained 19 meals + 12 ingredients, cash R$1,722.24, but water had declined to 16 L. The Water dialog clearly showed that routine collection was off. Enabled drinking-water maintenance for the new tank and sanitation maintenance for the toilet through their respective controls; no direct state edits.


By Day 1 20:48 all five camp structures were complete. Water recovered to 48–66 L through resident collection and purification; all five residents were resting in tents by 22:57. Used the ordinary 4× control overnight, not the lab. At the final pause, Day 2 21:30, cash was R$1,721.63, food five meals plus 12 ingredients and clean water 85 L. Residents were eating, fetching water and resting. Bento's outside-work toggle remained enabled but no payment had arrived in this observed window; a toggle is not evidence of a completed shift.

The first evening did not require repeated manual water orders after the reserve was enabled. New tanks and sanitation now enable those routines by default, while preserving explicitly disabled controls. Building choices and shortages were inspectable through Projects and management screens. Nighttime involved waiting and the player selected 4×; this is evidence of available pacing control, not a claim that the long-term game is proven fun.

A second restart defect was found: New village could overwrite the active named slot. The handler now saves and detaches the old slot before starting another village. Verified through UI: named the current village “Ordinary economy playtest — preserved”, started another village, then loaded the named village and recovered Day 1 20:39, R$1,722.16, 15 meals + 12 ingredients and 49 L water. Continued that restored village to the final observation. The earlier disposable test slot was affected before the repair; no claim is made that it was recovered.

Proof images: [restored village](evidence/2026-11-17-preserved-village.jpg) and [final first-hour view](evidence/2026-11-17-first-hour.jpg). The local tab is left paused. Earlier purchases used preceding prices; the separate current-price bootstrap matrix is the budget evidence.

After the final simulation fixes and rebuild, reloaded the same browser tab. The village restored Day 2 21:30, R$1,721.63, five meals plus 12 ingredients and 85 L water. Paused again at 21:33; [updated-build screenshot](evidence/2026-11-17-final-build-restored.jpg). Reload resets the viewing speed to 1×; stock, time and cash were preserved.
