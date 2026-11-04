# Friendly bots (US-112) — design

## Goal

The bots greet the player and react kindly, so the table feels like people. From the
backlog (`docs/product-backlog.md`):

- Each bot greets the player when the game starts, and says something in character after
  a good play, a lost round or the end of the match.
- Lines come from the bot personalities (US-088), are fixed texts in French and Dutch,
  and never mock the player.
- Lines are rare, appear as a short bubble, and can be turned off in Settings.
- At Reduced and Off effect levels (US-094) the text appears without movement.

## What US-088 already ships

The catalogue (`bot-lines.js`), the speech bubble, the "Bot comments" Settings option
(`beelot.bot-comments`), the effects-level behaviour and the FR/NL texts exist. This
story closes three gaps found by comparing them with the criteria above. Frontend only
(`crates/beelot-server/static/`): no server change, no new dependency.

## Decisions

- **One bot greets.** Only one bubble is shown at a time and lines must stay rare, so a
  single bot says hello. Decided with the user.
- **The greeter is the bot to the player's left** (the viewer's seat + 1, as the left
  seat is drawn), or the next bot clockwise if that seat is a human. No bot at the table
  means no greeting.
- **The greeting is not the round's comment.** It does not set `botCommentState.shown`,
  so the first round can still get its own line.
- **Greeting once per game.** A `greeting` event is reported by
  `bot-expression-state.js` on the first snapshot of a game that is at its very start:
  first deal of the match, scores 0–0, no trick played and no call made yet. Reloading
  or opening a game that is further on gives none (as for reactions). A reload during
  that very first moment would repeat the greeting, so the page also records greeted
  games in `sessionStorage` (`beelot.greeted`, wrapped in try/catch, the greeting still
  works without storage).
- **The expression stays neutral** for a greeting (no new face); only the bubble shows.
- **A big trick no longer swallows the round's result line.** Today a big trick sets
  `shown` and the contract made or failed line is then skipped. Now a `bigTrick` line
  may show (once per round, only if `shown` is false) but does not set `shown`; the
  round result line then still speaks when the round ends. So a round has at most two
  bubbles (a big trick, then the result), never together, since `showBotLine` replaces
  the current bubble. This also covers the "lost round" criterion. The priority inside
  `pickLine` stays: match end, coinche, capot, contract made or failed, big trick.
- **Tone rules for every line:** about the bot or the game, never about the player or
  the opponents' skill or luck. No sarcasm aimed at a person, no "lucky", "gift",
  "adorable", "cry", "rigged", "fluke". Cheeky and confident are fine; mocking is not.

## Changes

### `bot-lines.js`

- New kind `greeting`, two lines per character (at most 40 characters, no digits):
  - Camille: "Hello, friends! Let's have fun!", "Welcome! Good luck, everyone!"
  - Luc: "Hey there! Let's make it fun.", "Hey! Ready for a good game?"
  - Manon: "Hello. Let's play well.", "Ready when you are."
  - Hugo: "Hello. Let's begin.", "Hello. Shall we?"
- New `greetingFor(events, board, isBot, characterOf, viewerIndex, seed)` returning
  `{ seat, text }` or `null` (the leftmost-bot rule above).
- Rewrites of lines that mock or tease the player (English keys, so the FR/NL
  translations are rewritten with them, keeping each character's tone):

| Character | Old | New |
|-----------|-----|-----|
| Luc | Coinche! Try not to cry. | Coinche! This is gonna be fun. |
| Luc | Coinche! Come on, impress me. | Coinche! Let's make it exciting. |
| Luc | Coinche? Aw, that's adorable. | Coinche? Ha, I love the drama! |
| Luc | You coinched me? Bold move, pal. | Coinched? Okay, now it's a game! |
| Luc | Called it! Pay up, people. | Called it! I'm so good. |
| Luc | Okay, who dealt this mess? | Okay, the cards hated me. |
| Luc | Thanks for the gift, friend! | Ha! That one was smooth. |
| Luc | Told you so! Many times! | We won! I'm telling everyone. |
| Luc | Fine, you win. This time. | Fine, that was a good one. |
| Luc | Rigged! I demand a rematch. | Great game! Rematch? |
| Manon | Coinche me? Bad idea. | Coinched? Fine. I'm ready. |
| Manon | Not one trick for you. Sorry. | Every trick. What a round. |
| Manon | Another win. Get used to it. | Another win. I'm on form. |
| Manon | Enjoy it. I want a rematch. | Well played. I want a rematch. |
| Manon | You got lucky. Once. | Good game. Next one is mine. |
| Hugo | Hm. That's a choice. | Hm. Interesting. |
| Hugo | Coinche. I'll allow it. | Coinche. Let us see. |
| Hugo | Coinched. How exciting. | Coinched. Noted. |
| Hugo | Well played. I suppose. | Well played. Truly. |

  Camille's lines and the remaining lines are unchanged.

### `bot-expression-state.js`

- Reports `{ type: "greeting" }` in the events of the first snapshot when the game is at
  its start (see Decisions). `applyEvents` ignores it (no expression change).

### `app.js`, `i18n.js`, `i18n-nl.js`

- `commentOnEvents` handles `greeting` first: if comments are enabled and the game is
  not yet recorded in `beelot.greeted`, it shows the greeting bubble through
  `showBotLine` and records the game. It does not touch `botCommentState.shown`.
- The big-trick/round-result handling above lives in `commentOnEvents`.
- Greeting and rewritten lines are added in French and Dutch.
- The bubble CSS is unchanged: it already follows the effects level (pop, fade, instant).

## Testing

- `bot-lines.test.cjs`: every character has two `greeting` lines, within 40 characters
  and without digits; no line in the catalogue contains a banned word (cry, lucky, gift,
  adorable, rigged, fluke, "pay up", "get used", "enjoy it", "bad idea"); `greetingFor`
  picks the bot to the viewer's left, skips a human, wraps clockwise, and gives `null`
  with no bot; all keys exist in `i18n.js` and `i18n-nl.js`.
- `bot-expression-state.test.cjs`: a first snapshot at the start of a game yields one
  `greeting` event; a first snapshot mid-game, after a trick or with a call made yields
  none; a second snapshot does not repeat it.
- A big trick followed by a round result in the same round shows both lines, one after
  the other; two big tricks in one round show one line; the Settings toggle off shows
  none.
- Browser (Playwright, French then English and Dutch once; 390 × 844 and 1280 × 800):
  a new bot game greets once from the left bot; reload mid-game does not; comments off
  shows no greeting; effects Reduced and Off show the bubble without movement; the
  bubble is clear of the cards and aria-hidden; no console errors.
- Project checks from `AGENTS.md`: `cargo fmt --check`, `cargo clippy --all-targets -- -D
  warnings`, `cargo test --workspace` (Docker running), plus `node --test
  crates/beelot-server/frontend-tests/`.

## Out of scope

- Greetings from several bots, new faces or sounds, bot playing style, server changes.
- Human-to-human reactions (US-020).

## Known limits

- The new French and Dutch texts have no native-speaker review.
- A long match still repeats the small fixed catalogue.
- A game restarted with "Rejouer" (US-114) is a new game and greets again.
