# Belote — Initial Product Backlog

## Product goal

Deliver an approachable and reliable application for four-player French Belote,
allowing players to learn, play against AI, and play with friends online.

## Release scope

### MVP

The first playable release supports classic Belote, a full four-player table,
AI opponents, private online games, scoring, and a rules reference. The first
implementation target is a game to 1,000 points.

### Later releases

Coinchee/Contree, public matchmaking, player progression, local pass-and-play,
and social features follow after the core game is stable.

## Epics and user stories

### E01 — Start and configure a game

**US-001 — Choose a game mode**

As a player, I want to choose whether to play a game against AI or create a
private online table, so that I can start the type of game I want.

Acceptance criteria:

- The home screen presents at least “Play against AI”, “Private online game”,
  “Tutorial”, and “Rules”.
- Selecting a mode leads to the corresponding configuration or game screen.
- The default rules are classic Belote to 1,000 points.

**US-002 — Configure an AI game**

As a solo player, I want to choose the AI difficulty before starting, so that
the challenge matches my experience.

Acceptance criteria:

- At least two difficulty levels are available.
- The selected difficulty is visible during the game.
- Starting the game immediately fills the other three seats with AI players.

**US-003 — Create and join a private online table**

As a player, I want to create a private table and share an invitation code,
so that I can play with people I know.

Acceptance criteria:

- The table owner receives a joinable code or link.
- A player can join using that code before the game begins.
- Each occupied seat displays the participant’s name and ready state.
- The owner can start only when four players are present and ready.

Functional tasks:

- Define the table lifecycle: created, waiting, ready, in progress, completed,
  and abandoned.
- Define how teams and seats are assigned in private games.
- Specify invitation expiry and the behaviour for invalid or full tables.

### E02 — Play a legal game of classic Belote

**US-004 — View my hand and the current table state**

As a player, I want to clearly see my cards, turn, trump suit, contract, and
score, so that I can make an informed play.

'Tout-Atout' (All Trumps) and 'Sans-Atout' (No Trumps) are out of scope of the MVP, and will be contributed in a later version of the product. 

Acceptance criteria:

- The player’s eight cards are visible only to that player.
- The active player is unambiguous.
- Trump, declaring team, current trick, completed-trick count, and both team
  scores are visible throughout a round.
- Opponents’ card faces are never exposed.

**US-005 — Deal and choose trump**

As a player, I want the application to conduct the deal and bidding sequence,
so that trump is selected according to the rules.

Acceptance criteria:

- The game deals cards and presents the upturned card as required by the
  selected classic-Belote rule set.
- Players are prompted in turn to pass or accept/select trump.
- If all players pass, the system follows the agreed redeal rule and explains
  what happened.
- Once selected, trump and the declaring team are shown to all players.

**US-006 — Play a card**

As a player, I want to select a card from my hand and play it on my turn, so
that I can participate in each trick.

Acceptance criteria:

- A card can be played only by the active player.
- The application enforces follow-suit, trumping, and overtrumping rules.
- Legal moves are available without requiring rule knowledge; illegal cards
  cannot be submitted.
- The played card is visible in the center of the table and removed from the
  player’s hand.
- High-light in the last trick which card is the winning card that will bring the 'Dix de der' to the winning party

**US-007 — Resolve a trick**

As a player, I want each trick to be resolved automatically and visibly, so
that I understand who takes the next lead.

Acceptance criteria:

- After four cards are played, the system identifies the winner using the
  lead suit and trump values.
- The winning team receives the trick’s card points.
- The winner leads the next trick.
- The completed trick is briefly reviewable before the next lead.

**US-008 — Declare Belote/Rebelote**

As a player holding the king and queen of trump, I want to declare
Belote/Rebelote while playing them, so that my team receives the bonus.

Acceptance criteria:

- The application recognizes eligible king/queen-of-trump plays.
- It records the declaration only once and awards the correct bonus.
- The declaration is shown to all players and included in the score breakdown.

Functional tasks:

- Confirm and document the precise classic-Belote rules used, including
  second-round trump choices, partner-winning exception, last-trick bonus,
  Belote/Rebelote, and all-pass redeal behaviour.
- Create a rules engine separated from UI and networking.
- Define deterministic game events for deal, bid, card play, trick win, and
  round end.
- Prepare rule-engine test cases for every legal-move constraint and card rank.

### E03 — Score rounds and finish a match

**US-009 — Receive an explained round result**

As a player, I want to see how each round was scored, so that the result is
trusted and easy to understand.

Acceptance criteria:

- The round result shows card points, last-trick bonus, Belote/Rebelote bonus,
  contract outcome, and total awarded to each team.
- The system identifies a failed contract and allocates points according to the
  selected rule set.
- Players can continue to the next deal after viewing the result.

**US-010 — Finish a match**

As a player, I want the game to identify the winning team at the score target,
so that the match has a clear conclusion.

Acceptance criteria:

- Cumulative team scores persist across deals.
- A match ends when a team reaches or exceeds 1,000 points after a round.
- The result screen identifies winners and shows a rematch option.

Functional tasks:

- Specify scoring examples for made, failed, tied, and capot rounds.
- Define rematch behaviour, including seat retention and score reset.

### E04 — Learn the game

**US-011 — Consult the rules during play**

As a new player, I want a concise rules reference available from the table, so
that I can resolve questions without leaving the game.

Acceptance criteria:

- The reference covers deal, trump selection, card ranks, obligations, and
  scoring for the active variant.
- Opening it does not reveal hidden cards or alter the current turn.
- It is available from the home screen and from an active game.

**US-012 — Play a guided tutorial**

As a new player, I want an interactive tutorial, so that I can learn the core
flow before joining other players.

Acceptance criteria:

- The tutorial explains trump, card strength, following suit, and taking a
  trick through guided choices.
- It gives feedback for incorrect choices and permits replay.

Functional tasks:

- Write tutorial scenarios and instructional copy.
- Define a compact, localized French-first rules glossary.

### E05 — Reliable online play

**US-013 — Recover from a temporary disconnection**

As an online player, I want to reconnect to my ongoing game, so that a brief
network interruption does not end the match.

Acceptance criteria:

- The player can rejoin their original seat while the game is active.
- The restored table reflects the authoritative current state.
- Other players are notified of the disconnected and reconnected status.
- A configurable timeout defines the outcome when reconnection fails.

**US-014 — Be protected by turn handling**

As a player, I want clear turn timing and inactivity handling, so that online
games keep moving.

Acceptance criteria:

- A table may enable a turn timer before the game starts.
- Players receive a visible warning before their turn expires.
- The timeout outcome is defined and communicated before play begins.

Functional tasks:

- Choose a server-authoritative model for game state and rule validation.
- Define reconnection tokens, session expiry, and anti-duplicate-session rules.
- Define online-game timeout and abandonment policy.

### E06 — Accessibility and presentation

**US-015 — Use the application comfortably**

As a player, I want readable cards and controllable presentation settings, so
that I can play comfortably on my device.

Acceptance criteria:

- Card suits are distinguishable without colour alone.
- Text and touch targets remain usable on supported screen sizes.
- Players can control sound and animation settings.
- The UI exposes accessible labels for essential game actions and state.

Functional tasks:

- Define supported devices, browsers/platforms, and minimum screen sizes.
- Produce UI states for waiting, active turn, inactive turn, result, error,
  reconnecting, and empty table.

## Post-MVP backlog

- **US-016:** As an experienced player, I want to select Coinchee/Contree, so
  that I can play my preferred variant.
- **US-017:** As a player, I want public matchmaking, so that I can find a game
  without arranging one privately.
- **US-018:** As a player, I want match history and statistics, so that I can
  follow my progress.
- **US-019:** As players sharing one device, we want pass-and-play, so that we
  can play locally.
- **US-020:** As a player, I want optional in-table reactions or chat, so that
  online games feel social.

## Additional user stories delivered after US-016

These stories were implemented after Coinchee/Contree (US-016) without being
planned in the backlog. They are recorded here retroactively.

### E02 — Play a legal game of classic Belote

**US-021 — Follow the bidding at the card table**

As a player, I want the bidding to take place at the card table with clear
animations, so that I can follow each player's decision.

Acceptance criteria:

- The card table, seats, and my hand remain visible during bidding.
- The player currently deciding is highlighted while they think.
- Each call appears as a bubble at the caller's seat, coloured by call kind
  and showing the suit symbol, with a ripple on the calling seat.
- A table message narrates each decision, and the auction is paced slowly
  enough to be read.

**US-022 — Play at a clear and attractive card table**

As a player, I want a bright table with readable cards, a sorted hand, and a
clear trick layout, so that I can understand the game at a glance.

Acceptance criteria:

- My hand is sorted by suit and rank.
- Trick cards are placed around a diamond, each in front of the player who
  played it.
- The winning card of each trick is highlighted.
- Cards have an improved, readable design.
- The application has a favicon.

**US-023 — See cards being dealt and played**

As a player, I want dealing and card play to be animated, so that I can see
where each card comes from.

Acceptance criteria:

- Cards are animated from the deck to each player during the deal.
- Each played card is animated from the player's seat to the trick.
- Cards played by bots immediately after a trick is collected are animated
  too.

### E01 — Start and configure a game

**US-024 — Fill a private table with bots**

As a private table owner, I want to start the game before four players have
joined, so that we can play even when some friends are missing.

Acceptance criteria:

- The lobby offers a “Start now with bots” action to the table owner.
- Empty seats are taken by bots that bid and play automatically.
- The lobby explains that the owner can either wait for four ready players or
  start now with bots.

### E03 — Score rounds and finish a match

**US-025 — Play several rounds and rematch at a private table**

As a player at a private table, I want to deal the next round and start a
rematch, so that we can play a full match with friends.

Acceptance criteria:

- The private table keeps a cumulative match score.
- The round result panel offers a button to deal the next round.
- When the match is over, a rematch can be started.

### E06 — Accessibility and presentation

**US-026 — Play in my language**

As a player, I want to use the application in my language, so that I can
understand every screen and message.

Acceptance criteria:

- French, English, and Dutch are available; French is the default.
- Static screens, dynamic UI text, suits, ranks, card names, and
  server-generated messages are translated.
- The language can be changed in Settings and the choice is remembered.

**US-027 — Hear the game**

As a player, I want sound effects for game events, so that the table feels
alive and I notice what happens.

Acceptance criteria:

- Dealing, card play, bids, trick and round results, and tutorial answers have
  sound effects.
- Sounds are synthesised in the browser, without audio files.
- Sound effects honour the Settings option to turn them off.

**US-028 — Choose options with buttons**

As a player, I want choices presented as buttons rather than dropdown menus,
so that I can pick them quickly, especially on touch screens.

Acceptance criteria:

- Bid amounts, trump suits, game variant, turn timer, and language are chosen
  with button groups.
- Illegal bid amounts and suits are disabled rather than rejected after
  submission.

**US-029 — Play comfortably on a phone**

As a mobile player, I want game screens to fit my screen, so that I can play
without scrolling.

Acceptance criteria:

- Game setup, bidding, and card play fill the phone viewport without
  scrolling.
- The header and HUD are compact, the table is flexible, cards are smaller,
  and the contract picker fits on one row.

### E05 — Reliable online play

**US-030 — Keep the service available under abuse**

As an operator, I want the server to bound its resource use, so that a single
client cannot degrade or exhaust the service.

Acceptance criteria:

- API requests are rate limited per client, with a stricter limit on game and
  table creation or joining; excess requests receive `429` with
  `Retry-After`.
- API request bodies above a size limit receive `413`.
- The number of AI games and private tables is capped; beyond it, creation
  returns `503`.
- Idle games and tables are evicted after a configurable delay.
- Tomcat thread, connection, timeout, and header-size limits are set, and
  player names are limited to 30 characters.
- Defaults are configurable and documented in the README.

**US-031 — Ship the server as a native executable**

As an operator, I want to compile the application to a GraalVM native image,
so that it starts quickly and uses less memory.

Acceptance criteria:

- The build can produce a native executable with GraalVM 25, with the
  toolchain resolved automatically.
- The native build command is documented in the README.

## Decisions required before implementation

- Confirm the initial platform: web, mobile, or both.
- Confirm whether online play is in scope for the first release or follows the
  AI-only playable version.
- Select the authoritative classic-Belote rules source and regional options.
- Decide whether guests may play online and what account model is required.
- Define the privacy, moderation, and age requirements before adding chat or
  public matchmaking.
