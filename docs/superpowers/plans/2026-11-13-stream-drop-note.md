# Plan: the live table says when it is reconnecting (US-142)

1. Stories US-141 (delivered) and US-142 in the backlog, and a phase 15 row.
2. The drop timer, the `streamDropped` flag and the clearing paths in `app-core.js`; `apiJson` respects the flag.
3. `stream-drop.test.cjs`.
