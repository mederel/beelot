# Privacy policy review record

The policy (`crates/beelot-server/static/privacy-policy.json`) is reviewed by a person before each release that
changes it (US-129). The reviewer confirms the legal bases, the transfer statement and the French and Dutch texts, and
writes the date and their name below.

| Policy version | Reviewed on | Reviewer | Legal bases | Transfer statement | FR / NL texts |
| -------------- | ----------- | -------- | ----------- | ------------------ | ------------- |
| 2026-11-12     | **pending** | **pending** | pending  | pending            | pending       |

Until a row is filled in by a human, the version above is **not reviewed**: the text was written and checked by the
developer and an AI assistant only.

## 2026-11-21: games in progress are saved (US-169)

Version `2026-11-21` adds, in English, French and Dutch, what is kept so that a restart of the server does not end a game:
the moves of each table in progress (the cards dealt, the calls, the cards played, the pseudonyms at the seats), the hashes
(never the tokens) of the tokens that act at it, and, in a separate record deleted with the account, the link from a seat to
a signed-in player's account. They are deleted two hours after the table's last move or visit, or when the table ends, and
the nightly job removes any a crash left.

Two decisions belong to the product owner and are **not yet made**: the retention (two hours is proposed, and enforced by
`privacy::retention::TABLE_RETENTION` and `tableHours` in the policy) and the wording above. Until a person fills the row
below, this version is **not reviewed**, and the pull request that adds it is not merged by the developer.

| Policy version | Reviewed on | Reviewer | Retention of saved tables | FR / NL texts |
| -------------- | ----------- | -------- | ------------------------- | ------------- |
| 2026-11-21     | **pending** | **pending** | pending (2 hours proposed) | pending      |
