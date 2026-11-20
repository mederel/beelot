# Plan: a background music per table theme (US-164)

1. `tools/music/compose.py` and the seven OGG files in `static/music/`.
2. `frontend-tests/music.test.cjs` (fails without `music.js`).
3. `static/music.js`: track, volume, wanted, player with fades and refused-start retry.
4. `index.html` (switch, volume, script), `app.js` (settings, listeners), `app-core.js` (`syncMusic` at each view), `sw.js`.
5. `i18n.js`, `i18n-nl.js`.
6. README (settings, origin of the tracks), backlog.
7. The usual four commands, then the PR.
