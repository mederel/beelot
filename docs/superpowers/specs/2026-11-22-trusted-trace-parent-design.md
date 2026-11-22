# Design: trust a caller's trace only when the proxy is trusted (US-177)

## Goal

Today every request's `traceparent` becomes the parent of its server span. A client can therefore pick the trace id and, with
the `sampled` flag, force the trace to be sampled whatever the operator's sampler says. After this story the header is a parent
only when the operator has said where it comes from.

## Decisions

- **A pure rule, `traces::caller_trace_trusted(headers, trust_forwarded, browser_traces)`.** The header is a parent when:
  1. `BEELOT_TRUST_FORWARDED_HEADERS` is on: the operator has declared that a proxy is the only way in, and the proxy forwards
     the page's `traceparent` (the same trust the rate limits give `X-Forwarded-For`); or
  2. `BEELOT_BROWSER_TRACES` is on and the browser says the call is its own page's (`Sec-Fetch-Site: same-origin`), which is how
     the page's calls (US-158) keep working without a proxy. `Sec-Fetch-Site` is set by browsers and cannot be set by a page's
     script; a non-browser client can write it, so this is not authentication: it is bounded by the operator having switched
     browser traces on, which already invites the page's spans.
  Otherwise the request starts its own trace and the configured sampler decides.
- **Where the rule is applied.** `traces::track` takes the two flags from the configuration (the middleware is built with a
  closure, as `limit_headers` is); an untrusted request gets an empty parent context, so the span is a root span.
- **Not changed.** The span attributes and the browser's own spans.

## Tests

- A unit test of the rule for the combinations of the flags and of the `Sec-Fetch-Site` header.
- A unit test of the parent actually used: an untrusted header gives an invalid (root) context, a trusted one the caller's ids.

The README says when the header is trusted.
