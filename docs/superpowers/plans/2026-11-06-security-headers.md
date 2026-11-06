# Security headers — implementation plan

Spec: `docs/superpowers/specs/2026-11-06-security-headers-design.md`.

1. `index.html`/`styles.css`: theme swatches as classes; `frontend-tests/csp.test.cjs` guards the page against
   inline script, style and handlers.
2. `app.rs`: response header layers (CSP, nosniff, frame options, permissions policy, HSTS over HTTPS);
   `tests/skeleton.rs` checks them.
3. Browser check: no CSP violation in the console on the home, settings and bot setup pages; swatches intact.
4. `cargo fmt --check`, clippy, `cargo test -p beelot-server`, frontend tests; PR `feat: add security headers`
   with auto-merge (squash).
