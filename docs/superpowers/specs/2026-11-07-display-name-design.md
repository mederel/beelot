# Choose my display name (US-072)

- `PUT /api/account/name` `{name}` (signed in, CSRF as any write): the name goes through `required_name` (trimmed,
  required, at most 30 characters, the rules of every player name) and replaces `account.display_name`; the stored
  name comes back.
- Where it shows: the history recorder reads the account's name when a match is stored, and the leaderboard joins the
  account, so both follow by themselves. Tables take the name the client sends: the name fields of the setup, join
  and public forms are filled with the account name and follow a rename (a field the player edited by hand is kept).
  A seat already taken keeps its name until the player leaves.
- Frontend: `display-name.js` (pure, tested) checks the name before sending; the form sits in the account block of
  Settings, with a status line. FR and NL texts.
- Not verified here: the server crate was not compiled (no crates.io), CI is the first full check.
