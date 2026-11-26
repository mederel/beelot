# Ideas to improve Beelot

- Status: Brainstorm (not a commitment)
- Date: 2026-11-26

This page collects ideas to grow the player base, improve the game experience, strengthen the bots and
make the game easier to learn. Nothing here is scheduled. An idea becomes work when someone opens a
user story for it (see `AGENTS.md`: the GitHub issue, then a spec and a plan).

The ideas build on what exists today: bots that sample hidden hands and solve them double-dummy,
hints and review, public and private tables with spectators, rematch, an Android app, and French,
English and Dutch.

## 1. Grow the player base

Beelot is free, has no account and no tracking. Growth is mostly about discovery and retention.

- **Frictionless entry.** "Play now" is one tap. Keep the first run free of sign-in, and let the first
  hand teach the rules without a manual (a guided deal with hints on).
- **Viral loops.**
  - A shareable invite link (`/join/ABC123`) next to the six-character code, with a rich preview
    (Open Graph) so it looks good in WhatsApp and Messenger.
  - After a match, a "Play again" prompt that invites the friends who just played.
- **Distribution.**
  - Publish the Android app on Google Play, and ship an installable PWA for iOS.
  - Present the game in Belote and Contrée communities (forums, social groups, Discord).
  - A landing page per language with the terms people search for ("belote en ligne",
    "contrée gratuite", "belote online gratis").
- **Retention.** Opt-in goals and streaks, a light friends list, and opt-in notifications ("your table is
  waiting"). Keep the no-tracking stance: everything here is opt-in.
- **Social proof in the lobby.** Show how many players and tables are active. Consider scheduled
  "play hours" so humans meet at the same time, since bots fill the empty seats after a minute.
- **Regional variants.** Belote has many rule sets (Belote coinchée, Belote moderne, Klaverjassen,
  North African variants). Each opens a new audience. Klaverjassen fits the Dutch translation.

## 2. Improve the gaming experience

- **Ranked and casual play.** A rating per player (Elo or Glicko), seasonal leaderboards, and a
  penalty for leaving a public table so public games stay pleasant.
- **Tournaments and clubs.** Scheduled brackets, private clubs with their own leaderboard.
- **Social presence.** Quick emotes or preset messages (no free chat, which needs moderation).
- **Reliability on a bad connection.** Measure reconnect time and the share of games abandoned after a
  disconnect, and make the handover to a bot, and back to the player, seamless.
- **Replays and sharing.** Event-sourced tables (ADR 006) make replays cheap: "replay this hand",
  shareable hand links, "what if I had played X".
- **Cosmetics.** Card decks (French, Belgian, Spanish suits), table themes, avatars.
- **Accessibility.** Colour-blind-friendly suits, screen-reader announcements, large-text mode.
  Belote skews older, so this also widens the audience.

## 3. Improve the bots

In order of value:

1. **Measure first.** Run `beelot-arena` in CI against a fixed baseline for each change, and report the
   win rate on the pull request. Without it, an improvement is an anecdote.
2. **Bidding.** Often the weakest part of a card-game bot. Tune bid thresholds, partner signalling and
   the coinche decision, or estimate the expected score of each bid by rolling out sampled hands.
3. **Partner and opponent modelling.** Infer holdings from the auction, from discards and from shown
   voids, and bias the sampler (`sampling.rs`) toward those hands.
4. **Playing styles.** Cautious and aggressive bots, so the four bots do not all feel the same.
5. **Human-like mistakes at lower levels.** Relaxed bots should err in plausible, explainable ways,
   not at random, so players learn from them.
6. **Learned bid evaluation (later).** Train on arena self-play data. Keep the rule-based and PIMC
   bots as the explainable baseline.
7. **Time budget.** Cap thinking time per card and scale the sample count to the load, so a bot never
   feels slow.

## 4. Learning and everyday experience

- **Coach mode.** Build on hints and review: explain why a play was a mistake, summarise each hand,
  track the mistake rate over time.
- **Onboarding by variant.** Short interactive lessons on Belote, then on Contrée bidding, the main
  barrier for newcomers.
- **Small UX details.** One-tap "same table again", animation speed (and a fast mode), clear score and
  contract on small screens, haptics and sound on mobile.
- **Performance.** Keep the bundle small and the load fast (Lighthouse is already in the repository).
- **Feedback loop.** An in-app "report a problem or suggest something" link to GitHub issues, and an
  optional "was this game fun?" rating after a match.

## Suggested order

1. A bot benchmark in CI (cheap, and it makes every later bot change provable).
2. Share links with rich previews, and a PWA (the cheapest growth levers).
3. Bidding quality for the Challenging bot.
4. Ranked play and leaderboards, to bring players back.
