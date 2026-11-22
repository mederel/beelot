//! US-187: every SQL statement lives in `src/db/`, where the schema is read and each query is traced.

use std::fs;
use std::path::{Path, PathBuf};

/// What starts a statement with sqlx's query functions or builder.
const STATEMENTS: [&str; 5] = [
    "sqlx::query(",
    "sqlx::query_as",
    "sqlx::query_scalar",
    "sqlx::query_with",
    "QueryBuilder",
];

fn sources(folder: &Path, found: &mut Vec<PathBuf>) {
    for entry in fs::read_dir(folder).unwrap() {
        let path = entry.unwrap().path();
        if path.is_dir() {
            sources(&path, found);
        } else if path.extension().is_some_and(|extension| extension == "rs") {
            found.push(path);
        }
    }
}

#[test]
fn no_statement_is_written_outside_the_db_module() {
    let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut files = Vec::new();
    sources(&source, &mut files);
    assert!(files.len() > 20, "the sources were not found");
    let offenders: Vec<String> = files
        .iter()
        .filter(|path| !path.starts_with(source.join("db")))
        .filter(|path| {
            let text = fs::read_to_string(path).unwrap();
            STATEMENTS.iter().any(|statement| text.contains(statement))
        })
        .map(|path| path.strip_prefix(&source).unwrap().display().to_string())
        .collect();
    assert!(
        offenders.is_empty(),
        "SQL belongs in src/db/, found in {offenders:?}"
    );
}
