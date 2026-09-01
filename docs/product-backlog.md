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

## Decisions required before implementation

- Confirm the initial platform: web, mobile, or both.
- Confirm whether online play is in scope for the first release or follows the
  AI-only playable version.
- Select the authoritative classic-Belote rules source and regional options.
- Decide whether guests may play online and what account model is required.
- Define the privacy, moderation, and age requirements before adding chat or
  public matchmaking.
