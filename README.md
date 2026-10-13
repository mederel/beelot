# Beelot

A web application for playing French Belote.

## Prerequisites

- Java 21 or later (the project compiles with Java 21 source compatibility)
- No local Gradle installation is required; use the committed Gradle wrapper.
- Docker, for the MariaDB database, Mailpit (sign-in emails) and the tests
  (Testcontainers).

## Run locally

```bash
docker compose up -d --wait   # MariaDB on localhost:3306 (database, user and password: beelot), Mailpit
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

## Accounts

Players sign in with a link sent to their email address, or with Google or
GitHub (ADR-004); guests can still play every mode. There are no passwords and
no separate registration: the first sign-in creates the account, and players
appear under a random pseudonym such as "Swift Otter 42".

Signing in with an email link:

- **Sign in** on the home screen asks for an email address. Beelot answers
  "check your inbox" and emails a link, `{public-url}/sign-in?token=…`, in the
  player's language (English, French or Dutch). `{public-url}` is
  `BEELOT_PUBLIC_URL`, never taken from the request.
- The link works once and expires after 15 minutes
  (`beelot.sign-in.link-lifetime`, default `PT15M`). Only a SHA-256 hash of
  the token is stored, and expired tokens are purged every hour.
- The link opens a page where the player confirms with a button, so a mail
  scanner that opens the link does not use up the token. Opening the link
  proves the address: there is no separate confirmation.
- Link requests are limited to 3 per address per 15 minutes
  (`beelot.sign-in.limit-per-address`) and 10 per client IP address per hour
  (`beelot.sign-in.limit-per-ip`); beyond that the request gets `429`. If the
  mail server fails, it gets `503`.

Locally, every email lands in [Mailpit](https://mailpit.axllent.org), started
by Docker Compose: SMTP on `localhost:1025`, inbox on
[http://localhost:8025](http://localhost:8025). The defaults point at it, so
`./gradlew bootRun` needs no configuration. Elsewhere, set:

```bash
export BEELOT_PUBLIC_URL=https://beelot.example   # default http://localhost:8080
export BEELOT_MAIL_HOST=smtp.example              # default localhost
export BEELOT_MAIL_PORT=587                       # default 1025
export BEELOT_MAIL_USERNAME=...                   # default none
export BEELOT_MAIL_PASSWORD=...                   # default none
export BEELOT_MAIL_FROM='Beelot <no-reply@beelot.example>'
```

`BEELOT_PUBLIC_URL` is the address players use to reach Beelot.
`BEELOT_MAIL_FROM` defaults to `Beelot <no-reply@beelot.localhost>`.

Google and GitHub sign-in are direct OAuth providers. Each is offered once
both its client id and secret are set, as environment variables:

```bash
export SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_ID=...
export SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GOOGLE_CLIENT_SECRET=...
export SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GITHUB_CLIENT_ID=...
export SPRING_SECURITY_OAUTH2_CLIENT_REGISTRATION_GITHUB_CLIENT_SECRET=...
```

or in a git-ignored `.env` file in the working directory. That file is read as
a properties file, so it needs the property names, not the upper-case ones:

```properties
spring.security.oauth2.client.registration.google.client-id=...
spring.security.oauth2.client.registration.google.client-secret=...
spring.security.oauth2.client.registration.github.client-id=...
spring.security.oauth2.client.registration.github.client-secret=...
```

Register the OAuth apps with the callback URLs
`{public-url}/login/oauth2/code/google` and
`{public-url}/login/oauth2/code/github` (locally,
`http://localhost:8080/login/oauth2/code/google` and
`http://localhost:8080/login/oauth2/code/github`). Beelot asks Google for the
`openid` scope only and GitHub for no scope, so it learns nothing but the
provider's user id.

An account stores the provider's user id (Google or GitHub) or, for email-link
players, their address in a table of its own, with the pseudonym and sign-in
dates: no name, and the address is used only to send sign-in links. When a
match with a signed-in player is won, solo or at a table, it is stored with its
seats, final score and every round (contract, trump, coinche, capot, belote,
points); guests' matches are not stored.
Signed-in players see their results on **My statistics** (`/stats`): matches
won and lost overall, per variant and per solo difficulty, their 20 latest
matches, their team's contracts, coinches, capots and belotes, and its average
points per round. Signing in starts a server session (kept in memory, 7 days);
requests that change state must then echo the `XSRF-TOKEN` cookie in an
`X-XSRF-TOKEN` header, which the web client does.

## Privacy

The privacy policy (`/privacy`, US-083) names who runs Beelot and the services
it relies on. These values come from the environment where Beelot runs; each
one left unset is shown as "not configured" and logged as a warning at startup:

```bash
export BEELOT_PRIVACY_CONTROLLER='Jane Doe'          # the data controller
export BEELOT_PRIVACY_CONTACT=privacy@beelot.example # where players send requests
export BEELOT_HOSTING_PROVIDER='Hosting company'     # who hosts the server and database
export BEELOT_SMTP_PROVIDER='Mail company'           # who sends the sign-in emails
export BEELOT_BACKUP_RETENTION_DAYS=30               # days before a backup is overwritten
```

In `.env`, use the property names instead: `beelot.privacy.controller`,
`beelot.privacy.contact`, `beelot.privacy.hosting-provider`,
`beelot.privacy.smtp-provider` and `beelot.privacy.backup-retention-days`.

Players download their data and delete their account in **Settings → Your
data** (US-081, US-082). Deleting needs a sign-in less than 10 minutes old;
finished matches stay in the other players' history, with the deleted
player's seats shown as "Deleted player". Every night at 03:30 UTC
(`beelot.privacy.retention-cron`), Beelot purges security events older than
12 months and deletes accounts without a sign-in for 3 years; email-link
players are warned by email 30 days before.

Before running Beelot in production:

- Sign a data processing agreement (GDPR article 28) with the hosting provider
  and the SMTP provider.
- Make sure database backups are overwritten within
  `BEELOT_BACKUP_RETENTION_DAYS` days: the policy promises it, and a deleted
  account lives on in older backups until then.
- Read the [data breach procedure](docs/privacy/data-breach-procedure.md).

## Verify

```bash
./gradlew test
```

The tests start their own MariaDB container, so Docker must be running.

GitHub Actions runs `./gradlew build` on every push to `master` and on every
pull request (`.github/workflows/build.yml`). When it fails, the test reports
are attached to the run as the `test-reports` artifact.

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
