# Design: build every cookie in one place, and mark them secure (US-178)

## Goal

The session, CSRF, passkey-ceremony and operator cookies were each formatted by hand in a different handler. Over HTTPS
`XSRF-TOKEN` and `BEELOT_CEREMONY` lacked `Secure`, the ceremony's clearing cookie did not match its attributes, and none
used a `__Host-` name. After this story one module builds all of them.

## Decisions

- **`auth/cookies.rs`** holds the names, the attributes and the builders: `session`, `session_cleared`, `csrf`, `ceremony`,
  `ceremony_cleared`, `admin`, plus `append` (adds each to a response) and the readers `value`, `session_token`, `csrf_token`.
  No handler writes a `Set-Cookie` value any more; `sessions::cookie`, `expired_cookie`, `cookie_value`, `csrf::new_cookie`
  and the hand-written strings are gone.
- **`Secure`** over HTTPS (`secure_cookies`, from the public URL) on every cookie: session, CSRF, ceremony (and its clearing, with
  the same attributes apart from `Max-Age`) and admin.
- **`__Host-` prefix for the session and CSRF cookies over HTTPS** (`Secure`, `Path=/`, no `Domain`, as the prefix demands).
  The ceremony (`Path=/api/passkeys`) and admin (`Path=/admin`) cookies have a path other than `/`, which `__Host-` forbids,
  so they gain `Secure` only. Over plain HTTP (development) the names stay unprefixed, since a browser refuses a `__Host-`
  cookie without `Secure`.
- **Migration, one release.** A player already signed in has `BEELOT_SESSION`: the server still reads it (the prefixed name wins
  when both are present), so nobody is signed out; at the next sign-in the prefixed cookie is set and the plain one cleared,
  and sign-out clears both. The CSRF token is set over HTTPS under both names with the same value, because a page opened
  before the update reads only `XSRF-TOKEN`; the server accepts either name. The middleware gives a client that lacks the
  prefixed cookie a new token (both names) on its next response, so every client migrates by itself. The new frontend reads
  `__Host-XSRF-TOKEN` first, then `XSRF-TOKEN` (`api/csrf.ts`, the one reader), and `static/` is rebuilt with it.
  The plain `XSRF-TOKEN` over HTTPS, and the plain-name session read, are removed in a later release.
- **CSRF middleware** takes the `secure` flag (a closure in `app.rs`, as other layers do) to build the cookie it gives.

## Tests

- Unit tests in `cookies.rs` list the attributes of each cookie over HTTP and HTTPS, the clearing pair of the session and of the
  ceremony, and the preference for the prefixed name.
- `tests/cookies.rs` (no database): over HTTPS a first visit gets both CSRF cookies, `Secure` and readable by the script; over
  HTTP one plain cookie; a client with the prefixed token gets none; a client with only the plain one is given the prefixed; the
  CSRF rule accepts either name and refuses a wrong token; the ceremony cookie is `Secure` over HTTPS only.
- `tests/sessions.rs` adapts its cookie test to the new API; the sign-in, sign-out and CSRF tests there pass unchanged (they use
  the plain names, which still work). A frontend test covers the prefixed read.
- Left to the existing database tests: setting the session cookie on sign-in and clearing it on sign-out (CI runs them).
