# Say what Beelot is (US-103) — design

## Goal

The home page says in one sentence what the game is and what it costs, so a new
visitor understands it before scrolling (`docs/product-backlog.md`, US-103).
Frontend text only, in `crates/beelot-server/static/`.

## Decisions

- **The promise replaces the intro paragraph** (`.intro`), which sits under the
  title and the "Play now" button: "Play Belote with friends or bots. Free, no
  account needed." One sentence, no new element or style, and it fits the phone
  fold set by US-101.
- **The "Belote, remixed ✨" eyebrow is removed** from the home page, with its
  French and Dutch entries (the story asks for the "remix" subtitle to go).
  Other views keep their own eyebrows.
- **No account is stated plainly:** "no account needed", so guests are not
  discouraged by the sign-in bar below.
- Translations: FR "Jouez à la belote avec des amis ou des bots. Gratuit, sans
  compte." NL "Speel belote met vrienden of bots. Gratis, zonder account."
- The old intro text and its translations are deleted (now unused).

## Tests

Node tests (`frontend-tests/home-promise.test.cjs`): the home view has the
promise as `.intro`, mentions "account", has no "remix" and no eyebrow; the FR
and NL entries exist; the removed strings are gone from both dictionaries.
