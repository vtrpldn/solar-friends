# Village production, logistics and trade

## Why

In Banished, a long walk between a workplace and storage costs part of a worker’s day. Colonial Charter makes that same day valuable in several places along a production chain. For Solar Friends, the design question is when a village benefits from processing its own resources, buying supplies, or selling a surplus. The answer should depend on its land, available labor, transport and household needs.

## 1. Measure the timber economy

Use the existing timber workbench as the first experiment. It converts six raw wood into four timber, which can supply construction or feed the plank recipe. Start with a seeded village and a fixed quantity of timber required at a construction site. Save before allocating labor or ordering supplies. Run the same demand through local felling and milling, a resident pickup in town, and paid freight. Use ordinary work orders and purchases so the comparison includes competing jobs, rest and deliveries.

For each run, record delivered units, time until the last delivery, resident-hours spent processing, hauling and driving, cash spent, and food and water reserves. Report the workbench setup cost separately. Repeat with the workbench already available and with demand large enough to require several loads. The deliverable is a table that shows what the village spends to get usable timber to the site.

## 2. Establish which layout decisions matter

On the same map, vary the distance between the trees and the delivery point while holding the order, crew and initial stocks fixed. Then vary town distance alone. Record the actual path, loads and travel time. Ask whether moving a workbench or adding storage changes the route residents actually use. If all output goes to a common destination, document that constraint before designing a placement benefit.

Check that extra walking consumes resident time and that partial loads survive a save and reload. Trace one delayed batch through the desktop interface. If the delay is hard to diagnose, expose its observed cause where the player inspects the order, such as timber awaiting pickup or a driver already on another trip. Validate by changing that one constraint and observing the next batch.

## 3. Test competing uses of a harvest

Choose an existing crop with verified paths to household consumption, preservation and sale. Begin each run with the same harvest, food ages, reserves and buyer terms. Compare keeping it fresh, preserving a batch and selling the surplus. Follow each run through the fresh stock’s spoilage window. Count meals supplied, spoilage, processing inputs, resident-hours, export receipts and subsequent food purchases.

Check material accounting across storage, processing and cargo. A reserved unit has one destination, processing consumes the recipe inputs, and a sale earns the quoted amount on delivery. A protected food reserve should still be available when residents need to eat. Use these checks to investigate any apparently profitable strategy that leaves the village buying its next meals.

## 4. Test specialization across seasons

Compare villages that dedicate spare labor to timber or food production with a village that buys more of its supplies. Use the same starting village for each comparison. Repeat across representative biome and town-distance settings, through both a productive period and a lean period. Record which weather and growth rules actually affected each run. Track days of food and water remaining, missed upkeep, net cash after imports, and labor left for construction.

Publish the conditions under which each strategy is viable and identify any strategy that wins across all tested conditions. Investigate the cause before tuning yields or prices. A scarce water supply, a slow trip or limited buyer demand each calls for a different design change.

## First implementation milestone

Deliver the timber comparison and one desktop replay of a measured bottleneck. A player should be able to inspect a delayed load, predict what would change delivery time, and try that change in the same save. Use the measured result to decide whether the next work belongs in routing, economic calibration or the order interface. Expand to food and seasonal comparisons once the timber results can be reproduced.

[Production recipes](../web/v02/weekend/catalog-rules.js) · [Gameplay controls](../web/v02/weekend/README.md) · [Simulation lab](simulation-lab.md)
