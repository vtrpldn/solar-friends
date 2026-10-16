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


## Standalone PR #64 result

Residents skip unnecessary scheduled meals, respond to serious hunger during work, use milk and honey in their reserve decisions, and respect outside shifts during long social breaks. Reachable ripe plots can refill a low pantry before wild foraging. Dry crops still receive care with a full pantry; overdue animals receive higher work priority. Full harvest stores expose a blocker, and work offers explain their purpose in Dev Tools.

Ten counterexamples fail against the parent engine. The changed engine passes all 489 native tests, strict all-target lint, 166 JavaScript syntax checks, 60 public regression scripts and 196 desktop captures without browser errors. The four-day competing-needs run completes its project and accepted request; eighteen days of farming and three twenty-four-day economic cases keep needs healthy and resource accounts balanced. Each resident retains majority waking village leisure.

Existing earned Story checkpoints were replayed for UI checks. The fresh full campaign, eighty-four-day seasonal extension and paired utility comparison were not rerun. Matching build identity, exact scope and metrics are in `.github/resident-decisions-review/results.json`.

GitHub's hosted job did not start because of account billing limits. PR #64 remains a draft and has not been merged.

## Integrated release

The behavior is incorporated into PR #63 and verified with the full simulator/Story release: 507 native tests, strict all-target lint, 175 current script syntax checks, all 67 public gameplay/art verifiers and 200 desktop captures without browser errors. The mixed-needs scene visibly chooses rest, a meal, company, dry-crop care and an outside shift for different residents; its project and accepted request finish while preserving majority individual waking village leisure. The two fresh campaigns, five earned housing paths, 84 seasonal days and both paid 24-day utility cases pass on the same native engine.

The final food measurement includes all four directly edible kinds. At a reproduced moment with no ingredients or prepared meals, four milk and nine honey remained and a real request claimed milk. Residents therefore do not manufacture a food emergency while usable dairy or honey is available. Final build identities, screenshots and the exact carried/repeated verification scope are in [.github/story-review/results.json](.github/story-review/results.json). PR #63 remains draft and unmerged; hosted CI could not start because of account billing/spending limits.
