# Back up the database (US-153)

## Design

- **One script, `packaging/backup/beelot-backup`**, installed as `/usr/bin/beelot-backup` by the Debian package. It has two
  commands: `beelot-backup` (or `beelot-backup dump`) writes a dump, `beelot-backup restore FILE` loads one. It runs as root
  and needs `mariadb-dump` and `mariadb` (or `mysqldump` and `mysql`).
- **Settings.** The database comes from `BEELOT_DATABASE_URL`, `BEELOT_DATABASE_USERNAME` and `BEELOT_DATABASE_PASSWORD`
  with the server's own defaults (`mysql://localhost:3306/beelot`, `beelot`, `beelot`). A variable already in the
  environment wins; otherwise the script reads the last uncommented `NAME=value` line of the settings file
  (`/etc/beelot/beelot.env`, or `BEELOT_SETTINGS_FILE`). It never sources the file, because the unit's `EnvironmentFile`
  format is not shell. Two settings are the script's own: `BEELOT_BACKUP_DIR` (default `/var/backups/beelot`) and
  `BEELOT_BACKUP_KEEP` (copies kept, default 7); a third, `BEELOT_BACKUP_CLIENT_OPTIONS`, is passed to the MariaDB
  client tools (for example `--ssl-ca=...` for a database that needs TLS; the 11.4 client asks for TLS on remote
  connections). The server ignores all three.
- **The password is never on a command line.** It goes into a `--defaults-extra-file` created with mode 0600 in a private
  temporary directory, removed on exit.
- **Dump.** `mariadb-dump --single-transaction --quick --routines --events`, compressed with gzip, written to
  `beelot-YYYYMMDDTHHMMSSZ.sql.gz.part` and renamed once the whole pipeline succeeded, so a failed dump never leaves a file
  that looks complete. The dump drops and recreates each table (the `mariadb-dump` default), so a restore replaces them.
  It includes the migrations table, so the server finds the schema as it was.
- **Owner and mode: those of the settings file.** The finished file gets `chown --reference` and `chmod --reference` of the
  settings file (root, group `beelot`, 0640 in the package), because it holds personal data. The directory is created 0750
  with the same owner. Without a settings file the script falls back to `root:beelot` when that group exists, else root,
  mode 0640.
- **Copies.** After a successful dump, only the newest `BEELOT_BACKUP_KEEP` files named `beelot-*.sql.gz` stay. Nothing is
  deleted if the dump failed. A `KEEP` that is not a positive integer is an error, found before anything is dumped.
- **Restore** reads a `.sql.gz` or a plain `.sql` file into the database of the settings. The README says to stop the
  service first and to restore into a database that exists.
- **Debian package.** `beelot-backup.service` (oneshot, hardened, writes only `/var/backups/beelot`) and
  `beelot-backup.timer` (`daily`, a random delay of up to 30 minutes, `Persistent=true`) are installed as plain files, so
  the install neither enables nor starts them: `sudo systemctl enable --now beelot-backup.timer`. `postinst` creates
  `/var/backups/beelot` (0750, `root:beelot`); `postrm` leaves it and its backups alone, even on purge. The same script
  runs from cron: `17 3 * * * root /usr/bin/beelot-backup`. The package recommends `mariadb-server | mariadb-client`.
- **README** documents the dump and restore commands, the timer, the cron line, the relation between `BEELOT_BACKUP_KEEP`
  and the privacy setting `BEELOT_BACKUP_RETENTION_DAYS` (a daily backup kept N copies lives about N days, so set the
  two together), and says to **encrypt a backup before it leaves the machine** (`gpg --symmetric`, or `age`).
- **CI tries the procedure** (`.github/scripts/test-backup.sh`, in `package-build` on amd64): a MariaDB container gets
  Beelot's migrations and a played match (an account, a match record and its four seats); the script, run in a container
  with the MariaDB client, dumps it; a second, fresh database is restored from the file; the match is read back. It also
  checks the file's owner and mode, that copies beyond `KEEP` are removed, and that a failed dump leaves no file. The package
  checks (`check-deb.sh`, `test-deb-install.sh`) cover the new files, the units, that the timer is not enabled and that purge
  keeps the backups.

## Not in scope

Off-site copies, point-in-time recovery, encrypting the backup for the operator, and shipping the script in the RPM, Arch,
Gentoo and container packages (the README says where to find it, and how to dump from the container's MariaDB).

## Not verified

No Docker daemon or MariaDB is reachable from the session that wrote this. The script's logic (settings, copies, owner and
mode, failure) was tried with stubbed `mariadb-dump` and `mariadb`; the real dump and restore run for the first time in CI.
