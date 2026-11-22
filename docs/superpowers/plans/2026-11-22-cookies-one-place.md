# Plan: build every cookie in one place (US-178)

One pull request, `fix:` (a security hardening; no breaking change: the old names still work for one release).

1. **Spec and plan** (this file and the design).
2. **Tests first**: unit tests of the attributes in `auth/cookies.rs`; `tests/cookies.rs`; the frontend test of the prefixed read.
3. **`auth/cookies.rs`** and its use in `auth/csrf.rs`, `auth/sessions.rs`, `routes/passkeys.rs`, `routes/account.rs`,
   `routes/privacy.rs`, `routes/admin.rs`, `app.rs`.
4. **Frontend**: read `__Host-XSRF-TOKEN` first; `npm run build`, commit `static/`.
5. **Checks**: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`, the frontend checks,
   `node --test crates/beelot-server/frontend-tests/*.cjs`.
6. **Backlog**: the story's "Delivered" paragraph.
