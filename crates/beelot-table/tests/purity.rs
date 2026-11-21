//! The crate stays free of I/O (US-165, ADR-006): none of its dependencies, direct or not, is a web, database or async
//! runtime crate.

use std::collections::{BTreeSet, HashMap};
use std::process::Command;

use serde_json::Value;

const FORBIDDEN: [&str; 8] = [
    "axum",
    "sqlx",
    "tokio",
    "hyper",
    "anyhow",
    "reqwest",
    "tower",
    "futures-util",
];

#[test]
fn the_table_crate_depends_on_no_web_database_or_async_crate() {
    let output = Command::new(env!("CARGO"))
        .args(["metadata", "--format-version", "1", "--locked"])
        .current_dir(env!("CARGO_MANIFEST_DIR"))
        .output()
        .expect("cargo runs");
    assert!(output.status.success(), "cargo metadata failed");
    let metadata: Value = serde_json::from_slice(&output.stdout).unwrap();
    let names: HashMap<&str, &str> = metadata["packages"]
        .as_array()
        .unwrap()
        .iter()
        .map(|package| {
            (
                package["id"].as_str().unwrap(),
                package["name"].as_str().unwrap(),
            )
        })
        .collect();
    let deps: HashMap<&str, Vec<&str>> = metadata["resolve"]["nodes"]
        .as_array()
        .unwrap()
        .iter()
        .map(|node| {
            // Dev-dependencies are tools of the tests, not of the code; a dependency of another platform (getrandom's
            // on WebAssembly, say) is none of this build's.
            let normal = node["deps"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|dep| {
                    dep["dep_kinds"]
                        .as_array()
                        .unwrap()
                        .iter()
                        .any(|kind| kind["kind"].is_null() && kind["target"].is_null())
                })
                .map(|dep| dep["pkg"].as_str().unwrap())
                .collect();
            (node["id"].as_str().unwrap(), normal)
        })
        .collect();
    let root = names
        .iter()
        .find(|(_, name)| **name == "beelot-table")
        .map(|(id, _)| *id)
        .expect("the crate is in the workspace");
    let mut seen = BTreeSet::new();
    let mut pending = vec![root];
    while let Some(id) = pending.pop() {
        if seen.insert(names[id]) {
            pending.extend(deps[id].iter().copied());
        }
    }
    let found: Vec<_> = seen
        .iter()
        .filter(|name| FORBIDDEN.contains(name))
        .collect();
    assert!(found.is_empty(), "beelot-table depends on {found:?}");
}
