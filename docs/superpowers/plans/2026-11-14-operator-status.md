# Plan: an operator's status page (US-152)

1. Config: `admin_token` from `BEELOT_ADMIN_TOKEN`; start-up refuses a token under 16 characters when set. Unit tests in
   `config.rs` for unset, empty, short and valid values.
2. Health: extract `health::database_reachable(&pool) -> bool` and use it from `/api/health` (no behaviour change).
3. Tables: `TableRegistry::kind_counts()` (open tables per `TableKind`) and `TableRegistry::connected_players()` (human
   seats with an open event stream, from `TableHandle::streams`). Unit tests with two tables and a stream open.
4. Logs: `src/logs.rs`, `ErrorLog` (bounded to 20, WARN and ERROR only, `message` field only, 200-character cut) with a
   `tracing_subscriber::Layer` impl. Tests: bound, level filter, other fields dropped, cut length.
5. `main.rs`: build a `tracing_subscriber::registry()` with the env filter, the fmt layer and the `ErrorLog`; pass the
   handle to `AppState::with_error_log`. `AppState` gains `started: Instant` and `errors: Arc<ErrorLog>`.
6. Routes: `src/routes/admin.rs` with the status page, the sign-in form, the login handler, the cookie helpers and the
   constant-time comparison. Merge into `routes::api()`-adjacent router in `app.rs` (not under `/api`).
   Tests (router level, `tower::ServiceExt::oneshot`, lazy pool to an unreachable database):
   - off without the variable: `/admin/status` and `/admin/login` answer 404;
   - refused without the token: 200 with the form only, no version or table counts; wrong token: 401;
   - bearer token and cookie both give the page; the page holds no name, token or address of a seated player.
7. README: document `BEELOT_ADMIN_TOKEN` in the configuration table and `/admin/status` next to `/api/version` and
   `/api/health`.
8. Checks to run where a toolchain exists: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`,
   `cargo test --workspace`. Report any that could not be run.
