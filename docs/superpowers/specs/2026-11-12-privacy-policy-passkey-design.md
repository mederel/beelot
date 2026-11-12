# Privacy policy for passkey-only accounts (US-129)

## Data minimisation (server)
- Migration `0007_privacy_minimal.sql`: drops `account.previous_sign_in_at`; renames `security_event.ip_address` to
  `ip_token` (VARCHAR(64)) and nulls the old addresses. Only the last sign-in is kept; the "last sign-in" line of the
  account bar is removed (it would only show the current sign-in).
- `privacy::tokens`: the IP token is HMAC-SHA-256 of the canonical address, hex, keyed by `BEELOT_IP_TOKEN_SECRET`
  (a `OnceLock` set at startup). Same address, same token; the address is not recoverable without testing guesses
  against the secret, so the policy calls tokens pseudonymised personal data.
- Startup: `privacy::startup_problems` lists every unset policy variable (controller, contact, host, DPA,
  backup days) and a secret shorter than 16 characters; `main` refuses to start with that list. The page can therefore
  never show "not configured" in production.
- Export format becomes `beelot-export-3` (`ipToken`, no `previousSignInAt`).

## Policy source
- `static/privacy-policy.json`: a version (a date), the retention figures, the export categories, and 11 sections in
  the story's order (controller, data, not held, processors, transfers, retention, browser storage, rights, complaints,
  automated decisions, changes), each text in `en`, `fr`, `nl`.
- `static/privacy-policy.js` fills `{placeholders}` (policy figures and the server's `/api/privacy/policy-info`, which
  now also gives `hostingAgreement`) and renders text nodes only. Sections are numbered by order.
- The old hard-coded section of `index.html` and its FR/NL dictionary entries are removed.

## Tests
- Node: all texts in three languages, same placeholders in each, none left unfilled, section order, rendering is
  text-only.
- Rust: the policy's retention figures equal `EVENT_RETENTION`, `ACCOUNT_RETENTION_YEARS` and the session limits; the
  policy's export categories equal the keys of a real export; `tokens` and `startup_problems` unit tests; DB tests
  adapted to the dropped column and the token.

## Deviations and open points
- The data section is a list, not a table.
- The story's "passkeys of unfinished sign-ups after 1 day" is not a retention row: no such passkey is ever stored
  (the ceremony lives in memory for 5 minutes), and the policy says exactly that.
- The human review is pending (`docs/privacy/policy-review.md`); the French and Dutch texts were written by the
  assistant and need a native reader.
- Not verified here: the Rust crates were not compiled (no toolchain or crates.io); CI is the first full check.

## Follow-up: no hosting country
The policy says Beelot is hosted "within the European Union" and no longer names the country, so
`BEELOT_HOSTING_COUNTRY` is removed (config, startup check, `policy-info`, README, `beelot.env`, `check-deb.sh`).
The owner must still keep the server in the EU.
