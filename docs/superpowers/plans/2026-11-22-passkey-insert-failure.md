# Plan: tell a taken passkey from a failed insert (US-180)

One pull request, `fix:`.

1. **Spec and plan** (this file and the design).
2. **Tests first**: unit tests of `db::passkeys::credential_taken`; the two sign-up cases in `tests/passkeys.rs`.
3. **The function** `credential_taken` in `db/passkeys.rs`, used by `routes/passkeys.rs::sign_up`.
4. **The `_v2` call** in `auth/passkeys.rs::finish_sign_in`.
5. **Checks**: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`.
6. **Backlog**: the story's "Delivered" paragraph.
