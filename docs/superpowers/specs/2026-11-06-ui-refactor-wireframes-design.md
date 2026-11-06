# UI refactor: hub navigation and one unified table — wireframes

Status: proposal, for review. Nothing here is implemented.
Scope: the frontend in `crates/beelot-server/static/`. No backend change.

## 1. Why

The UI grew one user story at a time (US-066 to US-115). Each story added a
panel to an existing page, and the structure never changed. Today:

- `index.html` holds 13 views. Every one is reached from the home menu, and
  there is no persistent navigation.
- Three views draw the same game: `bot-game`, `bidding` and `private-table`.
  Their IDs are duplicated with a `private-` prefix, and so is the logic in
  `app.js` (3,354 lines).
- Setup is a separate page for each mode (`bot`, `local`, `private`,
  `public`), each with its own copy of variant, announcements, target and
  difficulty fieldsets.
- Home is a menu of six equal cards. It does not show progress (goals,
  streaks), a match to resume, or the one thing most players want: play.
- The private lobby is a long form (timer, announcements, all-trumps, target,
  variant) above the table. The table itself sits at the bottom of the page.
- Rules, tutorial and hints live on three pages, away from where the question
  comes up.

## 2. Brief

| You said | Meaning for the design |
|---|---|
| Ambitious, heavy refactoring | New information architecture, not a restyle. |
| Phone-first play | Thumb-reachable controls. The table fits one screen with no scroll. |
| Retention and social | Home shows progress and a resume card. The account offer has a permanent home. |
| Simplicity and onboarding | Fewer screens. Setup is a sheet. Help is inline at the table. |

Assumptions (correct me): every shipped feature stays and is re-homed (table
in section 8); EN, FR and NL stay; deep links such as `/play/bot` keep
working; the existing REST and SSE contracts are unchanged; there is no
friends list because the server has none, so "social" means private tables,
invite codes, reactions and rematch votes.

## 3. Principles

1. **Play first.** One tap from launch to a dealt card.
2. **One table.** Bot, online and pass-and-play share a single screen. The mode
   only changes who sits where and what the leave rule is.
3. **Sheets, not pages.** Choices that lead to a game (setup, auction, help,
   menu) are bottom sheets over the current screen.
4. **Thumbs.** Primary actions live in the lower third. The top of the screen
   only informs.
5. **Show progress where people look.** Goals, streaks and the account offer
   appear on Play and on the match-end card, nowhere else.

## 4. Information architecture

Before: home menu with 13 destinations. After: four tabs and one full-screen
mode.

```
Shell (persistent, hidden during a match)
├── Play      home: Play now, resume, modes, goal/streak, tutorial banner
├── Crew      private table create/join, public find-a-game, recent tables
├── Progress  stats, goals, streak history, round/match history
└── Me        account, language, table theme, effects, sound, data, privacy

Full screen (no tab bar)
└── Table     bot | online-private | online-public | pass-and-play
    ├── sheet: Setup        (before deal; one sheet for every mode)
    ├── sheet: Auction      (bid / pass / coinche / choose trump)
    ├── sheet: Help         (rules, card order, hint, tutorial)
    ├── sheet: Menu         (settings shortcuts, leave)
    ├── overlay: Handoff    (pass-and-play only)
    ├── overlay: Round result and review
    └── overlay: Match end  (podium, goal, account offer, play again)
```

Routes are kept as aliases so old links and bookmarks work:

| Old route | New behaviour |
|---|---|
| `/` | Play tab |
| `/play/bot`, `/play/local` | Play tab with the Setup sheet open, mode preset |
| `/online/private`, `/online/public` | Crew tab, section opened |
| `/stats` | Progress tab |
| `/settings`, `/privacy` | Me tab, section opened |
| `/rules`, `/tutorial` | Table with the Help sheet open, or the tutorial table |

## 5. Wireframes: phone (390 × 844)

### 5.1 Play (home)

```
┌────────────────────────────┐
│ 🐝 Beelot            ⚙ 🔔? │  <- logo, one icon: sound toggle
├────────────────────────────┤
│  ┌──────────────────────┐  │
│  │  ♠ ♥ ♦ ♣ deal loop   │  │  hero (existing deal animation,
│  │                      │  │  compact: 30% of height)
│  │  Deal in.            │  │
│  └──────────────────────┘  │
│                            │
│  ┌──────────────────────┐  │
│  │ ▶  Resume your match │  │  only if a match is in progress
│  │    Classic · 640–520 │  │  (solo or online, from local state)
│  └──────────────────────┘  │
│                            │
│  [        PLAY NOW  →    ] │  primary, full width, 56px
│   Customise ▸              │  opens the Setup sheet
│                            │
│  🔥 3-day streak · 2 of 3  │  goal-line + streak (US-113),
│     goals done today       │  tap -> Progress
│                            │
│  ── Other ways to play ──  │
│  ┌────────┐ ┌────────┐     │
│  │ ♥ Crew │ │ ★ Find │     │  2x2 grid replaces six full-width
│  │ table  │ │ a game │     │  cards
│  ├────────┤ ├────────┤     │
│  │ ⇆ Pass │ │ ♦ Learn│     │
│  │ & play │ │ basics │     │
│  └────────┘ └────────┘     │
│                            │
│  ┌ New to Belote? ───────┐ │  tutorial banner, dismissible,
│  │ Learn in 3 minutes  → │ │  shown only to new players
│  └───────────────────────┘ │
├────────────────────────────┤
│ [Play] Crew Progress  Me   │  tab bar, 4 items
└────────────────────────────┘
```

Changes: the sign-in panel leaves home (it moves to Me, plus the match-end
offer). The "Table talk" card and the footer privacy link are gone (Help sheet
and Me). The account bar becomes a one-line chip on Me.

### 5.2 Setup sheet (one component for every mode)

Opens over Play. Replaces `bot`, `local` and the creation half of `private`.

```
┌────────────────────────────┐
│ ▔▔▔ (drag handle)          │
│ Set up your table      ✕   │
│                            │
│ Mode   [Solo|Pass&play|Crew]│  segmented control: switching it
│                            │  swaps only the seat block below
│ Variant   (• Classic) ( Contrée)
│                            │
│ Seats (shown for Pass&play)│
│  N [ Anna     ]  E [ Bot ] │
│  S [ You      ]  W [ Bot ] │
│                            │
│ Bots      (• Relaxed) ( Challenging)
│                            │
│ ▸ More rules               │  collapsed by default
│   Match target  500 [1000] 1500 2000
│   Announcements  [On] Off  │
│   Tout/sans-atout [On] Off │
│   Turn timer (Crew)  30s … │
│                            │
│ [      Deal the cards  →  ]│  sticky primary
└────────────────────────────┘
```

Why it is simpler: the 3-step wizard (`setup-steps.js`) exists because the
page was too long. With defaults hidden under "More rules" the sheet fits one
screen, so the wizard is removed. Choices persist per mode in local storage.
Every `What is this?` link becomes an ⓘ that opens the Help sheet on the
matching card.

### 5.3 Table (all modes)

```
┌────────────────────────────┐
│ ☰   Classic · Trick 3/8  ⓘ │  header 44px: menu, status, help
│ N–S 640 (+82)  ◂1000▸  E–W 520 │  score bar (existing)
├────────────────────────────┤
│        ┌─────────┐         │
│        │ 🐻 Bot  │         │  top seat: avatar, name, card count,
│        │  ▮▮▮▮▮  │         │  contract badge
│        └─────────┘         │
│ ┌────┐                ┌────┐│
│ │ 🦊 │   ┌──────┐     │ 🐸 ││  left / right seats, compact
│ │ ▮▮ │   │ trick│     │ ▮▮ ││
│ └────┘   │  K♥  │     └────┘│
│          │7♠  A♣│           │  current trick, centre
│          │  9♥  │           │
│          └──────┘           │
│  Trump ♥ · N–S contract 90 │  one-line status (table-status.js)
├────────────────────────────┤
│  You                       │
│  ┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐┌─┐  │  hand, fan, one row, 8 cards,
│  │ ││ ││ ││ ││ ││ ││ ││ │  │  tap to select, tap again to play
│  └─┘└─┘└─┘└─┘└─┘└─┘└─┘└─┘  │  (bigger hand, US-108)
│  [💡 Hint]   [😀 React ▾]  │  action row; React only online
└────────────────────────────┘
```

Rules for this screen:

- It never scrolls. Announcements, declarations and messages (US-107) appear
  as toasts that auto-dismiss, anchored above the hand, not below the table.
- The announcements panel becomes a chip row above the hand
  (`tierce · belote`), tap for detail.
- The "Declare announcements" checkbox becomes a toggle chip in the same row.
- Reactions open as a 6-emoji tray from the React button, not a permanent bar.
- Connection and turn-timer state use the header status line, not new panels.

Header menu sheet:

```
┌────────────────────────────┐
│ ▔▔▔                        │
│ Rules and card order    →  │
│ Hint                    →  │
│ Sound  [on]   Effects [..] │
│ Leave table             →  │  asks the leave confirmation (US-110)
└────────────────────────────┘
```

### 5.4 Auction sheet (replaces the `bidding` view)

The table stays visible behind it: you see your own hand while bidding, which
the current separate view hides.

```
┌────────────────────────────┐
│ (table, dimmed, hand shown)│
├────────────────────────────┤
│ ▔▔▔  Your call             │
│ Anna: 80 ♥   Bot: pass     │  bidding history, one line
│                            │
│ Value   80 90 [100] 110 120│  horizontal scroller
│ Suit    ♠  ♥  ♦  ♣  SA  TA │  SA/TA only when enabled
│                            │
│ [ Pass ]  [  Bid 100 ♥  ]  │
│ [ Coinche ] (when allowed) │
└────────────────────────────┘
```

Classic variant: the sheet shows "Take ♥?" with Take and Pass, then the suit
row on the second round.

### 5.5 Crew lobby (before the deal, online)

Replaces `private-table`'s settings stack. The table is the lobby.

```
┌────────────────────────────┐
│ ←  Crew table       ⓘ  ☰  │
│                            │
│  Invite  ABC123  [Copy] [↗]│  share sheet where supported
│                            │
│          ┌────────┐        │
│          │ Seat N │ Bot ▾  │  four seats around a mini table;
│          └────────┘        │  tap an empty seat to sit,
│ ┌──────┐          ┌──────┐ │  owner can set a seat to Bot
│ │ Seat W│  N–S/E–W │Seat E│ │
│ └──────┘          └──────┘ │
│          ┌────────┐        │
│          │ You ✓  │        │
│          └────────┘        │
│                            │
│ 3 of 4 ready · 30s timer   │
│ ▸ Table rules (owner only) │  same fields as "More rules"
│                            │
│ [   I'm ready   ]          │
│ [ Start with bots ] (owner)│
└────────────────────────────┘
```

When the deal starts the same screen turns into the Table (5.3): no page
change, the seats simply fill with cards.

### 5.6 Crew tab

```
┌────────────────────────────┐
│ Crew                       │
│ ┌ Create a table ────────┐ │
│ │ Your name [ Anna ]     │ │
│ │ [ Open a private table ]│ │  opens Setup sheet, mode Crew
│ └────────────────────────┘ │
│ ┌ Join with a code ──────┐ │
│ │ [ A B C 1 2 3 ] [Join] │ │  six-box code input, auto-submit
│ └────────────────────────┘ │
│ ┌ Find a game ───────────┐ │
│ │ (Classic) ( Contrée)   │ │
│ │ [ Find a game ]        │ │  bots fill in after a minute
│ └────────────────────────┘ │
│ Recent tables              │
│  ABC123 · Classic · 2 d ago [Rejoin?]
└────────────────────────────┘
```

"Recent tables" uses data already in local storage and the match history; it
only lists codes whose table is still open.

### 5.7 Progress tab

```
┌────────────────────────────┐
│ Progress                   │
│ 🔥 Streak 3 days  Best 7   │
│ Today's goals              │
│  ✓ Win a round             │
│  ✓ Make a belote           │
│  ○ Play 3 matches  (1/3)   │
│                            │
│ Record   12 W · 8 L  60%   │  tiles (existing stats)
│ [Overall|Variant|Bots] tab │  replaces 3 tables with 1 switcher
│  …table…                   │
│                            │
│ Recent matches             │
│  Win  1000–820  Classic  › │  tap -> match recap
│                            │
│  (guest) Keep your stats:  │
│  [ Create an account ]     │  the account offer, here too
└────────────────────────────┘
```

### 5.8 Me tab

```
┌────────────────────────────┐
│ Me                         │
│ ┌ Anna · signed in ───────┐│  guest: "Guest · Create an account"
│ │ Last sign-in 2 h ago    ││
│ │ [Sign out]              ││
│ └─────────────────────────┘│
│ Language      EN FR NL     │
│ Table theme   ● ● ● ●      │  swatches, live preview strip
│ Effects       Full Reduced Off
│ Sound [on]  Reactions [on] │
│ Bot comments [on]          │
│ ─────────────────────────  │
│ Privacy policy             │
│ Your data ▸ (account only) │  export, delete (typed confirmation
│                            │  stays as is)
└────────────────────────────┘
```

### 5.9 Overlays

Round result (bottom card over the table, keeps the table visible):

```
│  Contract made ✓  N–S 162 / E–W 0 │
│  ▸ Breakdown   ▸ Review round     │
│  [        Deal next round       ] │
```

Match end keeps its podium, goal and sticker (US-093, US-113). Two changes:
the actions become a single primary row (`Play again` full width, `Change
options` and `Home` as text buttons), and the account offer moves above the
actions only for guests after the second match.

Handoff overlay (pass and play) stays unchanged except it uses the same sheet
chrome.

## 6. Wireframes: desktop (≥ 1024 px)

Same components, different layout. No separate desktop design to maintain.

```
┌──────────────────────────────────────────────────────────────┐
│ 🐝 Beelot   Play  Crew  Progress  Me                    🔊 EN│  top nav
├───────────────────────────────┬──────────────────────────────┤
│  Play now  →                  │  Today                        │
│  Resume your match            │  🔥 streak · goals            │
│  Mode cards (2x2)             │  Recent matches               │
└───────────────────────────────┴──────────────────────────────┘

Table (desktop):
┌──────────────────────────────────────────┬───────────────────┐
│ header + score bar                       │  Side panel       │
│                                          │  - Trick log      │
│            table (square, centred)       │  - Announcements  │
│                                          │  - Reactions      │
│            hand (single row)             │  - Help / Hint    │
└──────────────────────────────────────────┴───────────────────┘
```

- The tab bar becomes a top nav. Sheets become centred modals (max 480 px).
- The table gets a side panel: trick log, announcements and reactions are
  always visible. On phones the same content is the chip row and the tray.
- The side panel collapses below 1024 px, so there is one DOM, not two.

## 7. Architecture changes that make the wireframes cheap

The wireframes are only worth it if the code stops duplicating itself.

1. **One `Table` module.** Replace the `bot-*`, `private-*` and `bidding` DOM
   with a single table template. A mode adapter supplies seats, actions and
   leave rules:
   - `soloAdapter`: bots, local state machine, hints.
   - `onlineAdapter`: SSE events, reactions, timer, rematch vote.
   - `localAdapter`: soloAdapter plus the handoff overlay.
2. **View router.** A small router (`router.js`) maps the routes in section 4
   to tabs and sheets, with History API entries for sheets so the back button
   closes them.
3. **Sheet component.** One `sheet.js` (focus trap, drag to close, `Escape`,
   `aria-modal`) used by Setup, Auction, Help and Menu. The leave dialog and
   the handoff reuse it.
4. **Setup form as data.** A single description of fields (variant, target,
   announcements, all-trumps, difficulty, timer) renders the Setup sheet, the
   lobby rules and the settings summaries. This removes the `local-*`,
   `private-*` and `table-*` ID families.
5. **Split `app.js`** by module (`table/`, `lobby/`, `account/`, `progress/`),
   keeping the existing pure helpers (`match-end.js`, `goals.js`,
   `score-bar.js`, ...) and their tests. Current frontend tests (283) must
   keep passing at every step.
6. **CSS.** Replace the 2,347-line sheet with tokens (colour, space, radius)
   plus component files. Reduced and Off effects stay honoured through the
   existing `effects.js` flag.

## 8. Where every feature goes

| Feature | New home |
|---|---|
| Play now, goal line, streak (US-113) | Play, Progress |
| Resume match | Play (new, from local state) |
| Stepped setup (US-088 area) | Setup sheet, "More rules" |
| Table header, status, score labels (US-106, US-109) | Table header |
| Messages off cards (US-107) | Toasts above the hand |
| Bigger hand (US-108) | Table hand row |
| Confirm before leaving (US-110) | Menu sheet, leave |
| Clean headings (US-111) | Applies to all tabs |
| Friendly bots, bot lines and reactions (US-112, US-088) | Table seats, toasts |
| Hints (US-065) | Table action row and Help sheet |
| Round review (US-066) | Round result overlay |
| Contract at seat (US-099) | Seat badge |
| Suit symbols and names (US-095, US-098) | Unchanged |
| Celebrations, podium (US-090, US-093) | Match-end overlay |
| Play again, rematch vote (US-114) | Match-end primary button |
| Account offer (US-115) | Match end (guests), Progress, Me |
| Tutorial banner and tutorial | Play banner, tutorial table |
| Stats, history, export, delete | Progress, Me |
| Themes, language, sound, effects | Me, quick toggles in table menu |
| Privacy policy | Me |
| Security headers | Unchanged (CSP applies to the new `sheet.js` etc.) |

Nothing is dropped.

## 9. Migration plan

Each step ships on its own as a user story with its own spec and plan
(AGENTS.md), and leaves the app working.

| # | Story (working title) | Result | Risk |
|---|---|---|---|
| 1 (US-116) | Sheet component and router | `sheet.js`, `router.js`, route aliases, no visible change | Low |
| 2 (US-117) | Tab bar and shell | Four tabs, existing views mounted inside them | Low |
| 3 (US-118) | Setup sheet | One sheet replaces `bot`, `local`, and the create half of `private`; wizard removed | Medium |
| 4 (US-119) | Unified Table, solo | Bot game on the new table module; old `bot-game` view deleted | High |
| 5 (US-120) | Auction sheet | Replaces the `bidding` view | Medium |
| 6 (US-121) | Unified Table, online and lobby | `private-table` removed, lobby becomes the table | High |
| 7 (US-122) | New Play home | Resume card, 2×2 modes, goal/streak, account chip moved | Low |
| 8 (US-124) | Progress and Me tabs | Stats, goals, settings, data regrouped | Low |
| 9 (US-125) | Desktop layout and CSS tokens | Top nav, side panel | Medium |
| 10 (US-123) | Help sheet | Delete dead CSS and IDs | Low |

Steps 4 and 6 carry the risk. Keep the old view behind a flag until the new
one passes the same browser checks (390 px and 1280 px, Reduced and Off
effects, Safari, pass-and-play handoff).

## 10. Success criteria

- From launch to the first card dealt: 1 tap (Play now), or 2 taps with
  Customise.
- The table never scrolls on a 360 × 640 viewport.
- Duplicate ID families (`private-*`, `local-*`, `table-*` for settings) drop
  to zero.
- `app.js` is split, with no module above roughly 600 lines.
- All current frontend tests pass at each step; new tests cover the router,
  the sheet focus trap and each mode adapter.
- Lighthouse accessibility stays at its current score or better. Touch
  targets are at least 44 px.
- FR and NL texts for new strings are flagged for native review, as before.

## 11. Open questions

1. **Resume a match.** Solo matches would need their state in local storage
   (today a reload restarts them?). Is persistence in scope or a later story?
2. **Rejoin online tables.** Can the server resume a seat after a reload? If
   not, "Recent tables" lists codes only.
3. **Friends.** A real friends list needs backend work (accounts, invites).
   Out of scope here, but the Crew tab leaves room for it.
4. **Tab names.** "Crew" matches the existing "Bring the crew" copy. "Friends"
   would promise more than the server offers.
5. **Visual direction.** This document fixes structure only. The recent
   plum-gradient restyle (`feat/lively-home`) carries over; a new visual pass
   is a separate story.

## 12. Out of scope

Backend or API changes, new game rules or variants, a friends list, push
notifications, and a new visual identity.
