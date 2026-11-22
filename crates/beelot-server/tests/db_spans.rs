//! US-188: every public function of `src/db/` runs under `traces::db` with a name made of its module and its function, and
//! its body is formatted by rustfmt (which skips a statement holding a line over 100 characters).

use std::fs;
use std::path::Path;

/// Public async functions of `db/` that do not run a statement of their own: they set the pool up.
const SETUP: [&str; 2] = ["db.connect", "db.migrate"];

/// The `(name, body)` of each public async function of the file, a function ending at the next top-level closing brace.
fn public_functions(text: &str) -> Vec<(String, String)> {
    let mut found = Vec::new();
    let mut rest = text;
    while let Some(start) = rest.find("\npub async fn ") {
        let after = &rest[start + "\npub async fn ".len()..];
        let name: String = after
            .chars()
            .take_while(|c| c.is_alphanumeric() || *c == '_')
            .collect();
        let end = after.find("\n}\n").map_or(after.len(), |end| end + 3);
        found.push((name, after[..end].to_owned()));
        rest = &after[end..];
    }
    found
}

fn db_files() -> Vec<(String, String)> {
    let folder = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/db");
    let mut files: Vec<(String, String)> = fs::read_dir(folder)
        .unwrap()
        .map(|entry| entry.unwrap().path())
        .filter(|path| path.extension().is_some_and(|extension| extension == "rs"))
        .map(|path| {
            let module = path.file_stem().unwrap().to_str().unwrap();
            let module = if module == "mod" { "db" } else { module };
            (module.to_owned(), fs::read_to_string(&path).unwrap())
        })
        .collect();
    files.sort();
    files
}

#[test]
fn every_public_function_of_db_runs_under_a_span_named_after_its_module() {
    let mut checked = 0;
    let mut missing = Vec::new();
    for (module, text) in db_files() {
        for (function, body) in public_functions(&text) {
            let name = format!("{module}.{function}");
            if SETUP.contains(&name.as_str()) {
                continue;
            }
            checked += 1;
            if !body.contains(&format!("traces::db(\"{name}\"")) {
                missing.push(name);
            }
        }
    }
    assert!(checked > 50, "the functions were not found: {checked}");
    assert!(
        missing.is_empty(),
        "these db functions need `crate::traces::db(\"module.function\", ...)`: {missing:?}"
    );
}

#[test]
fn no_span_name_is_used_twice() {
    let mut names = Vec::new();
    for (_, text) in db_files() {
        for part in text.split("traces::db(\"").skip(1) {
            names.push(part.split('"').next().unwrap().to_owned());
        }
    }
    let mut sorted = names.clone();
    sorted.sort();
    sorted.dedup();
    assert_eq!(sorted.len(), names.len(), "a span name is used twice");
}

#[test]
fn no_line_of_db_code_is_too_long_for_rustfmt() {
    let mut long = Vec::new();
    for (module, text) in db_files() {
        for (number, line) in text.lines().enumerate() {
            let comment = line.trim_start().starts_with("//");
            if line.chars().count() > 100 && !comment {
                long.push(format!("{module}:{}", number + 1));
            }
        }
    }
    assert!(
        long.is_empty(),
        "split these lines (a string with a trailing backslash): {long:?}"
    );
}

/// The methods of `DbTableStore` are trait methods, which the check of the public functions does not see (US-172).
#[test]
fn the_methods_of_the_table_store_run_under_spans_too() {
    let text = db_files()
        .into_iter()
        .find(|(module, _)| module == "tables")
        .expect("db/tables.rs")
        .1;
    for name in ["tables.save", "tables.remove", "tables.load_active"] {
        assert!(
            text.contains(&format!("traces::db(\"{name}\"")),
            "{name} has no span"
        );
    }
}
