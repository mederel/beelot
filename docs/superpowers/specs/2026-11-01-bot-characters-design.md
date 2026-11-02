# Meet my opponents (US-088) — design

## Goal

Every bot seat has an illustrated avatar and a personality, so the bots feel like
characters. From the backlog (`docs/product-backlog.md`):

- Each seat shows a cartoon avatar. The bots look different, and each player's
  avatar is stable for the whole match.
- Avatars react to the game: thinking, pleased, annoyed, celebrating.
- Bots say short in-character lines at the table (for example after a big trick
  or a coinche); they never reveal their hand.
- New texts are translated into French and Dutch, and use "bot", not "AI".

Every animation honours the effects level of US-094
(`2026-10-31-effects-level-design.md`). Frontend only
(`crates/beelot-server/static/`): no server change, no new dependency.

## Decisions

- **One spec, three parts, built in this order:** characters, reactions, lines.
  Each part can ship alone. Decided with the user.
- **Characters are keyed by seat name.** The server picks bots from a fixed set
  (`ONLINE_BOT_NAMES` Camille, Luc, Manon; `LOCAL_BOT_NAMES` those plus Hugo in
  `tables/seats.rs`), and a bot that takes over a seat keeps its name. So a name
  gives a stable look for the whole match with no server change. Any other name
  (a human) keeps today's initial on a coloured disc.
- **Occasional, switchable comments.** Lines appear only on notable moments, at
  most one per round, with a new Settings option "Bot comments" (on by default).
  The expressions stay when comments are off. Decided with the user.
- **Reactions are derived on the client** by comparing consecutive snapshots. The
  snapshots already carry what is needed (see "Events").
- **Lines never reveal a hand, by construction.** They are fixed texts with no
  card, suit or hand data in them.
- **Lines are not announced to screen readers** (`aria-hidden`), so flavour text
  does not interrupt play; the Settings option lets anyone hide them.
- **The expression is information and is always shown** at every effects level;
  only its movement changes with the level.

## Part 1 — Characters

### `static/avatars.svg` (new sprite, like `cards.svg` and `suits.svg`)

- One `<symbol>` per character with no face: head shape, hair and an accessory.
  - **Camille:** warm and cheerful, round glasses. Encouraging.
  - **Luc:** laid-back joker, messy hair and a cap. Teasing.
  - **Manon:** sharp and competitive, ponytail. Confident.
  - **Hugo:** cool and quiet, beard. Dry and understated.
- Five shared face `<symbol>`s drawn in the same box: `face-neutral`,
  `face-thinking`, `face-pleased`, `face-annoyed`, `face-celebrating`. A seat draws
  the character symbol and one face symbol on top, so an expression change swaps
  only the face. Thick outlines and saturated colours as the table's cartoon style
  (US-086); each character has a distinct main colour that also reads at the seat
  size on a phone (about 1.6 rem).

### `static/bot-characters.js` (new, pure)

- `botCharacter(name)` returns `{ key, name }` for a known bot name (`key` is
  `"camille" | "luc" | "manon" | "hugo"`), else `null`. Case-sensitive on the
  server's names.

### `app.js`

- In `renderTableSeats` (used by the bot game, bidding table, pass-and-play and
  private tables), a seat whose name has a character draws an
  `<svg class="player-avatar bot-avatar" aria-hidden="true">` with the two
  `<use>`s instead of the initial. Human seats are unchanged.
- The avatar carries `data-character` and `data-expression` (default `neutral`);
  the seat's `aria-label` is unchanged (the character is not announced).

## Part 2 — Reactions

### `static/bot-reactions.js` (new, pure)

- `botEvents(previous, board, match)`: the events that happened between two
  snapshots, in order. `previous` is the last board seen for this table (or `null`
  on the first load, which yields no events, so opening or reloading mid-game does
  not react). An event is `{ type, seat, team }`:
  - `trick`: `board.reviewingCompletedTrick` became true for a new trick; `seat`
    is the index of `board.trickWinner`; `big` is true when `board.trickPoints >=
    20`.
  - `coinche`: `board.coinched` became true (or, during bidding, a call of kind
    coinche); `seat` is the coincher.
  - `round`: `board.roundResult` appeared: `contractMade`, and `capot` when
    `capotTeam` is set; `team` is the declaring team.
  - `match`: `match.complete` became true; `team` is the winner.
- `expressionsFor(events, seats)`: the expression each bot seat takes after the
  events:
  - `trick`: winner pleased (celebrating when big); the winner's partner pleased;
    on a big trick the opponents annoyed.
  - `coinche`: the declaring team's bots annoyed; the coincher pleased.
  - `round`: contract made, the declaring team pleased (celebrating on a capot)
    and the defenders annoyed; contract failed, the reverse.
  - `match`: the winners celebrating, the losers annoyed.
  - Humans get no expression.
- `thinking`: a bot seat shows `thinking` while it is the active player (bidding
  and play) and no trick is being reviewed.
- Transient expressions (pleased, annoyed, celebrating) last 2.5 s then return to
  neutral, or to thinking if the bot is active; a newer event replaces an older one.

### `app.js` and `styles.css`

- Keep, per table, the previous board and the expression timers (cleared when the
  table or game changes, as the score bar does with its game key). After each
  render the bot avatars are set from the current events and the active seat.
- Effects: Full gives the face swap a short bounce (transform only, 200 ms);
  Reduced fades between faces (`var(--effect-fast)`); Off swaps at once. The
  pattern is the one of the effects spec (a rule per level under
  `body[data-effects]`).

## Part 3 — Lines

### `static/bot-lines.js` (new, pure)

- A catalogue: for each character and each event kind, two English lines. Event
  kinds: `coincheMade`, `coincheReceived`, `contractMade`, `contractFailed`,
  `capot`, `bigTrick`, `matchWon`, `matchLost`. That is 4 characters × 8 kinds × 2
  lines. Each line is short (at most about 40 characters), in the character's
  voice, contains no card, suit, bid value or other hand information, and says
  "bot" if it mentions what it is, never "AI".
- `lineFor(character, kind, seed)` returns one English line (the key to pass to
  `t()`), chosen by `seed` so a round gives a stable choice.
- `pickLine(events, seats, seed)`: chooses the one line for a round, or `null`:
  at most one per round, the highest-priority event wins: coinche, then capot,
  then contract failed or made, then big trick; match end always speaks. The
  speaker is a bot on the team the event is about (the focal seat if it is a bot,
  else the team's other bot); no bot team means no line.

### `app.js`, `index.html`, `styles.css`

- A speech bubble beside the speaking bot's avatar, shown for 3 s, one at a time,
  `aria-hidden="true"`, drawn with the table's cartoon bubble style and kept
  inside the viewport and clear of the cards at 390 × 844. It follows the effects
  level (pop at Full, fade at Reduced, instant at Off).
- Settings gets a checkbox "Bot comments" (on by default), stored in
  `localStorage` as `beelot.bot-comments` ("false" turns it off), exactly like
  the existing `reactions-enabled`. When off, no bubble is created; expressions
  continue.

### Texts

All lines and the Settings label and description ("Bot comments", "Bots comment
on the game.") get French and Dutch in `i18n.js` and `i18n-nl.js`. A line's
translation keeps the character's tone, not a literal word-for-word translation.

## Testing

- **Node tests** `frontend-tests/`:
  - `bot-characters.test.cjs`: the four names map to their keys; a human name, an
    empty name and a name with different case give `null`.
  - `bot-reactions.test.cjs`: no events when `previous` is null; a new reviewed
    trick yields one `trick` event with the winner and `big` at 20 points but not
    19; coinche, round (made, failed, capot) and match events; the expressions per
    the table above, including partner and opponents and humans getting none;
    thinking only for the active bot and not while a trick is reviewed.
  - `bot-lines.test.cjs`: every character has at least two lines for every kind;
    no line contains a card rank or suit name, "AI" or digits; every line is at
    most 40 characters; `pickLine` returns at most one line, respects the
    priority order, never picks a human speaker, and is stable for the same seed;
    every line, and the Settings texts, exist in `i18n.js` and `i18n-nl.js` (the
    test reads those files as text).
  - A sprite test like `suits-sprite.test.cjs`: `avatars.svg` has the four
    character symbols and the five face symbols.
- **Browser** (Playwright, French, then English and Dutch once; 1280 × 800 and
  390 × 844): the three distinct avatars in a bot game, bidding, pass-and-play and
  a private table with bots; a human seat keeps its initial; thinking while a bot
  is to play; reactions after a big trick, a coinche, the end of a round and of the
  match; at most one comment per round, bubble clear of cards and in view; the
  Settings toggle hides comments but not expressions; reload mid-game shows no
  reaction; effects Reduced and Off; accessibility tree has no new announcements;
  no console errors.
- Project checks from `AGENTS.md`: `cargo fmt --check`, `cargo clippy
  --all-targets -- -D warnings`, `cargo test --workspace` (Docker running), plus
  `node --test crates/beelot-server/frontend-tests/`.

## Out of scope

- Different playing styles for the characters (the bot strategy is unchanged).
- Avatars for human players, avatar choice, voices or sounds (US-090 covers sounds).
- Reactions between human players (the preset reactions of US-020 are separate).
- Any server or API change.

## Known limits

- A name outside the fixed bot set gets no character; it is treated as a human.
- Lines are a small fixed catalogue, so a long match repeats them.
- A human who types a bot's name (for example "Luc" in pass-and-play) gets that character's avatar,
  because characters are keyed by name.
- "At most one line per round" means a big trick (20 points or more), which usually comes first, uses
  the round's line, so the contract made or failed line rarely shows. Only a match end speaks after
  another line.
- Bots resolve their bids on the server in one step, so a bot never shows the thinking face during
  the auction; thinking shows only while a bot is the active player of a played trick.
- Manon's French match-won line ("Championnes, comme prévu.") is feminine, even if the winning team is
  mixed.
- The French and Dutch lines were written without a native-speaker review.

## Verification (2026-11-03)

- `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace` (Docker
  running, so the Testcontainers tests ran) and `node --test crates/beelot-server/frontend-tests/`
  (100 tests) all pass.
- Browser (Playwright, Chromium), against the local server:
  - Bot game, bidding table, pass-and-play (two humans, two bots, viewer rotation: each character
    stays with its seat) and a private table started with bots: avatars draw, expressions change and
    return to neutral after 2.5 s, a reload shows no reaction, and the console shows no error from
    this feature.
  - Bubble placement at 390 × 844, 800 × 900 and 1280 × 720 for the left, top and right seats: clear of
    the cards and the trick, inside the viewport.
  - The effects levels (Full pop, Reduced fade, Off none), the Settings toggle (persists after a
    reload, comments off creates no bubble) and the Settings texts in English, French and Dutch.
  - Not exercised in the browser: a line after a real coinche, capot, contract result or match end
    (only big-trick lines occurred; the other kinds are covered by the Node tests), the whole matrix
    once more in English and Dutch, a human taking over a bot's seat, and leaving a table through
    in-app navigation while a timer runs (a full page load was used).
- `/api/tables` answered 409 once in the console during pass-and-play; nothing in this change touches
  that request, but it was not checked on `main`.
