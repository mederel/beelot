# Plan: trace every database call under a name that tells them apart (US-188)

One pull request, `refactor:`.

1. **Spec and plan** (this file and the design).
2. **The test** `tests/db_spans.rs`: public functions have a `module.function` span, names are unique, no line over 100 characters.
3. **The names**: every `traces::db("x"` of `src/db/` becomes `traces::db("module.x"`; spans added to `db/tables.rs` and
   `matches::played_by`; the SQL strings cut so that rustfmt indents the bodies.
4. **README**: the span's name.
5. **Checks**: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`.
6. **Backlog**: the story's "Delivered" paragraph.
