//! The texts the server sends (US-170): every code, with samples of its parameters, is listed in
//! `frontend-tests/fixtures/message-catalogue.json`, which the frontend tests read to check that each language has a
//! text for each code. Run with `UPDATE_MESSAGES=1` after adding or rewording a message, and review the diff.

use std::collections::BTreeSet;
use std::path::PathBuf;

use beelot_table::messages::catalogue;
use serde_json::{Value, json};

fn path() -> PathBuf {
    [
        env!("CARGO_MANIFEST_DIR"),
        "frontend-tests",
        "fixtures",
        "message-catalogue.json",
    ]
    .iter()
    .collect()
}

#[test]
fn the_catalogue_is_the_list_the_frontend_checks() {
    let entries: Vec<Value> = catalogue()
        .iter()
        .map(|message| {
            json!({
                "code": message.code,
                "params": message.params,
                "english": message.english(),
            })
        })
        .collect();
    let text = serde_json::to_string_pretty(&entries).unwrap() + "\n";
    if std::env::var_os("UPDATE_MESSAGES").is_some() {
        std::fs::write(path(), text).unwrap();
        return;
    }
    let expected = std::fs::read_to_string(path()).unwrap_or_else(|_| {
        panic!(
            "{} is missing: run with UPDATE_MESSAGES=1",
            path().display()
        )
    });
    assert_eq!(
        text, expected,
        "a message changed: run with UPDATE_MESSAGES=1 and review the diff"
    );
}

#[test]
fn a_code_names_one_sentence_whatever_its_parameters() {
    // The same code with other parameters is the same sentence with other words in it: its parameters have the same
    // names, so a template of any language can fill them.
    let mut names: std::collections::BTreeMap<&str, BTreeSet<&str>> = Default::default();
    for message in catalogue() {
        let keys: BTreeSet<&str> = message.params.keys().copied().collect();
        let known = names.entry(message.code).or_insert_with(|| keys.clone());
        assert_eq!(*known, keys, "{} changes its parameters", message.code);
    }
}

#[test]
fn no_message_is_listed_twice() {
    let mut seen = BTreeSet::new();
    for message in catalogue() {
        let key = format!("{} {:?}", message.code, message.params);
        assert!(seen.insert(key.clone()), "{key} is listed twice");
    }
}
