# Worn-pump rerouting and multiple feed repair

Why: inherited equipment wear must not prevent route planning or disappear when its pump is rerouted. Multiple cables feeding a moved pump must remain individually repairable without silently removing authored connections or allowing duplicates.

Reproduced the original failure with a valid authored 37% pump: the temporary planning definition removed its route but retained the now-missing pump's wear record, making native endpoint discovery reject it. Planning now excludes only wear belonging to temporarily omitted pumps. Actual draft wear, global service policy and unrelated equipment remain unchanged, including a workshop sharing the same text ID.

The maximum fixture exposed three power feeds and a second deadlock: native compilation stops at the first broken cable, so editing another cable still could not open its ports. Temporary planning now omits sibling cables feeding the same pump. The actual draft retains them until individually edited. A full-draft duplicate check guards preview, drawing and save, including reversed electrical pairs, while typed endpoint identities and water direction remain distinct. Drawing while ports are still loading now returns a clear instruction without parsing empty selectors or changing the draft.

Six native condition/deferral variants pass at 0/37/100% with source/policy preservation. Public ordinary (6 buildings, 4 routes) and combined maximum (256 buildings, 1000 natural objects, 64 routes) checks each perform one actual four-cell reroute and three individual feed repairs. Every edit has exact undo/redo; duplicate siblings are rejected without a checkpoint change. Maximum-map pointer drawing during a delayed port lookup is harmless. Exact editor reload, actual isolated playtest, native 37% condition/manual deferral, zero inherited use/exposure/repair jobs/material grants, exact maintenance checkpoint reload and unchanged editor return pass in both contexts. Both contexts and the browser/server finish bounded cleanup before success is recorded.

The existing 13-group maximum five-class route regression passes again. Two final full desktop repaired-connection captures were individually inspected. These are layout/context observations, not broad artwork or sustained performance acceptance.

Not every pump class/condition in live play, unrelated invalid draft, equipment transition, actual repair work or simulation duration. Keyboard deletion paths, maximum history, sustained performance/memory, broad art and unfamiliar-player release gates remain separate.
