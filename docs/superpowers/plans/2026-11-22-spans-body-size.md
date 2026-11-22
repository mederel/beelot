# Plan: let the spans route take its own body size (US-189)

One pull request, `fix:`.

1. **Spec and plan** (this file and the design).
2. **Tests first**: the 50-span test (red with 413), the 70 KB test with traces on, the frontend batching test (red).
3. **The size middleware** in `limits/size.rs`, `app.rs` uses it; `browser_traces::MAX_BODY` and the path become public.
4. **The client** sends batches of at most 100.
5. **Rebuild `static/`**, the backlog's "Delivered" note.
6. **Checks**: fmt, clippy, workspace tests, `npm run check && npm test && npm run build`.
