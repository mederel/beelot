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

  Acceptance criteria:

  - The home screen offers a "Find a game" mode leading to `/online/public`.
  - Finding a game seats the player at the open public table of the chosen
    variant with the most seated players, or opens a new one when none exists.
  - Players are only matched with players who chose the same variant.
  - The game starts automatically when the fourth player is seated; no ready
    step or owner action is needed.
  - While waiting, the player sees the seated players and a countdown until
    bots take the empty seats (60 seconds after the table opened); when it
    reaches zero, bots fill the table and the game starts.
  - A waiting player can leave the table; their seat is freed for others.
  - Public tables show no invitation code and cannot be joined by code.
  - New texts are translated into French and Dutch.

  Design: `docs/superpowers/specs/2026-10-02-public-matchmaking-design.md`.
- **US-018:** As a player, I want match history and statistics, so that I can
  follow my progress.

  Split into US-057 (sign in with an OAuth provider), US-058 (record finished
  matches) and US-059 (see my match history and statistics), under
  **Accounts and history** below. Design:
  `docs/superpowers/specs/2026-10-06-accounts-and-match-history-design.md`.
- **US-019:** As players sharing one device, we want pass-and-play, so that we
  can play locally.

  Acceptance criteria:

  - The home screen offers a "Pass and play" mode leading to `/play/local`.
  - Two to four players enter their names in the seats they choose (North,
    East, South, West); bots take the empty seats. The players choose the
    variant and the bots' difficulty. Names are required, at most 30
    characters, and differ from each other.
  - The game runs on the server, like a game against bots: bots play their
    turns, and the device always shows the hand of the human whose turn it is.
  - Before a different human's turn, a full-screen hand-off screen hides every
    card and asks to pass the device to that player, who taps "I'm ready" to
    see their hand. A completed trick stays with the player who just played.
  - Pass-and-play matches are not recorded in the match history, since one
    device and one sign-in cannot tell the players apart.
  - New texts are translated into French and Dutch.
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

## Improvement user stories

These stories come from the improvement list gathered while playing the
application. They are not implemented yet.

### Terminology

**US-032 — Call computer players “bots” everywhere**

As a player, I want computer-controlled players to be consistently called
“bots”, so that the vocabulary is the same throughout the application.

Acceptance criteria:

- All UI text, in every language, uses “bot” instead of “AI”.
- Classes, endpoints, and other code identifiers are renamed from “AI” to
  “bot”.

### Bot play

**US-033 — Bots do not waste an ace on an opponent's trump**

As a player, I want bots to avoid playing an ace on a trick already trumped by
the opposing team, so that my bot partner does not give away points.

Acceptance criteria:

- When an opponent has trumped the current trick and the bot cannot win it,
  the bot does not play an ace if another legal card is available.

**US-034 — Bots do not trump the first trick when defending**

As a player, I want bots outside the contract-winning team not to play trump
on the first trick, so that they keep their trumps to defend.

Acceptance criteria:

- On the first trick, a bot whose team did not win the bidding does not play
  trump unless it has no other legal card.

**US-035 — Bots support their partner's bid**

As a player, I want bots to follow common bidding conventions with their
partner, so that the team reaches sensible contracts.

Acceptance criteria:

- A bot raises its partner's bid by 20 in the same suit when it holds:
  - the jack of the bid suit; or
  - two aces in other suits and a few cards of the bid suit.
- A bot raises its partner's bid by 10 in the same suit when it holds:
  - one ace in another suit and the nine of the bid suit; or
  - two aces in other suits and no card of the bid suit.

**US-036 — Bots do not throw valuable cards on lost tricks**

As a player, I want bots to avoid playing high-value cards on a trick that
the other team will obviously win, so that points are not given away.

Acceptance criteria:

- When the trick is clearly won by the opposing team, a bot plays its
  lowest-value legal card.

**US-037 — Bots cash their aces in time**

As a player, I want bots not to hold on to their aces too long, so that the
aces are not trumped the next time their suit is played.

Acceptance criteria:

- A bot considers the risk of an ace being trumped when that suit is next
  played, and plays the ace earlier when the risk is high.

**US-038 — Plan better bot play**

As a player, I want a plan to make bots stronger, so that games against bots
are more challenging and bot partners more reliable.

Acceptance criteria:

- A written plan identifies the main weaknesses of the current bot, possible
  algorithms, and a way to measure the bot's win rate.
- The plan is split into implementable user stories.

The plan is in `docs/bot-play-plan.md`. The stories below implement it.

**US-047 — Measure bot strength in a bot arena**

As a developer, I want to play bots against each other on repeatable deals, so
that every bot improvement is proven by a measured win rate.

Acceptance criteria:

- Deals can be generated from a seed, and the same seed gives the same deals.
- A headless arena plays two bot strategies against each other, in classic
  Belote and in Contrée. It uses the duplicate format: every deal is played
  twice, with the teams swapping seats.
- The arena reports:
  - the average point difference per deal, with a 95% confidence interval;
  - the win rate in matches to 1,000 points;
  - the contract success rate and the coinche success rate;
  - the redeal rate;
  - the decision time per card.
- The arena runs through a dedicated Gradle task and is not part of
  `./gradlew test`. A short arena run stays in the normal test suite.
- A random legal-card bot is available as a baseline.

**US-048 — Separate bot decisions from the rules engine**

As a developer, I want bot strategies to see only what their player can see,
so that bots cannot cheat and strategies can be swapped.

Acceptance criteria:

- Bidding and card-play decisions go through a bot strategy interface. A
  strategy receives only its player's view:
  - its own hand and legal cards;
  - the auction;
  - the contract;
  - the tricks played so far, with who played each card.
- `GameBoard` and `BotPlayers` no longer contain strategy rules.
- The existing bot behaviour (US-033 to US-037) is unchanged: for the same
  seed, the arena gives the same results before and after the change.

**US-049 — Make the difficulty levels play differently**

As a solo player, I want the difficulty I choose to change how well the bots
play, so that the challenge matches my experience.

Acceptance criteria:

- Each difficulty level uses its own bot strategy. Until the Challenging
  strategy exists (US-056), both levels use the current strategy.
- Bots at private tables use the Challenging strategy.

**US-050 — Bots take contracts in classic Belote**

As a player, I want bots to take a contract when their hand is strong enough,
so that I am not forced to take every contract and deals are not redealt
needlessly.

Acceptance criteria:

- A bot scores its hand for a trump suit using:
  - the jack and nine of that suit;
  - the number of trumps;
  - its aces in other suits;
  - the belote (king and queen of trumps).
- In the first round, a bot accepts the upturned suit when its score reaches a
  threshold. In the second round, it chooses its best suit other than the
  upturned one when that suit's score reaches the threshold.
- In the arena, the new bidding beats the current bidding in point difference.
  The redeal rate and contract success rate are reported.

**US-051 — Bots bid in Contrée according to their hand**

As a player, I want bots to bid what their hand is worth in Contrée, so that
their contracts are realistic and they compete with the opponents.

Acceptance criteria:

- A bot estimates the points its hand can make in each trump suit. It opens
  only when the estimate reaches 80, at the level of the estimate.
- A bot overcalls an opponent's contract when its estimate is higher than the
  current contract.
- Partner support (US-035) still applies.
- In the arena, the new bidding beats the current bidding in point difference
  in Contrée.

**US-052 — Solve a round with all cards visible**

As a developer, I want a solver that finds the best play when all hands are
known, so that stronger bots can search ahead.

Acceptance criteria:

- Given four known hands, the trump suit, and the tricks already played, the
  solver returns the best result each team can force and the card that
  achieves it. The result includes the last-trick bonus (dix de der) and the
  belote.
- Tests on hand-built endgames show the solver's results are exact.
- A benchmark gives the time to solve a full round and a round from the
  fourth trick, on the JVM and in the native image.

**US-053 — Bots play to win and score tricks**

As a player, I want bots to win tricks cheaply and give points to their
partner, so that they play like sensible card players.

Acceptance criteria:

- Bots remember the cards played. They know which cards are masters, how many
  trumps remain, and which suits each player has shown to be void in.
- When the trick is not yet won by its partner, a bot wins it with its
  cheapest winning card, where that is possible and worth it.
- When its partner is sure to win the trick, a bot adds its highest-value
  card that it does not need later.
- When leading, a bot prefers its master cards. It avoids leading a suit in
  which it holds the ten without the ace.
- In the arena, the new card play beats the current card play in point
  difference.

**US-054 — Declaring bots manage their trumps**

As a player, I want a bot that holds the contract to take control with its
trumps, so that it makes its contract more often.

Acceptance criteria:

- A bot on the declaring team leads trumps while the opponents may still hold
  trumps and its team holds the master trump.
- A bot keeps its jack and nine of trumps to regain the lead, rather than
  using them on low-value tricks.
- In the arena, the contract success rate rises compared with the previous
  strategy, and the point difference is positive.

**US-055 — Bots coinche contracts they expect to defeat**

As a player, I want bots to coinche when they are confident of defeating the
contract, so that overbidding is punished.

Acceptance criteria:

- A defending bot coinches when its estimated defensive points make the
  contract very likely to fail.
- In the arena, coinches by bots succeed at least two times out of three, and
  coinching improves the point difference.

**US-056 — Challenging bots search before playing a card**

As an experienced player, I want Challenging bots to look ahead before
choosing a card, so that the game is a real challenge.

Acceptance criteria:

- To choose a card, a Challenging bot:
  1. samples many deals of the unseen cards, consistent with its own hand,
     the cards played, and the voids shown;
  2. solves each sample with the solver (US-052);
  3. plays the card with the best average result.
- A bot uses only information its player can see.
- A bot chooses a card within a configurable time budget, 200 ms by default,
  on the JVM and in the native image.
- With a fixed seed, a bot's decisions are repeatable.
- In the arena, the Challenging strategy beats the Relaxed strategy in point
  difference in both variants. The lower bound of the 95% confidence interval
  is above zero.

### Table presentation

**US-039 — Fit the table on a laptop screen**

As a player on a laptop, I want the table and the UI to fit my screen, so that
I can play without scrolling or zooming out.

Acceptance criteria:

- On typical laptop screen sizes, the whole table, the player's hand, and the
  game controls are visible without scrolling.

**US-040 — Animate bidding at private tables**

As a player at a private table, I want the same bidding animations as in bot
games, so that I can follow each player's decision.

Acceptance criteria:

- The bidding animations of US-021 are also shown at private tables.

**US-041 — Collect tricks automatically**

As a player, I want completed tricks to be collected automatically after a
short delay, so that I can see the cards without having to press a button.

Acceptance criteria:

- The “pick up the trick” button is removed.
- A completed trick stays visible long enough for players to see the cards,
  then is collected with an animation.

**US-042 — Play the last trick automatically**

As a player, I want the last trick to be played automatically, so that I do
not have to play a card that is my only choice.

Acceptance criteria:

- When each player has one card left, the application plays them
  automatically, one after the other, without waiting for the players.

### Private tables

**US-043 — Choose seats when starting with bots**

As a private table owner who starts a game without all players, I want the
players to choose their positions at the table, so that we can pick our
partners.

Acceptance criteria:

- Before a game starts with bots, the human players can choose their seats.
- Bots take the remaining seats.

### Scoring

**US-044 — Score a capot**

As a player, I want a team that takes every trick to receive the capot score,
so that the scoring follows the rules.

Acceptance criteria:

- A team that takes all the tricks of a round scores 250 instead of 162.
- In Coinchee/Contree, the team also scores its bid.
- Belote/Rebelote adds 20 points to the declaring team.

**US-045 — Accumulate scores across rounds**

As a player, I want team scores to accumulate between rounds in bot games and
at private tables, so that we play a full match.

Acceptance criteria:

- Team scores are added up round after round, both in bot games and at
  private tables.

**US-046 — Win the match at 1,000 points**

As a player, I want the first team to reach 1,000 points to win the match, so
that the match has a clear end.

Acceptance criteria:

- The match ends when a team reaches 1,000 points, both in bot games and at
  private tables, and the winning team is announced.

### Accounts and history

**US-057 — Sign in with an OAuth provider**

As a player, I want to sign in with an existing Google or GitHub account, so
that the game can remember my matches without a new password.

Acceptance criteria:

- The home screen offers "Sign in with Google" and "Sign in with GitHub" for
  each configured provider, and nothing when none is configured.
- The first sign-in creates an account named after the provider's profile
  (name, else login). Later sign-ins with the same provider account find it.
- When signed in, the home screen shows the player's name and a "Sign out"
  button, and the name is suggested when creating or joining a table.
- Guests can still play every mode without signing in.
- Accounts are stored in MariaDB (PostgreSQL until ADR-002), created by a
  Flyway migration.
- Provider credentials and the database come from environment variables,
  documented in the README with the Docker Compose setup.
- New texts are translated into French and Dutch.

**US-058 — Record finished matches**

As a signed-in player, I want my finished matches recorded, so that I can look
back at them. Criteria in the design document.

**US-059 — See my match history and statistics**

As a signed-in player, I want to see my results, so that I can follow my
progress. Criteria in the design document.

## Decisions required before implementation

- Confirm the initial platform: web, mobile, or both.
- Confirm whether online play is in scope for the first release or follows the
  AI-only playable version.
- Select the authoritative classic-Belote rules source and regional options.
- ~~Decide whether guests may play online and what account model is required.~~
  Guests play every mode; accounts sign in with OAuth (US-057).
- Define the privacy, moderation, and age requirements before adding chat or
  public matchmaking.
