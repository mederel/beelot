# Design: sweep expired sessions in a batch (US-186)

## Goal

`sessions::sweep_expired` read every expired session, then for each one ran a `DELETE` and, when it had ended the session, an
`INSERT` of the `SESSION_EXPIRED` event: 2N + 1 statements, 10,001 for 5,000 expired sessions after a long outage, each of them
a round trip and a commit of its own.

## Decisions

- **One transaction per batch of 500** (`db::sessions::end_expired_batch`): `SELECT ... LIMIT 500 FOR UPDATE` of the expired
  sessions, one `DELETE ... WHERE token_hash IN (...)`, one multi-row `INSERT` of the events (`db::events::insert_many`), commit.
  The sweep repeats until a batch is short. For 5,000 sessions that is 10 full batches and one empty read: 4 statements plus
  `BEGIN` and `COMMIT` per batch, so 61 at most, against 10,001. 500 keeps the statements well under the placeholder limit
  (2,500 for the events) and the transaction short.
- **Exactly once.** The read locks its rows (`FOR UPDATE`). A request that expires the same session (`lookup` -> `expire`) either
  ended it before the sweep's read, so the sweep does not see it, or waits for the batch to commit and then deletes nothing
  (`delete` returns false, no event). The events are written in the batch's transaction, for exactly the rows it deleted.
  `lookup`'s own path is unchanged. The lock is taken on a scan without an index on the times, so a batch briefly blocks writes to
  sessions; the sweep runs hourly, a batch lasts milliseconds, and a request that loses a deadlock gets the usual database error.
- The old `sessions::expired` (read of all rows) is replaced; nothing else used it. The new functions are traced under
  `sessions.end_expired_batch` and `events.insert_many`.

## Tests

`tests/sessions.rs` (MariaDB):

- `the_sweep_of_five_thousand_expired_sessions_uses_few_statements_and_records_each_once`: 5,000 expired sessions made with the
  `seq_1_to_5000` sequence; the sweep runs on a pool of one connection so that `SHOW SESSION STATUS LIKE 'Questions'` counts
  its statements; at most 60 (10,001 before, computed from the old code: one read plus two per session); 5,000 events;
  a second sweep records nothing.
- `a_request_and_the_sweep_ending_the_same_session_record_one_expiry`: `lookup` and `sweep_expired` run together on an expired
  session; one event. The existing sweep and expiry tests are unchanged.

The figures are measured by CI's first run (the Docker bridge is blocked on the development host); the test prints the count.
