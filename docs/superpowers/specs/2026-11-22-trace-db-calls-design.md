# Design: trace every database call under a name that tells them apart (US-188)

## Problem

The `beelot.db` spans were named by the function alone: `beelot.db insert` stood for six different tables (`accounts`,
`events`, `matches`, `passkeys`, `sessions`, ...), `find` for five. A slow query in a trace could not be told from another.
Some public functions had no span (`db/tables.rs`: `purge`, `forget_account`, `of_account`; `matches::played_by`). And
`rustfmt` left the bodies of many functions unindented: it gives up on a whole statement that holds a line over 100 characters
(the SQL strings), so `traces::db("insert", async move { ... })` was never formatted.

## Design

- **The name** is `{module}.{function}`: `sessions.insert`, `accounts.find`, `db.ping` (the functions of `db/mod.rs` use the module
  name `db`). The span is `beelot.db sessions.insert`; its only attribute is still `db.system.name=mariadb` (no statement, no value),
  so `traces::db` and its attributes do not change.
- **Every public async function** of `db/` runs under `traces::db`: the three of `db/tables.rs` and `matches::played_by` (a span around
  its page reads, which are spans of their own, `matches.played_by_page`, so the trace shows the loop) are added. The
  `connect` and `migrate` functions run once at the start and keep no span. The trait methods of `DbTableStore` are US-172's.
- **The helper's form.** `traces::db(name, async move { ... })` is kept: its block is a plain async block that rustfmt formats like
  any other, as the functions that already had short lines show. What stopped rustfmt was the long lines, so the SQL strings over
  100 characters are cut with a trailing backslash (the text is unchanged: Rust drops the next line's indent), and `cargo fmt`
  now indents every body. A new helper form (a macro, an extension method) would not change that and would touch every call.

## Tests (`tests/db_spans.rs`)

1. every `pub async fn` of `src/db/*.rs` (but `connect` and `migrate`) has `traces::db("{module}.{function}"` in its body: red before
   the change, naming `tables.purge`, `tables.forget_account`, `tables.of_account`, `matches.played_by` and (before the rename)
   every function;
2. no span name is used twice;
3. no line of code over 100 characters in `src/db/` (what keeps rustfmt formatting the bodies; the comment lines are exempt, rustfmt
   does not break them).

The span's attribute set stays tested by `traces.rs`'s unit tests.
