# Design: a complete redesign of the look, the motion and the sound (US-198)

## Goal

Make Beelot look and feel like a game people want to open again: premium, alive and fun on a phone, in the browser and in
the Android app, from the first second. Every feature stays; the look, the layout, the animations and the sounds are new.
The technical frame is ADR-007 (Svelte 5, TypeScript, Vite, Tailwind CSS 4, committed build).

## Design language: "Honey Night"

The brand is a bee on a playing card. The redesign keeps the bee and the honey and drops the cartoon ink outlines: a
late-night card club with a modern mobile game's juice.

- **Night surfaces.** The app is dark: a deep indigo night (`#0b0a14` to `#1d1a3a`) with slow aurora glows. Panels are
  frosted glass (translucent white, 20 px blur, a hairline border, a soft inner highlight). Cards stay bright, so the game is
  what catches the eye.
- **Honey as the signature.** One warm accent, honey gold (`#ffc22e` to `#ff9f1c`), for the primary action, the active seat,
  the player's own team and the bee. A violet (`#8b6cff`) marks the other team and secondary accents; mint for success,
  coral for danger. Hexagons (the honeycomb) are the recurring shape: chips, the dealer token, badges, card backs.
- **Type.** Bricolage Grotesque (variable, expressive) for headings, numbers and card ranks; Geist (variable) for the
  interface. Scores use tabular figures. Both are SIL OFL fonts, served from the site (the CSP forbids other origins).
- **Shape.** Large radii (16 to 28 px), pill buttons, generous spacing, 44 px minimum touch targets.
- **Cards.** A new deck: bright ivory faces with large ranks in Bricolage, a big suit glyph in the middle of number cards,
  and geometric court cards (a monogram under a crown, in the suit's colour). Red suits are crimson, black suits are ink;
  every card keeps both the symbol and the colour. Card backs show a honeycomb in the theme's colours with the bee.
- **Table themes.** The seven theme keys stay (stored settings, unlocks and music follow them) with new looks and names:
  `comic` is **Hive** (indigo night, honey ring, the default), `classic-green` is **Club** (emerald felt, brass),
  `midnight` is **Neon** (black, cyan and magenta), `sunset` is **Dusk** (coral to violet), and the three earned themes
  `forest` (**Grove**, moss and amber), `ruby` (**Velvet**, crimson and rose gold) and `gilded` (**Gilded**, black and gold).
  A theme sets the table surface, its glowing ring, the card back and the accent of the table.

## Layout

- **Phone (portrait, from 320 px).** A floating glass dock at the bottom with the four tabs (Play, Crew, Progress, Me) and a
  sliding highlight. Pages scroll above it. At a table the dock is hidden and the table fills the screen: a compact header
  (scores, status, menu), the partner at the top, the opponents on the sides as avatars, the trick in the middle, the hand
  as an arc at the bottom that always fits eight cards.
- **Tablet and desktop (from 1024 px).** A side rail with the logo and the tabs; home becomes a bento grid. The table is a
  centred stage with a fanned hand that lifts the card under the pointer; the reactions stay open beside it (US-125).
- **Landscape phones** get a shorter header and a flatter hand, so the trick never hides behind it.

## Motion

Motion follows the effects setting (full, reduced, off; US-087). As today, the system's reduce-motion preference is not
read: a table that moves less was set so by the player.

- **Springs, not easings**, for everything a finger touches: buttons press in and spring back, cards lift and settle.
- **Dealing.** Card backs shoot from the dealer to each seat in packets, with a whoosh; the player's cards flip face up one
  by one, then slide into order (US-140's order is kept).
- **Playing.** The player's card flies from where it was in the hand to its place in the trick along an arc, turning as it
  goes, and lands with a small bounce. A bot's card flies from its seat and flips from back to face on the way.
- **Winning a trick.** The winning card pulses and glows, "+N" floats up, then the four cards sweep to the winner's seat and
  shrink away; the score counts up (US-091).
- **Calls.** Bubbles pop in on a spring; a coinche lands like a stamp with a short shake of the table.
- **Celebrations** (US-090): belote and rebelote burst into honey sparks; a capot, a won coinche and a won match fire a
  particle burst of hexagons and confetti; the match end has a trophy, a podium that rises and scores that count up.
- **Pages** cross-fade with the View Transitions API where the browser has it; elsewhere they simply appear.
- **Ambient.** Home has drifting aurora glows and a bee that flies a slow loop around the logo; both stop at reduced effects.
- **Haptics.** On phones that allow it (Android and the app), a short vibration when a card is played, the trick is won or a
  coinche lands; a new "Vibration" switch in Settings turns it off. Effects "off" turns it off too.

## Sound

A new sound kit, synthesised with the Web Audio API (no audio files), through a master bus with a compressor and a short
synthetic reverb, so the sounds sit together. The names and the "Sound effects" switch are the same; the sounds are new:

- card: a paper snap with a soft wooden thock, with a slightly different pitch each time;
- deal: a quick airy swish per packet; your turn: a soft two-note chime (new, only when it becomes the player's turn);
- bid, pass, coinche: warm marimba notes (FM synthesis), up for a bid, down for a pass, a thump and a ring for a coinche;
- trick won: a sparkle of bell notes; round won and lost, match won, capot, coinche won, defended, belote, contract lost:
  short bell and marimba phrases, rising for the good news and falling softly for the bad;
- the tutorial's right and wrong answers, a pop for reactions and taps, and a chime for a friend's invitation.

The background music (US-164) stays as it is: seven tracks named by theme key, played by the same rules.

## Screens

Each screen keeps every feature it has today; "as today" means the behaviour, not the look.

- **Shell.** The routes and addresses are unchanged (`router.ts`, the server's `SPA_PATHS`). The offline note, the
  connection note with "Reconnect now", the missed-moves line, the friend invitation banner and the two live regions stay.
- **Play (home).** A hero with the bee and a fanned hand that deals itself, the "Play now" button (it opens the setup sheet,
  US-154), the resume cards (solo and online, US-122, US-145), the daily deal (US-150), the goal line (US-113), the tutorial
  banner (US-104) and the four modes as tiles: Bring the crew, Find a game, Pass and play, Learn the basics. The privacy link
  and the version (US-131) at the bottom.
- **Setup sheet** (US-118): mode, variant with its explanation, players for pass-and-play, the owner's name for a crew table,
  bots (each difficulty shown with its bots' faces), more rules (target, announcements, tout-atout and sans-atout), the start
  button, the remembered choices.
- **Table.** Scores with the target and each team's progress, the status line, Undo (US-146), the menu (hint, help, leave),
  spectators (US-071); seats with avatars, bot faces and their expressions (US-088), names, teams, card counts, the dealer
  token and its move (US-097), the contract badge, call bubbles and thinking dots; the trick; the hand with legal cards lifted
  and the reason a card cannot be played (US-108); the declaration switch and the announcement chips (US-060); toasts; bot
  comments (US-112); reactions (US-020); the round result with its breakdown, next round, rematch, results and review; the
  hand-off cover of pass-and-play; the leave question (US-110); the help sheet (US-123).
- **Auction.** A sheet over the table with the hand, the upturned card, the history, the values, the suits, take, pass, bid,
  coinche, the reason of a disabled choice and the hint (US-120).
- **Online lobby** (US-121): the invitation code with copy and share, the seats with "Sit here", friends to invite, the table
  rules, the summary, ready, start, start with bots, leave a public table and its bot countdown.
- **Match end** (US-093) with goal, podium, recap, rematch (US-114) and the account offer (US-115); **round review** (US-066,
  US-067, US-149).
- **Crew**: create, join with the six code boxes (US-124), watch, the friends panel (US-070), the open tables. **Find a game**:
  quick match. **Tutorial**: the four lessons. **Rules**: the reference, as the help sheet over home.
- **Progress**: statistics with the switcher, the rating and its history, contracts, recent matches; the leaderboard with the
  daily deal's board. **Me**: account and passkeys, display name, every setting, your data, privacy policy.

## Behaviour kept as it is

The game rules, the API, the snapshots, the stream and its reconnection (US-141, US-142, US-163, US-168), the timings of the
pace setting (US-147), the stored settings and their keys (`beelot.*`), the resume records, the account offer, the goals and
the theme unlocks, the translations (French by default, then English and Dutch) and the message codes (US-170). The logic
modules (`auction-sheet`, `lobby-model`, `goals`, `bot-lines`, `reconnect`, …) are ported to TypeScript with their tests.

## Accessibility

Keyboard play (arrow keys through the hand, Enter or Space to play), visible focus, the live regions of US-074 and the
score bar, labels for every card and seat, contrast of at least 4.5:1 for text, 44 px targets, and every motion behind the
effects setting.

## Risks

- Taste: the look is checked by screenshots at 375×667, 390×844 and 1280×800, not by tests.
- Old Android WebViews without `backdrop-filter`: panels fall back to an opaque night colour.
- The committed build can drift from the sources; CI fails when it does.
