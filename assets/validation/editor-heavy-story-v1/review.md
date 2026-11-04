# Heavy journal and event edits

Why: chapter, goal, challenge, role and event edits must remain cancellable on large maps. Canceling must preserve both the exact checkpoint and the selected chapter/open editor. Removing the optional journal must actually delete it.

Ten public browser cases pass on a generated Cerrado fixture with 256 mixed buildings, 1000 authored natural objects and 64 electrical routes. Every case cancels without changing its checkpoint, visible control, selected chapter or modal-open state, then succeeds as one exact undo/redo step. The run checks chapter naming/addition, goal targets/addition, challenge enabling, journal removal, role/event addition, message changes and event removal, followed by exact reload.

The removal case exposed a shared prepared-edit bug: Object.assign retained deleted root keys. Prepared commits now remove absent root keys before assigning the exact prepared definition. The 14-case maximum-map region/geology/arrival/shared-memory regression passes after this fix. Ordinary event-authoring/native-playtest and reversible-journal tests pass too.

Final measured story handlers peak at 2.9 ms, with separate native restore samples 8.7–19.9 ms and no measured main-thread scenario compilation. Server, context and browser cleanup complete before success is recorded. Full final desktop event capture individually inspected; lower event controls remain in the intended scrollable form above the footer. This is not broad visual or art acceptance.

Scope remains ten cases in one biome: not every condition/effect/speaker/role binding, invalid dependency, running story outcome, maximum history, sustained hardware/memory or unfamiliar-player walkthrough.
