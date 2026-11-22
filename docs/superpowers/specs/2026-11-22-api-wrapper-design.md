# Design: call the API through one wrapper (US-193)

## Starting point

The story counted eight direct `fetch` calls in the old `app.js`. After the Svelte redesign (US-198) `apiJson` lives in
`web/src/lib/api/client.ts` (12 s timeout, retries of reads after 0.5, 1.5 and 3.5 s, CSRF echo, the connection note, errors
that carry the server's message code), and the direct calls are in nine places: the export, the account deletion and the
passkey ceremony's steps and the sign-out (they need the answer's status or a download), the leaderboard, the statistics and
their ratings, the home page's version, and the privacy page's two files. Four of them end in `.catch(() => null)`. The CSRF
cookie was read twice: in `client.ts` and, with another pattern, in `telemetry.ts`.

## Decisions

- **`apiResponse(url, options)`, a sibling of `apiJson`**, for a call whose status the caller reads or whose answer is a file.
  It returns the `Response` whatever its status; only a connection that fails (or times out) is an `ApiError`. Both functions
  now share `send` (CSRF echo, timeout, the error text) and `withRetries` (retry of reads, the connection note), so the
  timeout, the retries and the note are one code path. The timeout covers the answer's headers; a download's body is read by
  the caller after it.
- **JSON reads use `apiJson`**: the leaderboard, the statistics (a 401 is an `ApiError` with `status` 401: the guest's
  invitation), the ratings, the version, and the privacy page's policy and operator values (`Promise.allSettled`, each part
  kept if the other fails).
- **One reader of the cookie**: `src/lib/api/csrf.ts` exports `csrfToken(cookie)`; `withCsrfToken` passes it `document.cookie`
  and the telemetry passes it its window's cookie.
- **A failed call is never silent.** Without `.catch(() => null)` a connection that fails shows the usual note (the wrapper
  does it), and the page shows its own error state (`failed` on the leaderboard, the error view of the statistics). The ratings
  under the record stay empty when only they fail, with the note shown for a connection problem: the record above is more
  useful than an error replacing it. The sign-out still ignores a failure and goes home, as before (the session may be gone).
- **Not changed:** the table's event stream (not `fetch`), the service worker, and the home page's `.catch(() => {})` around
  the version, which only avoids an unhandled rejection of a footer.

## Tests

- `tests/api/one-wrapper.test.ts` reads `src/` and fails for a `fetch(` outside `client.ts`, for the browser's `fetch` outside
  `telemetry.ts`, and for a second reader of the `XSRF-TOKEN` cookie.
- `tests/api/response.test.ts`: `apiResponse` returns any status, echoes the CSRF cookie, retries a read and not a write, shows
  and clears the note, gives up after 12 s; `csrfToken` on cookies of several shapes. The existing telemetry and client tests
  still pass.
- `tests/components/app.test.ts`: the statistics page tells a guest (401) from an error (500); a leaderboard that cannot be
  reached sets the connection note (before the change nothing was shown).
