// The one reader of the CSRF cookie (US-193): the server sets `XSRF-TOKEN`, and a request that changes state echoes it in
// the `X-XSRF-TOKEN` header. Used by the API wrapper and by the browser's telemetry, which sends its own requests.
// Over HTTPS the server names the cookie `__Host-XSRF-TOKEN` and, for one release, also `XSRF-TOKEN` (US-178): the prefixed
// one is read first.
export function csrfToken(cookie: string): string | null {
  const match = /(?:^|;\s*)__Host-XSRF-TOKEN=([^;]*)/.exec(cookie) ?? /(?:^|;\s*)XSRF-TOKEN=([^;]*)/.exec(cookie);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}
