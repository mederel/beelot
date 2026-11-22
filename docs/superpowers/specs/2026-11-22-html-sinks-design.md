# Design: keep the player token safe in the page (US-195)

## Goal

The content security policy (no inline script, no `eval`, own origin only) is the main defence of the page against an
injected script. This story adds a second one that does not depend on the policy being right: the page's own code never turns
text into markup or code, so that a bug in how a text is shown cannot become a script, and the tokens kept in the browser have
fewer ways to be read. It also records where the player tokens are kept and why.

## The rule

The sources (`web/src`, `.ts` and `.svelte`) use none of: `innerHTML`, `outerHTML`, `insertAdjacentHTML`,
`createContextualFragment`, `srcdoc`, `document.write` / `writeln`, `eval`, `new Function` or `Function(...)`, a string given
to `setTimeout` or `setInterval`, and Svelte's `{@html}`. None is used today.

- **A vitest test** (`tests/source-rules.test.ts`) reads the sources and fails for any of them, comments apart. It also checks
  that its patterns catch each sink and let the safe forms through (`textContent`, `append`, a function given to `setTimeout`).
- **A Biome rule** (`crates/beelot-server/lint/no-html-sinks.grit`, a GritQL plugin listed in `biome.json`) reports the same
  sinks in the `.ts` files of the sources, the tests and the repository scripts, as an error of `npm run lint`, so that an editor
  and the `check` job show it where it is written. (Biome does not read `.svelte` files here, hence the test.) Biome's own
  `noGlobalEval` is on as well. This is "the lint of US-196".

## Where the player tokens are kept, and why

A player token is the bearer secret of one seat at one table: with it a request acts for that seat (play, leave, read the
hand). It is not the account's session (an `HttpOnly` cookie a script cannot read).

| Place | What | Life | Why |
| --- | --- | --- | --- |
| `sessionStorage` `beelot.table-tokens` | the token of every table the tab created or joined | the tab | every request to a table sends it as a bearer token |
| `sessionStorage` `beelot.private-table-session` | the private table the tab is at | the tab | a reload of the private table's page |
| `localStorage` `beelot.resume` | the table id and token of the solo match in progress | until the match ends or the server forgets the table | "Resume" on home after the tab, the browser or the Android app was closed |
| `localStorage` `beelot.resume-online` | the same for up to three online tables with a seat | the same | the same, for a table of friends or a public one |

A script that runs in the page can read all four. What limits the harm: a token opens one seat of one table, not an account; the
table's tokens stop working when the table closes; the records are removed when the match is over or the server answers that
the table is gone (`Home.svelte`, `TableGame`); and there is no way to run the injected script in the first place (the policy,
and this rule).

## What a shorter life would change

Moving the two resume records to `sessionStorage` means the token dies with the tab. The player who closes the browser, or the
Android app (the operating system ends it often), then loses the way back to a solo match in progress and to a seat at an online
table. "A resume that asks the server" works only for a signed-in player,
whose tables the server can list (US-184); a guest has no identity but the token, so a guest would have nothing to resume.

## Decision

**Keep the tokens as they are** (device storage for the resume records, tab storage for the rest) for now, because the cost of
a shorter life falls on every guest and on the Android app, while the risk it reduces needs a script in the page that the policy
and this rule already keep out, and what it exposes is one seat. This is the choice proposed to the product owner and it is
marked as pending their confirmation: the story asks for the decision to be taken with them, and nobody could be asked while it
was written. If they prefer the other side, the change is small now that `storage.ts` owns the keys (US-194): the two resume keys
move to `session`, and a signed-in player's resume is built from the server's list of tables.

## Tests

`tests/source-rules.test.ts`, as above. It fails on the source of a deliberate `el.innerHTML = x` (checked while writing it) and
passes on the current sources.
