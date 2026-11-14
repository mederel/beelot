# An operator's status page (US-152)

## Design

- **Configuration.** `BEELOT_ADMIN_TOKEN` (`Config::admin_token`, empty when unset). Without it, `/admin/status` and
  `/admin/login` answer 404, as does any other path under `/admin`. The token must not be shorter than 16 characters:
  a shorter one is a configuration error at start-up, like the IP token secret.
- **Routes** (`src/routes/admin.rs`, merged before the static fallback):
  - `GET /admin/status`: the status page when the request carries `Authorization: Bearer <token>` or a valid admin
    cookie. Otherwise a small sign-in form (no data, no script). Answers `Cache-Control: no-store`.
  - `POST /admin/login` (form field `token`): on the right token, sets the cookie `beelot_admin` and redirects
    (303) to `/admin/status`; on a wrong token, the sign-in form again with 401.
  - The cookie value is `HMAC-SHA-256(token, "beelot-admin-status")` in hex, so the token itself is never stored in the
    browser. It is `HttpOnly`, `SameSite=Strict`, `Path=/admin`, `Max-Age=1800`, and `Secure` when the public address is
    HTTPS. Comparisons of the token and the cookie are constant-time.
- **Content.** Version (`routes::version::VERSION`), uptime since the server started, database state (the same `SELECT 1`
  with a two-second wait as `/api/health`, shared through `health::database_reachable`), open tables by kind
  (`Local`, `Private`, `Public`), connected players (human seats with an open event stream, counted across all tables),
  and the last 20 warnings and errors of the log.
- **Log capture.** `logs::ErrorLog` is a `tracing` layer that keeps the last 20 events of level WARN or ERROR, with their
  time, level and `message` field only. Other fields (which may hold names, tokens or addresses) are dropped, and an
  entry is cut at 200 characters. The log messages of the server are written as fixed texts, so this keeps no personal
  data. `main` installs the layer next to the formatter and gives the same handle to `AppState`.
- **Read-only.** No form on the page changes anything, it makes no request to another site, and it works without
  scripts. The page's security headers are the ones every response already carries.

## Not in scope

Acting on tables or accounts, graphs, metrics export, and a readiness or liveness split.

## Not verified

The Rust was written without a toolchain (the environment cannot download one or the crates). CI is the first compile
and test run; the tests listed in the plan must be run there.
