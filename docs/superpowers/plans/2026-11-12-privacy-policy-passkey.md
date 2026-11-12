# Plan: privacy policy for passkey-only accounts (US-129)

1. Migration 0007, `db/accounts.rs`, `db/events.rs`, `privacy/export.rs` (format 3), account route; adapt the DB tests.
2. `privacy::tokens` (HMAC) with unit tests; `hmac` dependency and lock entry.
3. Config: `BEELOT_HOSTING_COUNTRY`, `BEELOT_HOSTING_DPA`, `BEELOT_IP_TOKEN_SECRET`; `startup_problems`; `main` refuses
   to start; `policy-info` gives the new values.
4. `privacy-policy.json` (EN/FR/NL), `privacy-policy.js`, `index.html` container, `loadPolicyInfo`; drop the old texts.
5. Tests: Node (`privacy-policy.test.cjs`), Rust policy-vs-code (retention, export categories).
6. Docs: README, `beelot.env`, `check-deb.sh`, breach procedure, review record, backlog note.
7. Rebase, push, PR (`feat:`), auto-merge, watch CI.
