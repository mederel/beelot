# Beelot

A web application for playing French Belote.

## Prerequisites

- Java 21 or later (the project compiles with Java 21 source compatibility)
- No local Gradle installation is required; use the committed Gradle wrapper.
- Docker, for the MariaDB database, Zitadel (sign-in) and the tests
  (Testcontainers).
- `curl` and `jq`, for `zitadel/provision.sh`.

## Run locally

```bash
docker compose up -d --wait   # MariaDB on localhost:3306 (database, user and password: beelot), Zitadel
zitadel/provision.sh          # once: sign-in settings and client (see Accounts below)
./gradlew bootRun
```

The database connection can be changed with `BEELOT_DATABASE_URL`,
`BEELOT_DATABASE_USERNAME` and `BEELOT_DATABASE_PASSWORD`. Flyway creates and
migrates the schema (`src/main/resources/db/migration`) at startup.

Open [http://localhost:8080](http://localhost:8080). The home screen links to
the bot, pass-and-play, private online game, public matchmaking ("Find a
game"), tutorial, and rules routes.

Pass and play (`/play/local`) lets two to four people share one device: each
writes their name in a seat, and bots take the empty ones. The game runs like a
game against bots, and before each turn of a different human a hand-off screen
hides every card until that player taps "I'm ready". Pass-and-play matches are
not recorded in the match history.

At a private table, players pick their seats in the lobby before the game
starts; partners sit across from each other. When the owner starts with bots,
the bots take the seats left empty.

Public matchmaking seats players at an open table of their variant. The game
starts when four players are seated, or after `beelot.matchmaking.bot-fill-wait`
(default 60 seconds) with bots in the empty seats; a background sweep checks
waiting tables every `beelot.matchmaking.sweep-interval` (default 5 seconds).

At private and public tables, seated players can send preset reactions
("Well played!", "Oops!", …) during a match; there is no free text. Each
player may send three reactions in ten seconds, other players see them next
to the sender's seat for a few seconds, and **Settings → Reactions** turns
them off.

Completed tricks are collected automatically. At private and public tables the
server keeps a trick on the table for `beelot.private-table.trick-review`
(default 4 seconds) after a player first loads it, so every player sees it
before it is collected.

The last trick is played automatically: once the seventh trick is collected,
each player's only remaining card is played in turn, and the table reveals the
cards one after the other.

## Accounts (Zitadel)

Players create an account or sign in through [Zitadel](https://zitadel.com)
(ADR-003); guests can still play every mode. Zitadel hosts the registration,
sign-in and email-confirmation pages and stores the passwords. Beelot asks for
the `openid` scope only, so it learns nothing but the Zitadel user id; players
appear under a random pseudonym such as "Swift Otter 42". Google and GitHub
sign-in are configured inside Zitadel.

Run Zitadel locally with Docker Compose, then apply Beelot's settings:

```bash
docker compose up -d --wait   # MariaDB, Zitadel on :8081, Mailpit on :8025
zitadel/provision.sh          # settings, OIDC client, and a git-ignored .env
./gradlew bootRun             # reads .env
```

- Emails (confirmation codes, password resets) land in Mailpit:
  `http://localhost:8025`.
- Zitadel console: `http://localhost:8081/ui/console`, user
  `zitadel-admin@zitadel.localhost`, password `Password1!` (local only).
- `zitadel/provision.sh` can be run again at any time. It sets passwords of at
  least 12 characters, a lock after 10 failed attempts, registration, English,
  French and Dutch, Beelot's colours and the mail server, creates the `Beelot`
  project and its `beelot-web` client, makes email confirmation codes expire
  after 24 hours, creates the `beelot-jobs` service account (role
  `ORG_USER_MANAGER` on the organization only), and writes the client and that
  account's token to `.env`.
- Google and GitHub sign-in: set `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
  and/or `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` before running the script,
  and register the OAuth apps with the callback URL
  `http://localhost:8081/idps/callback`.

In production, run the script against the Zitadel instance with
`ZITADEL_URL`, `BEELOT_URL`, `ZITADEL_TOKEN` (a service account with the IAM
owner role) and `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`,
`SMTP_SENDER`, and give the server its client through the environment:

```bash
export BEELOT_ZITADEL_ISSUER=https://<instance>.zitadel.cloud
export BEELOT_ZITADEL_CLIENT_ID=...
export BEELOT_ZITADEL_CLIENT_SECRET=...
export BEELOT_ZITADEL_API_TOKEN=...   # token of beelot-jobs, written by provision.sh
```

Without them, sign-in is not offered.

Zitadel users who never confirmed their address and never signed in to Beelot
are deleted through Zitadel's API 7 days after registration, by a job that runs
every hour (US-076). `beelot.account.unconfirmed-retention` (default `P7D`) and
`beelot.account.cleanup-interval` (default `PT1H`) change these durations.
Without `BEELOT_ZITADEL_API_TOKEN`, no account is cleaned up.

An account stores only the Zitadel user id, the pseudonym and sign-in dates:
no name and no email address. When a match with a signed-in player is won,
solo or at a table, it is stored with its seats, final score and every round (contract,
trump, coinche, capot, belote, points); guests' matches are not stored.
Signed-in players see their results on **My statistics** (`/stats`): matches
won and lost overall, per variant and per solo difficulty, their 20 latest
matches, their team's contracts, coinches, capots and belotes, and its average
points per round. Signing in starts a server session (kept in memory, 7 days);
requests that change state must then echo the `XSRF-TOKEN` cookie in an
`X-XSRF-TOKEN` header, which the web client does.

## Verify

```bash
./gradlew test
```

The tests start their own MariaDB container, so Docker must be running.

## Bot arena

The bot arena measures bot strength by playing two bots against each other on
seeded deals, with no UI. Every deal is played twice with the teams swapping
seats (duplicate format), in classic Belote and in Contrée:

```bash
./gradlew botArena
./gradlew botArena -Pfirst=current -Psecond=random -Pdeals=10000 -Pseed=1 -Pvariant=both
./gradlew botArenaNative -Pfirst=challenging -Psecond=current -Pdeals=1000   # as a native image
```

Available bots are `current` (the Relaxed bot), `challenging` (the
Challenging bot, which searches sampled deals before playing a card), `baseline` (plays its
cards like `current` but bids as bots did before US-050 and US-051: it never
takes in classic Belote and opens 80 in its longest suit in Contrée),
`previous-play` (bids like `current` but plays its cards as bots did before
US-053), `previous-trumps` (plays like `current` but without the trump
management of US-054), `no-coinche` (bids and plays like `current` but never
coinches, as bots did before US-055) and `random` (bids like `current`, then plays a random legal card).
The report gives the average point difference per deal with a 95% confidence
interval, the win rate in
matches to 1,000 points, contract and coinche success rates, the redeal rate,
and the decision time per card. It is printed and written to
`build/reports/bot-arena/report.txt`. The arena is not part of
`./gradlew test`; a short run in `BotArenaTest` is.

Bots decide through a `BotStrategy` (package `fr.beelot.game.bot`), which only
receives its player's view: its own hand and legal cards, the auction, the
contract, and the tricks played so far with the seat that played each card.
Each difficulty level plays its own strategy (`BotStrategies`), and bots at
private and public tables play the Challenging one. Relaxed bots follow
hand-written rules (`RuleBasedStrategy`). Challenging bots (`SamplingStrategy`)
bid like them; to choose a card, they sample deals of the cards they have not
seen, consistent with their hand, the cards played and the voids shown, solve
each sample with `DoubleDummySolver` for every legal card, and play the card
with the best average score. They follow the rules for the first tricks, where
solving takes too long, and stop sampling at their time budget (200 ms by
default). With a fixed seed, their decisions are repeatable as long as the
budget does not cut a search short. To try a new strategy in the arena, add an
`ArenaBot` for it to `ArenaBot.AVAILABLE`.

## Solver benchmark

`DoubleDummySolver` finds the best play of a round when all four hands are
known, for bots that search ahead. Its benchmark times it on seeded deals, for
a full round and from the fourth trick:

```bash
./gradlew solverBenchmark                 # on the JVM
./gradlew solverBenchmarkNative           # builds and runs a native image
./gradlew solverBenchmark -Pdeals=200 -Pseed=1
```

## Native executable

The app can be compiled ahead of time to a standalone GraalVM native image
(about 50 ms startup, no JVM needed at runtime):

```bash
./gradlew nativeCompile
build/native/nativeCompile/beelot
```

Like the JVM build, it needs the MariaDB database and reads the database
and sign-in settings from the environment when it starts.

The build needs a C toolchain (`gcc`, `zlib` headers) and roughly 8 GB of free
memory. It uses a GraalVM 25 toolchain, which Gradle downloads automatically
(via the Foojay resolver in `settings.gradle`) if none is installed. Use
`./gradlew nativeTest` to run the tests as a native image.

## Languages

The interface is available in French, English and Dutch. French is the
default; players can switch under **Settings → Language**, and the choice is
remembered. The engine and the French strings live in
`src/main/resources/static/i18n.js`, keyed by the English text; Dutch is in
`i18n-nl.js`. Anything without an entry falls back to English. Messages
generated by the server are translated client-side by the same files.

To add a language, create `i18n-<code>.js` modelled on `i18n-nl.js`, load it
before `i18n.js` in `index.html`, add it to `supportedLanguages` in
`i18n.js`, and add an option to the language selector.

## Sound effects

Card dealing, card play, bids, trick and round results, and tutorial answers
have sound effects. They are synthesised in the browser with the Web Audio API
(`src/main/resources/static/sounds.js`), so there are no audio files to ship.
Players can turn them off under **Settings → Sound effects**.

## Abuse and memory protection

Game state is held in memory, so the server bounds its own resource use
(defaults live in `src/main/resources/application.properties`):

- **Rate limiting** per client address on `/api/**`
  (`beelot.security.rate-limit.*`): 300 requests/minute overall and 20
  game/table creations, joins or quick matches per minute. Excess requests get `429` with
  `Retry-After`. Behind a reverse proxy, set
  `server.forward-headers-strategy=native` so the real client address is used.
- **Request size**: API bodies over 4 KB get `413` (`beelot.security.max-request-bytes`).
- **Capacity caps**: at most 5000 bot games and 2000 private and public tables
  (`beelot.limits.*`); beyond that creation returns `503`.
- **Idle eviction**: games and tables untouched for 2 hours are removed
  (`beelot.limits.idle-expiry`).
- **Tomcat limits**: thread, connection, timeout and header-size caps.
- Player names are limited to 30 characters.
