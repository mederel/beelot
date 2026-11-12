# Populate the GitHub Pages site (US-132)

- Source: `pages/index.html`, `site.css` and `site.js`, hand-written, no generator. The folder is `pages/` because the
  release workflow already writes its output to `site/`.
- Build: `build-apt-repo.sh` copies them, with `docs/images/{home,bidding}.jpg` and `logo.svg` as `images/`, to the root
  of the output beside `dists/`, `pool/` and `beelot.asc`, so one deployment serves both. `{{VERSION}}` becomes the
  newest package's version (`sort -V`). `BEELOT_PLAY_URL` (the repository variable, no trailing slash) fills
  `{{PLAY_URL}}`; when it is unset the lines marked `data-play` (play, rules, privacy of the hosted game) are left out.
- Page: what Beelot is, the two screenshots with captions, links to the latest release and its notes, the source and
  the hosted game, and the apt commands in a block with a copy button (shown only when scripts run).
- Languages: every text is given as `<span lang="en|fr|nl">`; CSS shows the one in `html[data-lang]`. `site.js` picks
  the browser's language and switches on the EN/FR/NL buttons. Without scripts the page is English.
- No external requests; colours from the game's theme; responsive grid; landmarks, a skip link, visible focus, 44 px
  controls.
- Tests: `frontend-tests/site.test.cjs` (install commands equal the README's, no external resource, links on an allow
  list, three languages everywhere, placeholders), run by the `package` job; `test-apt-repo.sh` checks the page is
  deployed beside the apt files, names the newest release, and has the game's links only when configured.
- Not done: an automated accessibility audit (axe or similar) is not in CI; the contrast and structure were chosen by
  hand. The shell parts could not be run end to end here (no `apt-ftparchive`); the page-building block was run alone
  on stub packages, and CI is the first full run.
