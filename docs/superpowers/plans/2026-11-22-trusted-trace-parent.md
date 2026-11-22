# Plan: trust a caller's trace only when the proxy is trusted (US-177)

One pull request, `fix:`.

1. **Spec and plan** (this file and the design).
2. **Tests first** in `traces.rs`: the rule for each flag combination, and the parent context chosen for a request with a
   `traceparent`.
3. **The rule and the middleware**: `caller_trace_trusted`, `parent_context`; `track` takes the two flags; `app.rs` passes them.
4. **README** and the backlog's "Delivered" note.
5. **Checks**: fmt, clippy, workspace tests.
