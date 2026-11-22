# Plan: refuse a bad database URL the same way everywhere (US-190)

One pull request, `fix:`.

1. **Spec and plan** (this file and the design).
2. **Test first**: `tests/database_url.rs`.
3. **`db::options`**, used by `db::connect` and `AppState::new` (now a `Result`); `main` and the callers in tests follow;
   `tests/common::state_on` is the tests' one constructor.
4. **README** and the backlog's "Delivered" note.
5. **Checks**: fmt, clippy, workspace tests (the database ones run in CI).
