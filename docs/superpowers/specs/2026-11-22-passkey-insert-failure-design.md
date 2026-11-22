# Design: tell a taken passkey from a failed insert (US-180)

## Goal

`POST /api/passkeys/sign-up` stores the account and its passkey in one transaction. Today any error of the passkey insert is
read as "a credential id another account already holds": the player gets a 400 and a recorded `SIGN_UP` failure, and is told
to try another key, when the database may simply be down or the schema wrong. After this story only the unique-key violation
on the credential id is a refusal.

## Decisions

- **A named test of the error, `db::passkeys::credential_taken(&sqlx::Error)`.** It is true for a database error that is a
  unique violation (`is_unique_violation`, MariaDB error 1062) whose message names the key `passkey_credential_unique` of the
  migration. The key name is checked because the table has a second unique key (the account id, its primary key): a clash there
  is not the player's key and must stay a server error. sqlx's MySQL driver gives no constraint name, so the message is the
  only place the key is named; it is a unit test's job to keep that parsing honest.
- **The handler.** `Err(error)` of the insert: when `credential_taken(&error)`, roll back and answer 400 with the `SIGN_UP`
  failure event, as before. Any other error is returned as `AppError::from(error)`: a 500 whose cause is logged by the error
  layer, no event is recorded (the player did nothing wrong), and the transaction is dropped, so rolled back.
- **The `_v2` sign-in.** `finish_discoverable_authentication` is replaced by `finish_discoverable_authentication_v2`, which takes
  the one credential that `identify` named (`&Passkey`) instead of a list of `DiscoverableKey`; the `#[allow(deprecated)]` goes.
  The signature counter check after it is unchanged.

## Tests

- Unit tests of `credential_taken` with a fake database error: the credential key, another unique key, a non-unique error,
  and a non-database error.
- `tests/passkeys.rs` (MariaDB): a sign-up whose credential id already belongs to another account answers 400, with the
  `SIGN_UP` failure event and no new account; a sign-up whose insert fails for another reason (the `passkey` table renamed
  away) answers 500, records no `SIGN_UP` event and leaves no account behind.
- The existing sign-in tests (counter goes up, cloned counter refused) cover the `_v2` call.

The database tests could not run on the author's host (the Docker bridge is blocked); CI is their first run.
