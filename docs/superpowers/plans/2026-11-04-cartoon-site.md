# A cartoon home page and menus (US-100) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The home page and every menu take the cartoon look of the table: a dotted felt page, paper panels with ink outlines and hard shadows, sticker navigation, tilted cards, and one shared set of buttons and controls.

**Architecture:** A restyle of `crates/beelot-server/static/styles.css` (and a little of `index.html`), driven by the table's existing tokens so the four themes of US-087 recolour the whole site. A Node test guards the contract (the page is the felt; text and background pairs keep their contrast in every theme). No behaviour, server or copy changes.

**Tech Stack:** Plain CSS and HTML in `crates/beelot-server/static/`, Node's built-in test runner.

**Spec:** `docs/superpowers/specs/2026-11-04-cartoon-site-design.md`

## Global Constraints

- Reuse the table's tokens (`--felt`, `--felt-dot`, `--card-ink`, `--card-paper`, `--outline-width`, `--shadow-hard`, `--rim`, `--gold`, `--pink`, `--aqua`, `--violet`, `--red`, `--seat-bg`); add only `--tilt` (1.2deg) and `--radius-panel` (12px) as new tokens. Hard-coded colours of the old look (the purple sky, `rgba(255,255,255,…)` fills, the pink-orange gradient) are replaced, not layered over.
- Text directly on the felt is white with the table's four-way ink outline; long copy sits in paper panels with ink text. `var(--muted)` text never sits on the felt.
- A chosen option is gold, tilted (`--tilt`), lifted, with a black ✓ disc marker; a switch is gold when on with the thumb position as the second signal; the current page is marked by more than colour.
- No new loops. Hover and press movement follows US-094: Full moves (spring), Reduced changes state within `--effect-fast` without the spring, Off shows the state change only; tilt and lift are resting states and stay at every level.
- Every text and background pair meets WCAG AA (4.5:1) in all four themes; the focus ring is a thick outline visible on felt, paper and gold; everything stays keyboard operable; headings, labels and landmarks are unchanged.
- No horizontal scroll at 375 px, tilted cards included.
- No new texts expected; any new text goes through `t()` with French (`i18n.js`) and Dutch (`i18n-nl.js`) entries.
- Commits are signed, one per task, ending with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; one pull request titled `feat: give the home page and menus the cartoon look (US-100)`.

## Review Focus

- Text on the felt in the sunset theme (orange felt) and the midnight theme: outlined white text readable; no grey `--muted` text left directly on the felt anywhere (home hero copy, menu intros, hints, the round result and bidding dock on the game screens).
- A disabled chosen option, a chosen option in a group with a disabled one, and a red-suit choice (♥ ♦): the ✓ disc and gold fill stay readable and the red suit keeps contrast on gold.
- The table stays distinct from the page on every theme (the page and the table both use the felt colour).
- Focus ring on every kind of control (button, link, hidden-input choice via its label, checkbox, text field, select) on felt, paper and gold.
- Reduced and Off: no hover movement or spring remains on buttons, choices and mode cards, while tilt, lift and ✓ stay.
- 375 px: tilted mode cards and chosen options do not create a horizontal scrollbar; the long French and Dutch labels still fit their buttons.

---

### Task 1: The contract test and the new tokens

**Files:**
- Create: `crates/beelot-server/frontend-tests/cartoon-site.test.cjs`
- Modify: `crates/beelot-server/static/styles.css` (the `:root` tokens; the `body` and `body::before` rules)

**Interfaces:**
- Produces: tokens `--tilt: 1.2deg` and `--radius-panel: 12px` in `:root`; the page background rule on `body` using `var(--felt)` and `var(--felt-dot)` with no `#171333`, `#22204e` or `#11152f` left; the removal of the white-dot `body::before` overlay.
- The test exports nothing; helper functions inside it: `tokens(theme)` (parses `:root` and the `body[data-theme="…"]` override of `styles.css` into a map, a theme overriding only what it sets) and `ratio(a, b)` (WCAG contrast of two `#rrggbb` colours).

- [ ] **Step 1: Write the failing tests** in `cartoon-site.test.cjs` reading `../static/styles.css`:
  - `the page is the felt`: the `body {` rule contains `var(--felt)` and `var(--felt-dot)`, and none of the old sky colours (`#171333`, `#22204e`, `#11152f`); there is no `body::before` rule with `rgba(255,255,255,.055)`.
  - `the cartoon tokens exist`: `:root` defines `--tilt` as `1.2deg` and `--radius-panel` as `12px`.
  - `text pairs keep their contrast in every theme` for the themes `comic` (the `:root`), `classic-green`, `midnight`, `sunset`: ink (`--card-ink`) on `--card-paper`, `--gold`, `--pink`, `--aqua` and `--violet` each ≥ 4.5; `--card-red` on `--card-paper` ≥ 4.5; `--card-paper` on `--seat-bg` ≥ 4.5; white (`#ffffff`) on `--card-ink` ≥ 4.5 (the outline that carries white text on the felt). Each failing pair names its theme and tokens in the message.

- [ ] **Step 2: Run them to verify they fail.**
  Run: `node --test crates/beelot-server/frontend-tests/cartoon-site.test.cjs`
  Expected: FAIL on `the page is the felt` and `the cartoon tokens exist` (the contrast test may already pass; if a pair fails, that is a real finding to fix in the tokens now).

- [ ] **Step 3: Implement.** Add the two tokens; rewrite the `body` background to the table's dotted felt (`radial-gradient(var(--felt-dot) 1.4px, transparent 1.6px) 0 0 / 9px 9px, var(--felt)`); delete the `body::before` white-dot overlay. Fix any contrast failure by adjusting the token the test names.

- [ ] **Step 4: Run them to verify they pass.**
  Run: `node --test crates/beelot-server/frontend-tests/`
  Expected: PASS (all frontend tests).

- [ ] **Step 5: Commit.** `git add crates/beelot-server && git commit -m "feat: make the page the table's felt (US-100)"`

---

### Task 2: Header and buttons

**Files:**
- Modify: `crates/beelot-server/static/styles.css` (`.brand`, `.settings-link`, `.button`, `.secondary-button`, `.danger-button`, `.text-link`, the shared focus ring, `.eyebrow`, headings on felt)
- Modify: `crates/beelot-server/static/index.html` only if the header needs a wrapper element

**Interfaces:**
- Produces: the button component set used by every later task: `.button` (gold primary), `.secondary-button` (paper), `.danger-button` (red `--red`), `:disabled`, `:active` (pressed: shadow gone, button moved into it); `.text-link` as an outlined white link on felt and ink inside paper panels; one focus ring rule (`3px` ink-and-paper double outline) shared by `.button`, `a`, `button`, `input`, `select`.

- [ ] **Step 1: Restyle.** Buttons: pill, `var(--outline-width)` ink border, `var(--shadow-hard)`, ink text, gold/paper/red fills; hover lifts (`translateY(-2px)`), active presses (`translate(3px, 3px)`, no shadow); disabled flat at 55% opacity. The brand and `.settings-link` become paper pill stickers with the shadow; the page the visitor is on keeps a gold sticker with an underline where the nav shows it (Settings on the settings screen). Headings and eyebrows directly on felt get the four-way ink text-shadow.

- [ ] **Step 2: Effects levels.** In the existing `body[data-effects="reduced"]` and `"off"` blocks, remove the hover and press movement of the new button rules (Reduced keeps the colour change within `--effect-fast`; Off none).

- [ ] **Step 3: Look at it** (server running, `fetch(path, { cache: "reload" })` the changed files): the home page header and a menu's buttons at 375 px and 1280 px in the comic and sunset themes; Tab through a button, a link and the settings link to see the focus ring; at Reduced and Off hover a button and see no movement.

- [ ] **Step 4: Run the tests.** Run: `node --test crates/beelot-server/frontend-tests/` — Expected: PASS.

- [ ] **Step 5: Commit.** `git add crates/beelot-server && git commit -m "feat: give the header and buttons the cartoon look (US-100)"`

---

### Task 3: Controls and panels

**Files:**
- Modify: `crates/beelot-server/static/styles.css` (`.choice-group`, `.choice`, the bot-setup option cards, `.declare-option`, text fields and selects, `.settings-panel`, `.stats-panel`, `.stats-tile`, `.privacy-view` blocks, `.your-data*`, the panel at line ~960 using `var(--panel)`)

**Interfaces:**
- Consumes: the button set (Task 2).
- Produces: the shared control look: choice buttons and option cards (paper, ink outline, hard shadow, round marker; `:checked` gold, tilted by `--tilt`, lifted, with the marker turned into a black ✓ disc via a pseudo-element, not a new element); switches and checkboxes (paper pill, gold when on); text fields and selects (paper, inset shadow, ink outline); paper panels (`.panel`-like look applied to the existing panel classes).

- [ ] **Step 1: Restyle** the controls and panels as above. Keep the hidden-input pattern (the input stays visually hidden and focusable; its focus ring shows on the label's `span`). `.red-suit` choices keep their red glyph with enough contrast on paper and on gold. Disabled controls are flat at reduced opacity and a disabled chosen option keeps its gold fill and ✓.

- [ ] **Step 2: Effects levels.** Hover lift and the chosen option's spring only at Full; at Reduced the state change is within `--effect-fast`; at Off it is instant. The tilt, the lift and the ✓ stay at every level.

- [ ] **Step 3: Look at it:** the bot setup screen (option cards with descriptions), the private-table form (choice groups, name field), settings (choices, theme swatches) and a statistics panel, at 375 px and 1280 px, in the comic, midnight and sunset themes; a keyboard pass through a choice group (arrow keys move the chosen option; the ring shows); a disabled choice; the red-suit choice on gold.

- [ ] **Step 4: Run the tests.** Run: `node --test crates/beelot-server/frontend-tests/` — Expected: PASS.

- [ ] **Step 5: Commit.** `git add crates/beelot-server && git commit -m "feat: give the menu controls and panels the cartoon look (US-100)"`

---

### Task 4: The home page

**Files:**
- Modify: `crates/beelot-server/static/styles.css` (`.home-view`, `.hero-deal` text colours, `h1`, `.intro`, `.welcome-badges`, `.account-bar` and its panels, `.mode-grid`, `.mode-card`, `.card-icon`, `.home-footer`)
- Modify: `crates/beelot-server/static/index.html` only if a sticker needs a wrapper

**Interfaces:**
- Consumes: the button set (Task 2) and the panel look (Task 3).
- Produces: the home page in the new style; the US-092 hero deal and mode-card bounce stay and keep their Reduced and Off rules.

- [ ] **Step 1: Restyle.** The title and intro are white with the ink outline (`.intro` in a paper sticker if it needs the contrast); the badges become paper pill stickers; the account bar is a paper panel with the shared buttons; the four mode cards become paper-and-colour sticker cards (gold, pink, aqua, violet fills with ink text, ink outline, hard shadow), alternately tilted by `--tilt`, labels unchanged; the footer links are stickers. The US-092 `mode-bounce` keyframes move the tilted card, so rewrite them to end on the tilted resting pose.

- [ ] **Step 2: Effects levels.** The existing Reduced and Off rules for the hero deal, the bounce and the press keep working (the card keeps its tilt at rest).

- [ ] **Step 3: Look at it:** home at 375 px, 768 px and 1280 px in all four themes at Full; at Reduced and Off hover and press a mode card; the hero deal still runs at Full and stays dealt out at Reduced and Off; no horizontal scrollbar with the tilted cards at 375 px.

- [ ] **Step 4: Run the tests.** Run: `node --test crates/beelot-server/frontend-tests/` — Expected: PASS.

- [ ] **Step 5: Commit.** `git add crates/beelot-server && git commit -m "feat: give the home page the cartoon look (US-100)"`

---

### Task 5: The other screens and the game screens, then verify

**Files:**
- Modify: `crates/beelot-server/static/styles.css` (leftovers found by the sweep: any remaining `var(--muted)` or `rgba(255,255,255,…)` on felt, the game screens' result panel, hint text, bidding dock, tutorial and rules pages, privacy, tables of statistics)
- Modify: `docs/superpowers/plans/2026-11-04-cartoon-site.md` (a "Findings" section)

**Interfaces:**
- Consumes: Tasks 1–4.

- [ ] **Step 1: Sweep the stylesheet.** `grep -n "var(--muted)\|rgba(255,255,255" crates/beelot-server/static/styles.css` and settle each hit: on felt, turn it white with the ink outline; inside a paper panel, ink; as a fill on a control, replace it with the component set. Leave table-internal rules (seat chips, cards) alone.

- [ ] **Step 2: Restyle the remaining screens** (setup, private and public tables, pass-and-play, tutorial, rules, statistics, privacy, settings; and on the game screens the round-result panel, hint and bid reasons, the bidding dock, the match-end screen and the round review buttons) with paper panels, outlined headings and the component set. No layout or copy change.

- [ ] **Step 3: Verify in the browser** (comic, classic-green, midnight, sunset × Full, Reduced, Off × 375 px and 1280 px): the home page, each menu, a bot game with its bidding and round result, the match-end screen and the round review; on each screen no horizontal scroll, readable text, the focus ring, the tilt and ✓ on chosen options; on the sunset theme the table stands out from the page. Record what was and was not verified in a "Findings" section of this plan.

- [ ] **Step 4: Run the checks and commit.**
  Run: `node --test crates/beelot-server/frontend-tests/ && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test --workspace`
  Expected: all pass (Docker running).
  `git add -A crates docs && git commit -m "feat: give every menu and game screen the cartoon look (US-100)"`

- [ ] **Step 5: Open the pull request** after `git fetch origin main:main` and a rebase on it, titled `feat: give the home page and menus the cartoon look (US-100)`, with the commands run, what was not verified, and the note that no new texts were added; then `gh pr merge --auto --squash`.

---

## Findings (Task 5)

Verified in the browser: home, bot setup, pass and play, private and public tables, settings, rules, tutorial, privacy and a Contrée bidding screen on the sunset theme; no horizontal scroll on nine routes × four themes × three effects levels at 375 px and 1280 px; hover lift of buttons and mode cards at Full, none at Off (Reduced lifts the card without the bounce); arrow keys move a chosen option and its focus ring shows; the table stays distinct from the page on sunset (purple rim).

Not verified: the statistics page (needs a signed-in account), the round-result panel, the match-end screen and the round review (US-066 is still in PR #37) in the new look, the French and Dutch label widths, and the midnight and classic-green themes beyond overflow and the contrast test. The final reviewer should look at those.
