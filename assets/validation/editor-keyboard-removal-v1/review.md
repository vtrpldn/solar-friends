# Keyboard removal and visible selection

Why: Delete/Backspace should use the same cancellable heavy-map edit path as the visible controls. Cancellation or worker failure must preserve the selected object and exact checkpoint; selection should clear only after successful removal. Newly selected object details should be visible even after scrolling through route controls.

The window keyboard handler now awaits prepared map edits for routes, battery banks and material plots. Successful route removal includes dependent pump cables, as before. Existing text-input/modal/busy guards remain. A changed nonempty selection brings its inspector heading into view without moving keyboard focus.

Six trusted-key cases pass on a native-valid 256-building/1000-nature/64-route fixture: Delete and Backspace for a fresh-water line/dependent cable, independent bank and timber plot. Each case cancels with Cancel/Escape, waits beyond the delayed worker window, aborts a real worker request, then succeeds with exactly one history step and exact Undo/Redo. Canceled/failed checkpoints, selected IDs and labels are exact; success clears selection. Further Delete while preparation is open creates no second edit. Selected headings are verified within the inspector viewport. Text Backspace changes only the uncommitted title; restoring the text retains the exact checkpoint/asset selection. Reload preserves the draft and selected bank. No page errors, bounded cleanup completes before success is recorded.

Final synchronous portions of the trusted keyboard handlers peak at 4.9 ms, with separate native restoration 8.8–19.8 ms and no measured main-thread scenario compilation. This is not total latency or hardware pacing acceptance.

The ordinary keyboard-focus regression passes modal Tab containment, Escape/focus return, native text Undo isolation and canceled brush isolation. Its journal-close assertion now waits up to one second for the native close event to restore focus instead of racing that event. The ordinary material-site authoring regression also passes placement, phases/policies/wetness, invalid repair, copy/move/removal/history, mapped extraction, export/reload and native playtest/checkpoints.

The first timber target was outside the visible isometric viewport at the fixture zoom. The test now checks pointer bounds and selects a visible cell in the same plot footprint. Both final full desktop captures individually inspected: bank controls visible above the long pipe editor and restored journal-button focus. Crowded content is a stress fixture, not artwork acceptance.

Not every site/material, referenced equipment/goal, ordinary-map asset deletion, maximal history, sustained memory/performance or unfamiliar-player flow. Those broader release gates remain.
