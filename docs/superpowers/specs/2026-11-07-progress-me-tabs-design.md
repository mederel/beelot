# US-124 — Progress and Me tabs: design

Status: implemented, decisions taken by the implementer. Story: `docs/product-backlog.md`, Phase 8.

## 1. Goal

Results live in Progress, settings in Me, and Crew gathers create, join with a six-box code, find a game and the tables
still open.

## 2. Today

Statistics show the overall tiles and two tables side by side, contracts and recent matches; a guest sees "Sign in to see
your statistics". Settings (Me) already hold language, theme, effects, sound, reactions, bot comments and, signed in, the
data export and deletion with a typed confirmation; the account bar moved there with US-122. Crew has a join form with one
text field for the code and no list of open tables.

## 3. Decisions

1. **One switcher on Progress** (`name="stats-view"`: Overall, By variant, By bot difficulty) shows one of three panels at
   a time; the choice is the radio's state. Contracts and recent matches stay below.
2. **Today's goal and the streak** (US-113) show on Progress above the switcher, for guests and signed-in players, from
   the same ledger as home.
3. **Guests see the account offer on Progress**: the sign-in prompt gains a sentence that creating an account keeps results
   and shows progress here, with the existing sign-in button.
4. **Me** keeps its settings and gains the privacy policy link; the account block stays first. Nothing else moves.
5. **Crew's code is six boxes** (`code-boxes.js`): one character each, uppercase, focus moves on input and back on
   Backspace, a paste spreads over the boxes, a hidden `#invitation-code` carries the assembled code to the existing join
   handler (so the API call is unchanged). Each box is labelled "Character n of 6".
6. **Crew lists open tables**: the online tables this tab holds a token for, checked against the server; a waiting or
   running table of a private or public kind is listed with a link back to it; failures and finished tables are left out.
   The list is for this tab only (tokens are per tab).
7. **Find a game stays its own page**, linked from Crew with a button.

## 4. Not done

Recent matches opening a recap: the statistics API returns no per-round detail to build a recap from (it needs a server
change). Crew listing tables from other tabs or devices (needs an account-bound list on the server).

## 5. Texts

New, French and Dutch: "Overall", "By bot difficulty", "Character {0} of 6", "Your open tables", "Resume", "Create an
account with a passkey to keep your results and see your progress here." Reused: By variant, Privacy policy, Find a game.

## 6. Tests and checks

`code-boxes` and `progress-tabs` unit tests (normalisation, spreading, focus moves, panel choice, open-table filter);
wiring tests for the markup and handlers; browser checks on the mocked API of Progress at 360×640 and Crew with a pasted
code.
