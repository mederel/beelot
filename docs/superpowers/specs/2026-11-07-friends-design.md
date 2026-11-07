# Invite my friends (US-070)

- Tables (migration 0006): `friend_code` (one personal code per account, made on first use), `friendship` (requester,
  addressee, accepted), `table_invite` (owner, friend, table, code; lapses after ten minutes). All cascade with the
  account.
- Adding: `/friends/add/{code}` (an SPA path) asks `POST /api/friends/link {code}`. The opener asks; the owner of the
  link accepts (`POST /api/friends/{id}/accept`), so both consent. If the owner had already asked the opener, the two are
  friends at once. Own link and unknown codes are refused. `DELETE /api/friends/{id}` removes a friend or declines or
  withdraws a request, at any time.
- `GET /api/friends`: the player's link code, friends (with `online`: a session seen in the last three minutes; sessions
  are marked every minute), requests waiting and invitations.
- Invitations: `POST /api/tables/{id}/invite {friendId}` with the table token: only the owner of a private table that is
  still waiting (`Table::invitation`), and only to a friend. The friend's next `GET /api/friends` carries it, and the
  client asks every twenty seconds while signed in. The banner joins in one click with the table's code and the
  player's own name; `DELETE /api/invites/{id}` dismisses it.
- Frontend: `friends-model.js` (pure, tested), `app-friends.js` (Crew page list, banner, lobby invite buttons, link
  handling); FR and NL texts.
- Not covered: pushed notifications while the app is closed (the banner needs the app open), and friends in the data
  export.
- Not verified here: the Rust crates were not compiled (no crates.io); CI is the first full check.
