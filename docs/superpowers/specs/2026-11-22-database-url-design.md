# Design: refuse a bad database URL the same way everywhere (US-190)

## Goal

`db::connect` returns an error for a `BEELOT_DATABASE_URL` that does not parse, but `AppState::new` swallowed the error with
`unwrap_or_default()` and built a lazy pool on the default options (localhost:3306), so a state could run against a database the
operator never named. After this story both stop with the same message, which names the variable.

## Decisions

- **One function, `db::options(&Config)`.** It parses the URL, sets the user and the password, and adds the context
  `BEELOT_DATABASE_URL is not a valid database URL (for example mysql://localhost:3306/beelot)`. `db::connect` and `AppState::new`
  both call it, so the two cannot drift apart again.
- **`AppState::new` returns `anyhow::Result<Self>`.** `main` propagates it with `?`. It also calls `db::options` before the
  connection, so the message is not wrapped in "cannot reach the database", which would be misleading for a typo.
- **One constructor in the tests.** The integration tests build their states through `tests/common::state_on(config, clock)`
  (`state_with` and `table_persistence` use it); the unit tests of `routes/admin.rs`, inside the crate, call `new(..).expect(..)`.
- **Not changed.** The lazy pool, the other variables, the migrations.

## Tests

`tests/database_url.rs` (no database needed, the pool is lazy): the state refuses a URL that does not parse and the error names
`BEELOT_DATABASE_URL`; `connect` gives the same message; a valid URL gives a state. Before the change the first two fail
(`new` returned a state). The README names the variable in the failure.
