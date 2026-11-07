# Watch a game (US-071)

- Lobby: `spectators` flag, set by `Action::Spectators { allowed }` (`PUT`-like through the table actions), by the owner
  of a private table before the game starts; public tables take none.
- `POST /api/tables/watch {code}`: when the table allows it, a token for the new `Actor::Spectator` (at most 20 watching
  at once, 200 tokens per table). A spectator's actions are all refused (`409 spectator`), including reactions, hints
  and leaving; they only read the snapshot and the event stream.
- Snapshot for `Viewer::Spectator`: the full public view with `you` null and every private part removed
  (`hide_private`): the hand, legal and illegal cards, turn, coinche option and announcements. Bids, played cards, scores
  and round results stay, as they are public.
- Count: each spectator's open event stream counts (`Table::watcher_changed`, bumping the version so players see it);
  `table.spectators` and `table.spectatorsAllowed` are in the snapshot.
- Frontend: a Spectators choice in the table rules, a "Watch this table" button beside the join form (it uses the
  invitation code), a status line telling a spectator they are watching and seated players how many watch. FR and NL
  texts.
- Not verified here: the Rust crates were not compiled (no crates.io); CI is the first full check.
