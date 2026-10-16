# Everyday resident decisions

Why: personal needs, existing food production and commitments should make residents reconsider work sensibly, while keeping time for hobbies and the village projects the player approved.

- [x] Reproduce unnecessary meals, ignored hunger during work, and farm care losing to construction.
- [x] Give pressing needs precedence, preserve outside commitments, and let existing recovery and bounded requests finish.
- [x] Prioritize vulnerable crops and overdue animal care over optional expansion, using actual reachable work and existing reservations.
- [x] Count directly edible dairy and honey in food decisions and explain blocked meal requests.
- [ ] Verify competing needs, farm/project progress, exact saved continuation and conservation in the release engine and desktop preview.

Story progression work remains on its existing branch. This change builds on the saved Sandbox rules in PR #62.

Focused counterexamples reproduce ten failures against the parent engine. The changed engine passes those cases and all 489 native tests, strict all-target lint and formatting. Release gameplay and desktop checks are still running.
