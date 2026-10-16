---
description: Resident needs, farm care, outside commitments and useful autonomous project work, with focused and long-running evidence.
---

# Everyday resident decisions

Why: personal needs, existing food production and commitments should make residents reconsider work sensibly, while keeping time for hobbies and the village projects the player approved.

- [x] Reproduce unnecessary meals, ignored hunger during work, and farm care losing to construction.
- [x] Give pressing needs precedence, preserve outside commitments, and let existing recovery and bounded requests finish.
- [x] Prioritize vulnerable crops and overdue animal care over optional expansion, using actual reachable work and existing reservations.
- [x] Count directly edible dairy and honey in food decisions and explain blocked meal requests.
- [x] Verify competing needs, farm/project progress, exact saved continuation and conservation in the release engine and desktop preview.

Story progression work remains on its existing branch. This change builds on the saved Sandbox rules in PR #62.


## Result

Residents skip unnecessary scheduled meals, respond to serious hunger during work, use milk and honey in their reserve decisions, and respect outside shifts during long social breaks. Reachable ripe plots can refill a low pantry before wild foraging. Dry crops still receive care with a full pantry; overdue animals receive higher work priority. Full harvest stores expose a blocker, and work offers explain their purpose in Dev Tools.

Ten counterexamples fail against the parent engine. The changed engine passes all 489 native tests, strict all-target lint, 166 JavaScript syntax checks, 60 public regression scripts and 196 desktop captures without browser errors. The four-day competing-needs run completes its project and accepted request; eighteen days of farming and three twenty-four-day economic cases keep needs healthy and resource accounts balanced. Each resident retains majority waking village leisure.

Existing earned Story checkpoints were replayed for UI checks. The fresh full campaign, eighty-four-day seasonal extension and paired utility comparison were not rerun. Matching build identity, exact scope and metrics are in `.github/resident-decisions-review/results.json`.

GitHub's hosted job did not start because of account billing limits. PR #64 remains a draft and has not been merged.
