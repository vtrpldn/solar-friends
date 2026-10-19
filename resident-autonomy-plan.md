# Resident autonomy

Why: residents should make understandable choices about their own needs and the village, and carry out useful intentions instead of bouncing between timers.

- [x] Give recovery and social breaks sensible stopping points; notice pressing needs during leisure as well as work.
- [x] Let residents finish a short, useful piece of work at a break without missing sleep, outside jobs, or urgent needs.
- [x] Avoid beginning voluntary work whose journey cannot fit before the next break.
- [x] Explain decisions through existing resident activity text and work offers.
- [x] Verify competing needs, project progress, interruptions, saved continuation, and desktop gameplay.

Builds on the equipment-upkeep branch. Keep community leisure time and the existing material, food, water, and energy accounting intact.

## Delivered behavior

Residents finish recovering before taking more chores, seek company when lonely, and prepare for errands that would otherwise force a meal or rest interruption. Serious hunger can interrupt extended rest once they have enough energy to walk. Sleep and outside commitments still take precedence.

The same reachable work queue now wakes idle residents for newer farming and production jobs. Existing projects receive a small continuity preference. Residents avoid starting journeys without time for useful work before the next break; nearby carried materials and water, or an attended work section, can finish within a fifteen-minute allowance. Bounded compost supplies precede optional pantry top-ups so soil projects have their prerequisites.

## Checked result

The matching release passes 444 native tests, strict lint, formatting, 156 JavaScript syntax checks, all 60 gameplay checks, and 179 desktop captures with no browser errors. A fresh thirteen-chapter Story completes on day 132. Four days of competing needs complete both the village project and an accepted request after social recovery, preserving majority waking village leisure. The unchanged stalled Story recovers its compost in 12.3 game hours without authored resources.

An additional 84 seasonal days and the paid 24-day manual/connected utility comparison preserve resident needs, useful production, exact saves and material, liquid and energy accounts. The connected comparison continued from its earned installation checkpoint after the initial runner limit; the manual result and both native saves were rechecked. Extended seasonal and utility checks now have a thirty-minute runner budget, retaining their game-day bounds and assertions. Matching metrics and build identity are in `.github/resident-autonomy-review/results.json` and `artifacts/autonomy/release-report.json`.

GitHub's hosted job cannot start because of account billing limits. PR #59 remains a draft and has not been merged.
