# Make card play feel physical (US-089) — design

## Goal

Playing a card feels physical and satisfying, and tapping a card that cannot be
played teaches the rule instead of doing nothing. From the backlog
(`docs/product-backlog.md`):

- My hand fans out in an arc. A card lifts and tilts when hovered or touched.
- Tapping an illegal card makes it shake and shows why; legal cards are
  visibly distinct.
- A played card flies to the table, squashes on landing and rests at a slight
  random angle. The winning card of a trick pops.
- The animations build on the trick collection of US-041.

Applies to every table that draws a hand and a trick: the bot game, private
tables and pass-and-play. Every effect honours the effects level of US-094
(`2026-10-31-effects-level-design.md`). One server change (the reason a card is
illegal), the rest in the frontend (`crates/beelot-server/static/`). No new
dependency.

## Decisions

- **The server says why a card is illegal.** Decided with the user. The rules
  live in `beelot-game` (`rules::legal_cards`); a reason computed by the same
  module cannot drift from them in any variant (all trumps, no trumps,
  contrée). The client does not re-implement the rules.
- **Animate from the real origin.** Decided with the user. A played card flies
  from where it was (the tapped hand card, or the seat's avatar) to its slot
  on the table, measured at draw time, not from a fixed per-seat keyframe.
- **The reason is information, motion is decoration.** The reason text shows at
  every effects level; the shake, flight, squash and pop follow the level.
- **The fan is a pose, not motion.** It shows at every level.
- **Transforms and opacity only** for every animation, composed with the
  individual `rotate`, `translate` and `scale` properties so the existing
  `transform` lifts keep working.
- **Illegal cards stay inert for the game.** Tapping one never sends a move; it
  only shakes and explains.

## Part 1 — The reason a card is illegal (server)

### `beelot-game/src/rules.rs`

- `pub enum IllegalReason { MustFollow(Suit), MustTrump, MustOvertrump }`.
  - `MustFollow(suit)`: a card of the suit led is held and this card is of
    another suit. It applies in every mode, including no trumps, and when the
    suit led is a trump and no higher trump is held.
  - `MustTrump`: the hand cannot follow, the partner is not winning, trumps are
    held, and this card is not a trump.
  - `MustOvertrump`: a higher trump than the winning one is held (following a
    trump lead, or cutting) and this card is a lower trump. Under all trumps the
    text reads "play a higher card".
- `pub fn illegal_reason(hand: &[Card], trick: &[Card], trump: Trump, card: Card)
  -> Option<IllegalReason>` returns `None` exactly when `card` is in
  `legal_cards(hand, trick, trump)`. It reuses the same helpers
  (`higher_trumps`, `winning_index`), so there is one rule, two views of it.
- `GameBoard::illegal_cards(seat) -> Vec<(Card, IllegalReason)>`, next to
  `legal_cards`: empty when the trick is under review or it is not that seat's
  turn.

### `beelot-server/src/api/snapshot.rs`

- `BoardView` gets `illegal_cards: Vec<IllegalCardView>` (serialised
  `illegalCards`), built in `board_view` beside `legal_cards`. `legalCards` is
  unchanged. `IllegalCardView = { card: CardView, reason: "MUST_FOLLOW" |
  "MUST_TRUMP" | "MUST_OVERTRUMP", suit?: <suit name> }` (`suit` only for
  `MUST_FOLLOW`).
- It is built for the viewer's own seat only, so it reveals nothing beyond the
  viewer's own hand. The one `board_view` serves the bot game, private tables
  and pass-and-play.

## Part 2 — The hand (frontend)

### `static/card-physics.js` (new, pure)

- `fanFor(index, count) -> { rotation, offsetY }` (degrees, px): the angle is
  `(index − (count − 1) / 2) × step`, with `step` capped so the whole hand spans
  at most about ±14°; the outer cards drop slightly so the hand forms an arc.
  One card gets `{ 0, 0 }`; the result is symmetric around the centre.
- Applied by `app.js` as `--fan-rot` and `--fan-y` on each hand card
  (`#card-hand`, `#private-game-hand`) and used through the individual `rotate`
  and `translate` properties, so the existing `transform` lift rules (legal
  `translateY(-5px)`, hint, hover) still compose.

### `styles.css`

- Hover, keyboard focus and press straighten the card (`rotate: 0`) and raise
  it about 15 px. Legal cards keep their gold outline, so legal and illegal cards
  stay clearly distinct (illegal cards are not outlined and sit lower).
- Touch: `:active` gives the same feedback while a tap still plays the card.
- Reduced: the lift uses `var(--effect-fast)`. Off: no transition. The fan
  itself shows at every level. At phone widths the overlap
  (`calc(var(--cw) * -.3)`) is kept and the fan angles are checked to fit the
  hand's `max-width`.

## Part 3 — Tapping an illegal card (frontend)

- Illegal cards get `role="button"`, `aria-disabled="true"` and `tabIndex` 0.
  Click, Enter or Space calls `rejectCard(card)`; no move is sent.
- `rejectCard`:
  - Adds a shake class: a rotation keyframe of about 300 ms at Full, a brief dim
    at Reduced, nothing at Off.
  - Shows the reason in a bubble above the hand (a `role="status"` region, one
    per table: bot game, private, pass-and-play). It clears after about 3 s or
    on the next action.
- The reason text is chosen from `illegalCards` by rank and suit, with the suit
  drawn as a symbol (US-098): for example "Follow the suit led: ♥", "You must
  trump", "Play a higher trump". Under all trumps: "Play a higher card". The
  texts are new keys in `i18n.js` and `i18n-nl.js`, in French and Dutch.
- Cards that are not the player's turn (`illegalCards` empty) stay inert, as
  today.

## Part 4 — Flight, landing and the winner (frontend)

- **Origin.** On a tap, `app.js` records `{ cardKey, rect }` of the tapped hand
  card before the re-render replaces it. For another seat the origin is that
  seat's avatar box at draw time. No origin (a reload mid-trick, a card played
  elsewhere) falls back to today's arrival animation.
- **Flight.** `renderTrickDiamond` already marks new cards `card-arriving` with a
  `--reveal-delay`. For each, `card-physics.js` gives
  `flightVector(originRect, slotRect) -> { x, y }`, set as `--fly-x` and
  `--fly-y`. The card animates from that offset (slightly enlarged and
  rotated) to rest in about 280 ms (`card-fly`, transform only), then a short
  squash (`card-land`, about 120 ms, scale ≈ 1.08 × 0.92 back to 1). The
  reveal delay is kept, so bots' cards still arrive one after another and the
  card sound stays in step.
- **Resting angle.** `restAngle(card) -> degrees` is a stable hash of rank and
  suit within ±3°, so a re-render does not change it.
- **Winner.** `winning-card-pulse` (an infinite loop) becomes a one-shot
  `card-pop` (scale ≈ 1.18 and back); the gold highlight stays. Reduced
  brightens only; Off does nothing.
- **Timing.** The flight never delays the trick collection of US-041 or the
  next action; it fits inside today's reveal time.
- Reduced: arrival is a fade (`var(--effect-fast)`); no flight, squash or pop
  scale. Off: instant.

## Testing

- **Rust** (`beelot-game`): `illegal_reason` returns `None` for exactly the
  cards of `legal_cards`, over generated hands, tricks and every trump mode (a
  test enumerates them); a known case per reason (`MustFollow` with its suit,
  `MustTrump`, `MustOvertrump` for a trump lead and for a cut, all trumps
  "higher card", no trumps follow); `GameBoard::illegal_cards` is empty when it
  is not the seat's turn or the trick is under review.
- **Rust** (`beelot-server`): the snapshot carries `illegalCards` with the
  documented shape for the active seat, and none for others; `legalCards` is
  unchanged.
- **Node** (`frontend-tests/card-physics.test.cjs`): `fanFor` is symmetric,
  bounded and `{ 0, 0 }` for one card; `restAngle` is stable and within ±3°;
  `flightVector` gives the offset between two boxes; every new text exists in
  `i18n.js` and `i18n-nl.js` (the test reads them as text).
- **Browser:** the bot game, a private table with bots and pass-and-play at
  390 × 844 and 1280 × 800; each effects level; an illegal tap for each reason
  (follow, trump, overtrump, all trumps); hover, focus and touch lift; a
  reload mid-trick falls back cleanly; the fan fits at 8 cards on a phone; the
  winner pop and the trick collection do not overlap badly.

## Out of scope

- Sounds and screen effects for big moments (US-090).
- Changes to how the trick is collected (US-041) beyond hooking the winner pop.
- Dragging cards to play them.

## Known limits

- The fan angles are fixed per hand size; they are not adapted to a hand
  that overflows its container (the existing overlap handles that).
- The flight origin of a bot's card is its avatar, not a hand, because bot hands
  are shown face down as a stack.
