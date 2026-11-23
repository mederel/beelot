# Coached tutorial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/tutorial` plays a real game with the four hands face up, and a coach names the card to play and why it beats each other legal card (US-199).

**Architecture:** A tutorial is a `Local` table whose origin carries a `Tutorial` (a lesson, or the free game). A lesson starts in the play from fixed hands and its bots play a script (`ScriptedBot`, a `BotStrategy`). A pure `explain_card(view, best)` in `beelot-game` gives the reason of the coached card and a reason for each other legal card; lessons and the free game share it, so there is one set of texts. The table computes the coach for the human's turn and refuses any other card; the snapshot carries it and all four hands; the client renders it.

**Tech Stack:** Rust (beelot-game, beelot-table, beelot-server), Svelte 5, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-23-coached-tutorial-design.md` (amended by this plan, see "Changes to the spec").

## Changes to the spec

Found while reading the code; the spec is amended in the same commit.

- **No new `TableKind`.** A `Local` table with `Origin.tutorial: Option<Tutorial>` (as `daily` is), so metrics, counts, admin, streams and the history keep their `match` arms. Not listed, not counted as a finished match, and not saved (the task skips `Persist` for it).
- **Lesson explanations are derived, not hand-written.** A lesson step is a scripted card; its reason codes come from `explain_card`, and a test pins the reason the lesson teaches. One set of texts in three languages serves lessons and the free game.
- **The refusal is generic** (`tutorial-card`); the "why not" of every legal card is in the snapshot's `coach`, so the client shows it on a tap without a round trip.
- **Calls of the free game are advised, not enforced.** The coach shows the existing auction hint's reason on the player's turn to call; any legal call is accepted.

## Global Constraints

- Every new text goes through `t()` with French and Dutch in `src/lib/i18n/fr.ts` and `nl.ts`; the server sends codes, never prose.
- No `style="…"` attribute and no `{@html}` in components (use `style:`); `static/` is rebuilt by `npm run build` and committed; never edit it by hand.
- The server's new JSON is camelCase; reasons are SCREAMING_SNAKE codes like `CardReason`.
- Commits are Conventional Commits; the PR title `feat: coach a tutorial game with every hand face up (US-199)`; `Cargo.lock` unchanged unless a `Cargo.toml` changes.
- Checks before the PR: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace` (Docker running), and in `crates/beelot-server/web/`: `npm ci && npm run check && npm run lint && npm test && npm run build`.

## Review Focus

- A lesson whose scripted card is illegal at its step, or whose bots' script leaves the player without a turn: the lesson test plays each lesson to its end.
- The player taps a legal card that is not the coached one, or an illegal one: the refusal differs (`tutorial-card` vs the usual `illegal-card`); the table does not change.
- A tutorial table reaches the end of a match: nothing goes to the history, the statistics or a daily board.
- Another viewer (a spectator, a stream ticket) of a tutorial table: `coach` and `allHands` are for the device's owner only; a tutorial has no spectators.
- Restart of the server mid-lesson: the table is not saved, so the token is unknown and the client starts the lesson again instead of showing an error.

---

### Task 1: `explain_card` in `beelot-game`

**Files:**
- Modify: `crates/beelot-game/src/bot/hints.rs` (add next to `card_hint`; tests in its `tests` module)

**Interfaces:**
- Produces:
  - `pub enum WhyNot { OvertakesPartner, LosesTheTrick, TooStrong, GivesPointsAway, KeepsPointsFromPartner, TrumpFirst, CashMasterFirst, WeakerForTheRound }` (`Clone, Copy, Debug, PartialEq, Eq, Serialize`, `rename_all = "SCREAMING_SNAKE_CASE"`)
  - `pub struct CardExplanation { pub card: Card, pub why: CardReason, pub others: Vec<(Card, WhyNot)> }`
  - `pub fn explain_card(view: &PlayView, best: Card) -> CardExplanation`: pure, no search. `others` lists every other card of `view.legal_cards` once, in the order of `legal_cards`.

- [ ] **Step 1: Write the failing tests** using the module's `classic(hand, trick)` helper (trump hearts, viewer at seat 0), one per code, each asserting the code of the named card:
  - `overtaking_the_partners_winning_card_is_overtakes_partner`: trick `[(1,"7H"),(2,"9H")]` (the partner, seat 2, is winning with a trump), hand `JH 8H`, best `8H`, other `JH` = `OvertakesPartner`.
  - `a_card_that_cannot_win_when_another_can_is_loses_the_trick`: trick `[(1,"10D")]` (an opponent leads), hand `AD 7D`, best `AD`, other `7D` = `LosesTheTrick`.
  - `a_dearer_winner_than_needed_is_too_strong`: trick `[(1,"7D")]` hand `10D AD`, best `10D`, other `AD` = `TooStrong`.
  - `points_given_to_the_opponents_are_gives_points_away`: trick `[(1,"AC")]` (opponents winning, nothing beats), hand `10C 7C` (follow suit), best `7C`, other `10C` = `GivesPointsAway`.
  - `a_trump_lead_beats_a_plain_card_when_the_best_leads_trumps`: no trick, hand `JH 7C`, best `JH`, other `7C` = `TrumpFirst`.
  - `the_fallback_is_weaker_for_the_round`: a case where no rule applies asserts `WeakerForTheRound`.
  - `every_other_legal_card_is_explained_once`: over seeded deals (`dealt_board(seed)` exists in the module), for 200 plays of the Challenging hint, `others` holds each legal card but the best exactly once, and the best never appears in `others`.
  - `the_fallback_is_rare`: over the same 200 plays, `why == BestForRound` or `WeakerForTheRound` together are at most a tenth of the explained cards; if it fails, add a rule, not a looser bound.
  The viewer is seat 0, so a trick has at most seats 1, 2, 3 before it, in that play order. The hands above are the ones to start from; adjust a hand only to keep the case legal, and keep the asserted code.

- [ ] **Step 2: Run** `cargo test -p beelot-game explain` → FAIL (`explain_card` not defined).

- [ ] **Step 3: Implement** `explain_card`. For each other legal card `c` apply the first rule that holds, with `winning`, `lead`, `beats(x)`, `partner_winning` as in `follow_reason`:
  1. following, `partner_winning` and `beats(c)` → `OvertakesPartner`;
  2. following, `!partner_winning`, `beats(best)` and `!beats(c)` → `LosesTheTrick`;
  3. `beats(c)` and `beats(best)` and `by_value(c) > by_value(best)` → `TooStrong`;
  4. following, `points(c) > points(best)` and the trick is not safe for the partner → `GivesPointsAway`;
  5. following, `partner_winning`, safe, `points(c) < points(best)` → `KeepsPointsFromPartner`;
  6. leading, `best` is a trump and `c` is not → `TrumpFirst`; leading, `why == CashMaster` and `c` is not that master → `CashMasterFirst`;
  7. otherwise `WeakerForTheRound`.
  `why` is `card_reason(view, best)`. Reuse `CardMemory`, `by_value`, `rules::beats` and `rules::points` as `follow_reason` does; extract the shared `partner_winning`/`sure` computation into a helper rather than copying it.

- [ ] **Step 4: Run** `cargo test -p beelot-game` → PASS.

- [ ] **Step 5: Commit** `feat: say why each other card is weaker than the hinted one (US-199)`.

---

### Task 2: A round dealt from given hands, and a scripted bot

**Files:**
- Modify: `crates/beelot-game/src/bidding.rs` (add the constructor and a test)
- Create: `crates/beelot-table/src/tutorial.rs` (lessons, `ScriptedBot`); register in `lib.rs`

**Interfaces:**
- Produces:
  - `BiddingState::preset(variant: Variant, dealer: Seat, hands: [Vec<Card>; 4], trump: Suit, declarer: Seat) -> BiddingState`: a bidding already complete, `completed_board()` is `GameBoard::from_bidding(hands, trump, declarer, dealer, false)`. Its `deal_summary` and `auction` are empty/neutral and `upturned_card` is `None`.
  - `pub struct Lesson { pub id: &'static str, pub dealer: usize, pub trump: Suit, pub declarer: usize, pub hands: [&'static str; 4], pub script: &'static str, pub coached: &'static [usize], pub teaches: CardReason }` (hands and script are space-separated card codes, `"AH 10H …"`; `script` lists every card played in play order for as many plays as the lesson goes; `coached` lists the indexes into `script` that are the human's (seat 0) plays to coach; `teaches` the reason the first coached step must give).
  - `pub fn lessons() -> &'static [Lesson]`, `pub fn lesson(id: &str) -> Option<&'static Lesson>`.
  - `pub struct ScriptedBot { pub script: Vec<Card>, fallback: &'static dyn BotStrategy }` implementing `BotStrategy`: `choose_card(view)` returns `script[view.tricks.len() * 4 + view.current_trick.len()]` and, past the script's end, the Challenging bot's card; `decide_auction` is never called for a lesson.

- [ ] **Step 1: Failing tests**: in `bidding.rs`, `preset_is_complete_and_keeps_the_hands` (the board's `hand(seat)` equals the given hands, `completed_board().is_some()`, `active_seat` of the board is `(dealer + 1) % 4`). In `tutorial.rs`, `every_lesson_plays_to_its_end`: for each lesson, build the board from `preset`, play `script` card by card with `board.play(seat, card, false)` where the seat is `board.active_seat()`, asserting each is accepted; assert every index of `coached` is a play of seat 0; assert for the first coached step that `explain_card(view, card).why == lesson.teaches`; assert every other legal card of each coached step has an explanation. `lesson_ids_are_unique`.

- [ ] **Step 2: Run** `cargo test -p beelot-game preset && cargo test -p beelot-table tutorial` → FAIL.

- [ ] **Step 3: Implement** the constructor (set `hands`, `dealer`, `active`, `completed_board`, `variant`, leave the rest as `new` leaves it; `deals: 1`), then `tutorial.rs`. Author **six lessons**, each from a hand that you check legal with the test: (1) `lead-trump` teaches `LeadTrumps`; (2) `win-cheaply` teaches `WinCheaply`; (3) `follow-suit` teaches `KeepPartnersTrick` with a forced follow; (4) `cut` teaches `WinCheaply` with a trump over a plain lead; (5) `partners-trick` teaches `KeepPartnersTrick`; (6) `give-points` teaches `GivePoints`. Seat 0 is the human; north-south is the human's team and declares in all six. Two or three coached plays per lesson; a lesson's script ends right after its last coached play's trick is complete.

- [ ] **Step 4: Run** the tests → PASS.

- [ ] **Step 5: Commit** `feat: deal a round from given hands and script a lesson's bots (US-199)`.

---

### Task 3: The tutorial table and its coach

**Files:**
- Modify: `crates/beelot-table/src/event.rs` (`Origin.tutorial` with `#[serde(default)]`), `crates/beelot-table/src/table.rs`, `crates/beelot-table/src/messages.rs`, `crates/beelot-table/src/lib.rs`
- Test: `crates/beelot-table/src/tutorial_tests.rs` (new, `mod` in `lib.rs`)

**Interfaces:**
- Consumes: Task 1 (`explain_card`, `WhyNot`), Task 2 (`Lesson`, `lesson`, `ScriptedBot`, `BiddingState::preset`).
- Produces:
  - `pub enum Tutorial { Lesson { id: String }, Free }` (`Serialize, Deserialize, Clone, Debug, PartialEq`) in `event.rs`; `Origin.tutorial: Option<Tutorial>`.
  - `Table::tutorial(id: Uuid, tutorial: Tutorial, setup: TableSetup, now: OffsetDateTime) -> Result<Table, Refusal>` (`NotFound` for an unknown lesson id). A lesson table starts in the play (a `Dealt`-equivalent: see Step 3); the free game is `Table::local` with the Challenging bots, one match to a target of 301, seats `local_seats(None)`.
  - `Table::tutorial_kind(&self) -> Option<&Tutorial>`.
  - `pub struct Coach { pub lesson: Option<LessonProgress>, pub card: Card, pub why: CardReason, pub others: Vec<(Card, WhyNot)> }`, `pub struct LessonProgress { pub id: String, pub step: usize, pub steps: usize }`, and `Table::coach(&self) -> Option<Coach>`: `Some` only on the human's turn to play a card at a tutorial table.
  - The `Action::Card` path refuses a legal card other than `coach.card` with `Refusal::conflict("tutorial-card", msg::TUTORIAL_CARD)` before any event is emitted. An illegal card keeps `illegal-card`.
  - A tutorial table never sets `pending.finished`.
  - `Table::lesson_done(&self) -> bool`: true once the lesson's last coached card has been played.

- [ ] **Step 1: Failing tests** in `tutorial_tests.rs`: `a_lesson_table_starts_in_the_play_with_the_lessons_hands`; `coach_names_the_scripted_card_on_the_players_turn_and_none_otherwise`; `a_legal_card_that_is_not_coached_is_refused_with_tutorial_card_and_changes_nothing` (compare `version()` and `board()` hands before/after); `an_illegal_card_keeps_its_usual_refusal`; `playing_the_coached_cards_finishes_every_lesson` (loop over `lessons()`, always `apply` the coach's card, assert `lesson_done()` at the end and that bots followed the script); `a_tutorial_match_is_never_handed_to_the_history` (free table: play coached cards until the match ends or, to keep the test fast, set the target low through a test-only `TableSetup`; assert `Outcome.finished` is `None`); `the_free_game_coach_agrees_with_the_hint` (`coach().card` equals `hint(...)`'s card); `origin_round_trips_with_a_tutorial_and_reads_older_origins` (serde of an `Origin` JSON without the field gives `tutorial: None`).

- [ ] **Step 2: Run** `cargo test -p beelot-table tutorial` → FAIL.

- [ ] **Step 3: Implement.**
  - Lesson start: in `Table::tutorial`, for `Lesson` build the lobby as `Lobby::local(local_seats(None)?, Variant::Classic, false, false, 301)`, set `strategy` to a leaked `ScriptedBot`, emit `MatchBegan`, then `Dealt { dealer, seed: 0, from_pile: false }` as usual; in `deal()` (the only place a phase is dealt), when `self.origin.tutorial` is a `Lesson`, set `self.phase = Phase::Play { bidding: BiddingState::preset(...), board }` from the lesson instead of an auction. Replay is deterministic from the origin.
  - `coach()`: a lesson step is `script` index `board.completed_tricks() * 4 + board.visible_trick().len()` looked up in `coached`; the card is `script[index]`; explanation is `explain_card(&board.play_view(0), card)`. Free game: `card_hint(&view).card`, cached in a `coach_card: Option<(u64 /*moves*/, Card)>` so a snapshot does not search again (clear it in `refresh` after each change; recompute lazily on the first `coach()` of a move through `&mut self` in `changed()`, not in a getter).
  - Enforcement: in the `Action::Card` arm, after `mover`, when `self.coach()` is `Some` and the card is legal but not `coach.card` → the refusal above.
  - `msg::TUTORIAL_CARD`: English "That is not the card the coach asked for."; add its French and Dutch to the catalogue the file keeps (follow the neighbours).
  - Suppress `pending.finished` in `record_round_if_complete` when `self.origin.tutorial.is_some()`.
  - `Left` already removes a `Local` table.

- [ ] **Step 4: Run** `cargo test -p beelot-table` → PASS.

- [ ] **Step 5: Commit** `feat: a tutorial table with a coach that accepts only the coached card (US-199)`.

---

### Task 4: Server: create, snapshot, do not save

**Files:**
- Modify: `crates/beelot-server/src/tables/registry.rs` (`create_tutorial`), `crates/beelot-server/src/routes/tables.rs` (route), `crates/beelot-server/src/api/snapshot.rs` (`coach`, `all_hands`), `crates/beelot-server/src/tables/task.rs` (skip `Persist`), `crates/beelot-server/src/app.rs` only if a path is needed
- Test: `crates/beelot-server/src/tables/registry_tests.rs`, a snapshot test next to the existing ones, a route test next to the existing table route tests

**Interfaces:**
- Consumes: Task 3 (`Table::tutorial`, `Table::coach`, `Tutorial`).
- Produces:
  - `POST /api/tutorial/tables` body `{ "lesson": "<id>" }` or `{}` for the free game → the same JSON as `POST /api/tables` (`Access`); `404` for an unknown lesson. Rate and place limits: it reserves a `Local` place as `create_local` does.
  - `Snapshot.coach: Option<CoachView>` = `{ lesson?: {id, step, steps}, card: CardView, why: CardReason, others: [{card: CardView, whyNot: WhyNot}], lessonDone: bool }`, present only for the device actor of a tutorial table; `BoardView.allHands: Option<Vec<Vec<CardView>>>` (four hands in seat order, sorted like `hand`), same condition.
  - A tutorial table has `hints: false`; the task does not build a `Persist` for it.

- [ ] **Step 1: Failing tests**: `create_tutorial_opens_a_local_table_with_the_lessons_hands`; `an_unknown_lesson_is_not_found`; `a_tutorial_snapshot_shows_all_four_hands_and_the_coach`; `a_normal_solo_snapshot_has_neither` (guards the privacy of other kinds); `a_tutorial_table_is_not_saved` (a recording `TableStore`/writer sees no change for it); `the_route_creates_a_lesson_and_the_free_game`.

- [ ] **Step 2: Run** `cargo test -p beelot-server tutorial` → FAIL (Docker running for DB tests).

- [ ] **Step 3: Implement** `create_tutorial` beside `create_local` (reserve a `Local` place; `Table::tutorial(...)`), the route and handler in `routes/tables.rs` with the existing CSRF/rate conventions of `create`, the two snapshot fields built where the board view is (`snapshot.rs:580` area) and gated on `table.tutorial_kind().is_some()` and the device actor, and `persist = None` when `table.tutorial_kind().is_some()` at `task.rs:655`.

- [ ] **Step 4: Run** `cargo test -p beelot-server` → PASS.

- [ ] **Step 5: Commit** `feat: serve the tutorial table, its coach and the four hands (US-199)`.

---

### Task 5: Frontend: the coached table

**Files:**
- Modify: `crates/beelot-server/web/src/lib/api/types.ts`, `lib/api/client.ts` (`createTutorial(lesson?: string)`), `pages/Tutorial.svelte`, `table/TableView.svelte` and `table/Hand.svelte` (face-up hands and the lit coached card), `lib/models/prefs.ts` (lessons done), `lib/i18n/fr.ts`, `nl.ts`
- Create: `table/CoachPanel.svelte`, `lib/models/coach.ts` (pure: reason code → text key and parameters), tests `tests/coach.test.ts` and `tests/coach-panel.test.ts` (follow the neighbouring tests' layout)

**Interfaces:**
- Consumes: Task 4's snapshot fields and route.
- Produces: `coachText(code: CardReason | WhyNot, best: Card, other?: Card): { key: string; args: string[] }` in `coach.ts`; `<CoachPanel coach={...} tapped={Card | null} />`.

- [ ] **Step 1: Failing tests**: `coach.test.ts`: every `CardReason` and `WhyNot` code the server can send maps to a text key, and each key exists in English, French and Dutch (the existing "every text has French and Dutch" test covers dictionaries; add the codes list as a fixture generated from the server's enum names). `coach-panel.test.ts` mounted in the DOM: shows the instruction naming the coached card and its reason; after a `tapped` card that is not the coached one shows that card's "why not"; shows the lesson progress "Lesson 2 of 6"; shows "Lesson done" with a button when `lessonDone`; has no inline style.

- [ ] **Step 2: Run** `npm test -- coach` in `crates/beelot-server/web/` → FAIL.

- [ ] **Step 3: Implement.**
  - `Tutorial.svelte`: a stage machine `quiz → lessons → free` kept in component state; the quiz is today's page moved into a `QuizLesson` section unchanged; "Start the game" calls `api.createTutorial("lead-trump")`, then the table view is rendered inside the page with the table's controller (reuse `session.svelte.ts` as the solo page does). The next lesson, a replay of a lesson and "Free game" are the buttons of the "Lesson done" state. `markTutorialSeen` runs when the last lesson is done (as the quiz does today); lessons done go through `prefs.ts` and the storage module.
  - `TableView.svelte`: when `snapshot.board.allHands` is present, draw the three other hands face up with `PlayingCard` at small size around the table (seat names above); the player's own hand keeps its place. On a phone the other hands are drawn as a single wrapped row of small cards per seat, and the coach panel is `position: sticky` above the hand, one line when folded.
  - Tapping a legal card that is not `coach.card` does not send a request: `CoachPanel` gets `tapped` and shows its why-not; tapping `coach.card` plays it. An illegal card keeps the existing behaviour. The coached card has a lit ring (a class, no inline style).
  - Texts: one key per `CardReason`/`WhyNot` with `{0}` the coached card and `{1}` the other card, written in English in the component and translated in `fr.ts` and `nl.ts`; lesson titles and one-line goals for the six lessons.
  - A 404 or an unknown token on a tutorial table (server restarted) starts the lesson again silently.

- [ ] **Step 4: Run** `npm run check && npm run lint && npm test && npm run build` → PASS; `git status` shows `static/` rebuilt.

- [ ] **Step 5: Commit** `feat: the coached tutorial page (US-199)`.

---

### Task 6: Verify in a browser, document, open the PR

**Files:**
- Modify: `docs/product-backlog.md` (Delivered note on US-199), `pages/docs/` page that describes the tutorial if one exists (else none), `README.md` only if the tutorial is mentioned there, `docs/superpowers/specs/2026-11-23-coached-tutorial-design.md` (the four changes)

- [ ] **Step 1:** Start `docker compose up -d --wait && cargo run -p beelot-server`; with Playwright at 375×667 and 1280×800 play lesson 1 to its end (a wrong tap shows its why-not, the coached tap plays), then three turns of the free game; in English and French. Record what was not checked (Firefox, Safari, the Android app, Dutch).
- [ ] **Step 2:** Run the full check list of "Global Constraints"; fix what fails.
- [ ] **Step 3:** Write the Delivered note, amend the spec, commit `docs: close US-199 and record the design changes`.
- [ ] **Step 4:** `git fetch origin main:main` (or `git switch main && git pull --ff-only` then back), rebase the branch on it, push, `gh pr create` with the Conventional Commit title, a description of what changed, the commands run and what could not be run; then `gh pr merge <number> --auto --squash`; watch the checks and fix a failure with a new commit.
