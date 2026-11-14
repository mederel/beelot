# Plan: back up the database (US-153)

1. `packaging/backup/beelot-backup`: settings, dump, copies, owner and mode, restore. Tried locally with stubbed
   `mariadb-dump` and `mariadb`: default and file settings, the environment winning, KEEP, a failed dump, a bad KEEP, the
   mode and group of the file, restore from `.sql.gz` and `.sql`.
2. `packaging/debian/backup/beelot-backup.service` and `.timer`; both are plain assets, not `systemd-units`, so nothing is
   enabled by the install. `postinst` creates `/var/backups/beelot`. `beelot.env` lists `BEELOT_BACKUP_DIR` and
   `BEELOT_BACKUP_KEEP`, commented out.
3. `crates/beelot-server/Cargo.toml`: the new assets and `recommends = "mariadb-server | mariadb-client"`.
4. `check-deb.sh`: the script, the two units and their modes, the directory in `postinst`. `test-deb-install.sh`: the units
   verify, the timer is not enabled, the directory is `750 root:beelot`, purge keeps it.
5. `.github/scripts/test-backup.sh` and its step in `package-build` (amd64): dump a database with a played match, restore it
   into a fresh one, read the match back; owner and mode; copies; a failed dump.
6. README: the section "Back up and restore", the settings, the encryption advice. Backlog: US-153 delivered.
7. Checks to run where they can run: `bash -n` and the stubbed tests of step 1; in CI `cargo fmt --check`,
   `cargo clippy --all-targets -- -D warnings`, `cargo test --workspace`, and the packaging checks. Report any that could not
   be run.
