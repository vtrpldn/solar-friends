# Neighbours, mutirões, courses and festas

The village has neighbours. They are not residents: they come for an event and leave after it. `village-life.js` owns the rules, `village-life-ui.js` the **Neighbours** screen (key O), and `visitors.js` draws the people who came.

## Why

An ecovila is a community among other communities. These events give the kitchen, the hall, the classroom and the gathering places something to be for, and give the village ways to live that are not selling produce or taking day shifts in town.

## Goodwill

One number, 0–100, starting at 40. It sets how many people come: up to `2 + goodwill/12` neighbours to a mutirão (2–10), up to `4 + goodwill/10` to a festa (4–14), and more course participants. It rises by 5 when a friend returns a day of work, by up to 9 after a festa with neighbours, and by 1 after a course. It falls by 5 when people are called out for nothing or a course collapses, by 2 for each neighbour sent home from a mutirão without lunch, and when festa guests go hungry. Calling an event off before its day costs nothing.

## Events

| Event | When | Where | What it needs | What it gives |
| --- | --- | --- | --- | --- |
| Mutirão | Saturday or Sunday, 08:00–16:00 | A building under construction | Its materials on site; one prepared meal per neighbour at 12:00 | Each neighbour works at 70% of a resident's pace, up to 97% of the building. The village then owes one day of work |
| Weekend course | Saturday or Sunday, 09:00–15:00 | A finished outdoor classroom or community hall | A resident to teach, who is kept from other work; lunch for the participants | R$120 per participant with lunch, R$95 without. 2–12 come. One course a fortnight |
| Festa | Any day, 17:00–21:00 | A finished gathering place, fire circle or community hall | A prepared meal for everyone; 2 pieces of timber for the fire | Company and enjoyment for the friends, memories, and goodwill when neighbours come. In June it is a festa junina and uses 4 kg of sweet corn if there is some |
| Roda | Sunday, 18:00–19:00 | A gathering place | Nothing | The friends who are free sit together; what they say about their own needs is kept as minutes |

A day of work owed is returned by sending a resident from the Neighbours screen. They leave between 08:00 and 11:00 when rested and free, are away for a working day like a town shift, and are not paid. A third mutirão cannot be called while two days are owed.

A course that the teacher attends for less than 40% of its length collapses: fees are returned and goodwill falls.

## Assumptions and limits

- Fees, turnout, the helper pace and every goodwill step are authored estimates, not sourced figures. The course fee is in the range of a day workshop with lunch at a Brazilian permaculture site.
- Neighbours appear at the event and vanish after it. They do not walk in, use toilets or water, or have names.
- A mutirão does not change what the residents themselves choose to work on.
- The roda records worries the residents already have. It does not create decisions, votes or disagreements.
- Residents break off from a festa or roda for hunger, thirst and the toilet, and return while it lasts.
- Guest stays, craft sales and a roadside stall are not modeled.
- In sandbox, events run with unlimited food and no money changes hands.

## Checks

`node scripts/verify-v02-village-life.mjs` plays thirteen days in a village: planning rules, a mutirão, a returned day of work, the Sunday roda, a festa and a taught course, with saves in the middle of each. A second part settles fees, lunches and goodwill exactly in a story village.
