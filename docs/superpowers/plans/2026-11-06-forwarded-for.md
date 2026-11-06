# Rate limits behind a proxy — implementation plan

Spec: `docs/superpowers/specs/2026-11-06-forwarded-for-design.md`.

1. `limits/rate.rs`: `client_ip` takes the rightmost valid address; unit tests: rightmost wins, junk skipped,
   a forged leftmost address does not change the client.
2. README: single-proxy requirement, rightmost rule, nginx header.
3. `cargo fmt --check`, clippy, `cargo test -p beelot-server`; PR `fix: key rate limits on the rightmost
   X-Forwarded-For address` with auto-merge (squash).
