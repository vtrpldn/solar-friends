# Heavy starting-storage editing

Why: opening storage panels and preparing distribution on large maps should remain responsive, cancellable and lossless. Canceling an edit should restore the selected allocation and, when applying a preview, the original preview.

Heavy supply/liquid lookups now run in disposable workers, cached by exact source. Closing a pending panel or replacing its source terminates old work. Loading forms are inert; failed reads expose Retry. Small maps retain immediate native queries. Heavy distribution previews use separate cancellable preparation; stale source results cannot open an applicable preview. Heavy edits use the shared validated commit path and restore allocation/preview state on cancellation.

A generated Caatinga fixture reaches 256 mixed buildings, 1000 explicit macambira objects and 64 installed electrical routes. Public browser checks pass close/late-result isolation for both panels, source replacement, real failed-worker Retry with unchanged playable checkpoint, and Cancel/Escape for distribution preparation. Ten edit cases each pass exact canceled checkpoint/control/allocation/preview, one-step undo/redo and reload: materials, food age, supply removal/owner merge/distribution, fresh/grey water, tank removal/owner merge/distribution. Expected distributions come from independent native queries on the baseline. Food amounts/ages and liquid classes stay distinct. All 102 observed query workers terminate. No page errors; bounded server/context/browser cleanup completes before success is recorded.

Final measured handlers peak at 4.0 ms; separate native restoration samples are 8.8–9.5 ms. No main-thread storage query or scenario compilation appears in measured phases. These are handler observations, not total latency or physical display pacing. Controlled query cache/stale/cancel/retry/malformed/timeout tests pass. Ordinary supply and liquid editor regressions pass capacity/shortage, merge/history, export/reload, isolated playtesting and exact physical stored contents/accounting.

All three full desktop captures were individually inspected: readable Retry states and distribution contents/food ages/liquid classes with accessible action placement. The crowded background is a stress fixture, not art acceptance.

Not every heavy material/batch/container, shortage/invalid draft, biome or running logistics outcome; maximum history, sustained pacing/memory, broad art and unfamiliar-player gates remain open.
