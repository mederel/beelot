<p align="center">
  <img src="docs/images/logo.svg" alt="Beelot logo" width="96">
</p>

# Beelot

[![Build](https://github.com/mederel/beelot/actions/workflows/build.yml/badge.svg)](https://github.com/mederel/beelot/actions/workflows/build.yml)
[![Release](https://img.shields.io/github/v/release/mederel/beelot?sort=semver)](https://github.com/mederel/beelot/releases/latest)
![Rust 1.95](https://img.shields.io/badge/Rust-1.95-orange?logo=rust)
![axum](https://img.shields.io/badge/axum-tokio-blue)
![French, English, Dutch](https://img.shields.io/badge/languages-FR%20%C2%B7%20EN%20%C2%B7%20NL-purple)

**Deal in. Good times await.** French Belote and Contrée in the browser:
against sharp bots, around one device, or online with friends. It has a bold
cartoon look: a teal felt table, thick ink outlines, chunky sticker-style
buttons and hand-drawn bot characters.

<p align="center">
  <img src="docs/images/home.jpg" alt="Beelot's cartoon home screen" width="49%">
  <img src="docs/images/bidding.jpg" alt="A Contrée auction against bots, in the cartoon style" width="49%">
</p>

| | |
| --- | --- |
| **Two games, one table** | Classic Belote with upcard bidding, and Contrée with an 80–160 auction and coinche. |
| **Bots worth beating** | Relaxed bots play by the rules of thumb; Challenging bots sample hidden hands and solve them double-dummy before every card. |
| **Play your way** | A "Play now" button that deals a bot game in one tap (classic Belote, announcements on, 1,000 points, relaxed bots, or the choices you last made under "Customise"), pass-and-play on one device, private tables for your crew, or public matchmaking. |
| **Your story in numbers** | Sign in to keep every match: wins per variant and difficulty, contracts, coinches, capots and belotes. |
| **No passwords, ever** | Sign in with a passkey, or just play as a guest. No email address asked. |
| **Privacy built in** | Download or delete your data from Settings, and a clear privacy policy. |
| **Speaks your language** | French, English and Dutch, with sound effects and an effects level (full, reduced or off). |

This repository is Beelot's Rust backend and its frontend.
[ADR-001](docs/adr/001-rust-platform.md) records the decision and
[the design](docs/superpowers/specs/2026-10-23-rust-backend-design.md) the
details.

The other documents are the [product backlog](docs/product-backlog.md), ADR-002
to ADR-005 in `docs/adr/`, the
[data breach procedure](docs/privacy/data-breach-procedure.md), and the feature
specs and plans in `docs/superpowers/`.

## Quick start

The server needs MariaDB; `compose.yaml` starts one with the server's defaults.

```sh
docker compose up -d --wait
cargo run -p beelot-server
```

Then open <http://localhost:8080>. The server applies its database migrations at
startup, serves the frontend from `crates/beelot-server/static/`, and stops
cleanly on Ctrl-C.

## Configuration

The server reads these variables from the environment, or from a `.env` file in
the directory it runs from:

| Variable                         | Default                         | Meaning                                                    |
| -------------------------------- | ------------------------------- | ---------------------------------------------------------- |
| `BEELOT_BIND`                    | `0.0.0.0:8080`                  | the address the server listens on                          |
| `BEELOT_DATABASE_URL`            | `mysql://localhost:3306/beelot` | the MariaDB database                                       |
| `BEELOT_DATABASE_USERNAME`       | `beelot`                        | its user                                                   |
| `BEELOT_DATABASE_PASSWORD`       | `beelot`                        | its password                                               |
| `BEELOT_PUBLIC_URL`              | `http://localhost:8080`         | the address players use: the passkeys' relying party       |
| `BEELOT_TRUST_FORWARDED_HEADERS` | `false`                         | take the client address from `X-Forwarded-For` (behind a proxy) |
| `BEELOT_STATIC_DIR`              | the crate's `static/`           | the frontend's files                                       |
| `BEELOT_REPOSITORY_URL`          | `https://github.com/mederel/beelot` | the repository whose releases the version links to     |
| `BEELOT_ANDROID_PACKAGE`         | `fr.beelot.app`                 | the Android app's package, in `/.well-known/assetlinks.json` |
| `BEELOT_ANDROID_CERT_SHA256`     | unset                           | SHA-256 fingerprints (comma-separated) of the certificates the Android app is signed with |
| `BEELOT_PRIVACY_CONTROLLER`      | unset                           | the data controller named in the privacy policy            |
| `BEELOT_PRIVACY_CONTACT`         | unset                           | the privacy contact                                        |
| `BEELOT_HOSTING_PROVIDER`        | unset                           | the hosting provider                                       |
| `BEELOT_HOSTING_DPA`             | unset                           | the reference of the data processing agreement with the host |
| `BEELOT_BACKUP_RETENTION_DAYS`   | unset                           | how many days backups are kept                             |
| `BEELOT_IP_TOKEN_SECRET`         | unset                           | the key (16 characters or more) of the IP tokens in security events; keep it out of the database and the repository |
| `BEELOT_ADMIN_TOKEN`             | unset                           | the operator's token (16 characters or more) for `/admin/status`; unset, the page is off |

The privacy policy is in `crates/beelot-server/static/privacy-policy.json`, in English, French and Dutch. Its
operator values come from the variables above, and **the server refuses to start** until every one of them is set
(and the IP token secret is long enough), so an incomplete policy is never published. To run it locally, put
placeholder values in a `.env` file (it is ignored by Git), for example `BEELOT_PRIVACY_CONTROLLER=Dev`,
`BEELOT_PRIVACY_CONTACT=dev@example.org`, `BEELOT_HOSTING_PROVIDER=local`,
`BEELOT_HOSTING_DPA=none`, `BEELOT_BACKUP_RETENTION_DAYS=1` and `BEELOT_IP_TOKEN_SECRET=dev-secret-0123456789`.
Changing the secret makes the tokens of earlier events unrelated to new ones; it does not affect players.
Logs go to standard output; set
`RUST_LOG` (for example `RUST_LOG=beelot_server=debug`) to change their level.

## Send logs and metrics to OpenTelemetry

The server can send its logs (US-154), its metrics (US-155) and its traces (US-156) to an OpenTelemetry collector over OTLP. It is off unless an
endpoint is set, and it is configured only by the standard variables of OpenTelemetry, in the environment or in
`/etc/beelot/beelot.env`:

| Variable                                                  | Default    | Meaning                                              |
|-----------------------------------------------------------|------------|------------------------------------------------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT`, or `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` and `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` for one signal | unset | the collector's http or https address, such as `http://collector:4318`; unset, nothing is exported |
| `OTEL_METRIC_EXPORT_INTERVAL`                             | `60000`    | milliseconds between two exports of the metrics      |
| `OTEL_TRACES_SAMPLER`, `OTEL_TRACES_SAMPLER_ARG`          | `parentbased_always_on` | the standard sampler, such as `parentbased_traceidratio` with `0.1` to keep one trace in ten |
| `OTEL_EXPORTER_OTLP_HEADERS`                              | unset      | headers sent with each export, such as `authorization=Bearer ...` |
| `OTEL_EXPORTER_OTLP_PROTOCOL`                             | `http/protobuf` | the only protocol Beelot exports with; anything else stops the start |
| `OTEL_SERVICE_NAME`                                       | `beelot`   | the `service.name` of the records                    |
| `OTEL_RESOURCE_ATTRIBUTES`                                | unset      | more resource attributes, `key=value,key=value`      |
| `OTEL_SDK_DISABLED`                                       | `false`    | `true` turns the export off whatever the endpoint    |

A bad endpoint or protocol stops the start with a message that names the variable. A record holds the time, the severity,
the target of the event as the instrumentation scope, the message as the body, and the resource attributes `service.name`,
`service.version` and `service.instance.id` (new at each start). It holds nothing else: the other fields of an event
(names, tokens, addresses) are never read, and only events of Beelot's own crates are sent. `RUST_LOG` picks what is sent as
it picks what is printed; the standard output and the status page work as before. The records leave on their own thread
through a queue of 2048: a collector that does not answer drops records and never slows a match, and the pending records
are sent when the server stops (five seconds at most).

The metrics (all names start with `beelot.` except the standard HTTP one; the temporality is cumulative):

| Instrument                    | Type              | Unit | Attributes |
|-------------------------------|-------------------|------|------------|
| `http.server.request.duration` | histogram         | `s`  | `http.request.method`, `http.route` (the matched template, or `unmatched`), `http.response.status_code` |
| `beelot.tables.open`          | gauge             |      | `beelot.table.kind` (`local`, `private`, `public`) |
| `beelot.players.connected`    | gauge             |      | none: human players with an open event stream at their seat |
| `beelot.matches.started`      | counter           |      | `beelot.table.kind` |
| `beelot.matches.completed`    | counter           |      | `beelot.table.kind` |
| `beelot.database.up`          | gauge             |      | none: 1 when the database answered the last check (every 15 seconds), else 0 |

No attribute holds a player, an account, a table identifier, an address or a path as requested, so the number of series
is bounded by the routes, the methods, the status codes and the three table kinds. There is no `/metrics` route: to chart
them in Prometheus, send them through a collector with a `prometheus` exporter, or to Prometheus's own OTLP receiver.

The traces: every request has a server span named `{method} {route}` (`GET /api/tables/{id}`; the template, never the path
asked for) with `http.request.method`, `http.route` and `http.response.status_code`, and the status `error` for a 5xx. A
`traceparent` header from a proxy makes it a child of the caller's trace (W3C Trace Context). Under it, each database call
of the repository functions is a span `beelot.db {function}` with `db.system.name=mariadb` and no statement, and each table
action is a span `beelot.table act` with `beelot.table.kind`. Nothing else is traced, and no span holds more attributes than
these: no query string, address, name, token or identifier. The log records written while a request is answered carry its
`trace_id` and `span_id`, so a log line leads to its trace and back.

A minimal collector that prints what it receives:

```yaml
receivers:
  otlp:
    protocols:
      http:
        endpoint: 0.0.0.0:4318
exporters:
  debug:
    verbosity: detailed
service:
  pipelines:
    logs:
      receivers: [otlp]
      exporters: [debug]
    metrics:
      receivers: [otlp]
      exporters: [debug]
    traces:
      receivers: [otlp]
      exporters: [debug]
```


## A complete observability stack (OpenObserve)

`packaging/container/compose.yaml` has a profile `observability` that starts [OpenObserve](https://openobserve.ai) next to
Beelot: one container that stores and searches the logs, metrics and traces, with a web interface and an OTLP/HTTP receiver,
so no separate collector runs. It is AGPL-3.0, like Beelot, and the data stays in the volume `beelot-openobserve` on your
machine.

1. In `.env` set `OPENOBSERVE_ROOT_EMAIL` and `OPENOBSERVE_ROOT_PASSWORD`, and the two `OTEL_*` lines of `.env.example`
   (the endpoint `http://openobserve:5080/api/default` and the `Authorization` header with the Basic token, made by the
   command written there). `OPENOBSERVE_RETENTION_DAYS` (14 by default) is how long the data is kept.
2. `docker compose --profile observability up -d`, then open `http://127.0.0.1:5080` (published on the loopback only; put a
   TLS reverse proxy in front to reach it from elsewhere).

A one-shot service loads a "Beelot" dashboard (request rate, 95th percentile of the duration and share of 5xx by route, open
tables, connected players, completed matches, database up, and the recent warnings and errors) and the alert
`beelot-database-down` (the database has not answered for two minutes). Running it again changes nothing. The alert has no
destination: add one in OpenObserve (Alerts, Destinations) to be told. Without the profile and without the `OTEL_*` lines,
nothing changes.

The CI starts this stack, sends traffic, checks that the log line, the request's span and the request metric are searchable
and that the dashboard and the alert exist, and prints the memory of the container and the size of its image in the log of
the step "Test the observability stack". Those figures are not quoted here until they have been read.

To use another backend (OpenObserve Cloud, Grafana Cloud, SigNoz, Honeycomb or any OTLP endpoint), leave the profile off and
set `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_EXPORTER_OTLP_HEADERS` to what it gives you.

## Serve over HTTPS

The server only speaks plain HTTP. To serve Beelot over HTTPS, put a reverse
proxy that terminates TLS in front of it, then tell Beelot its public address:

1. Keep the server off the network: `BEELOT_BIND=127.0.0.1:8080`.
2. Set `BEELOT_PUBLIC_URL` to the address players type, for example
   `https://beelot.example`. This is what switches the session cookie to
   `Secure` and fixes the passkeys' relying party, so passkeys registered under
   the old `http://` address stop working: changing the host or scheme means
   registering them again.
3. Set `BEELOT_TRUST_FORWARDED_HEADERS=true` so the rate limits see the player's
   address from `X-Forwarded-For` instead of the proxy's. Only do this when a
   single proxy is the sole way in, otherwise anyone can forge the header. Beelot
   takes the rightmost address of the header, the one that proxy appended, and
   ignores what the client wrote before it.
4. Have the proxy forward to the server. With [Caddy](https://caddyserver.com/),
   which gets and renews the certificate by itself, the whole `Caddyfile` is:

   ```
   beelot.example {
       reverse_proxy 127.0.0.1:8080
   }
   ```

   The domain must point at the machine, and ports 80 and 443 must be open for
   the certificate to be issued. Any other proxy (nginx, Traefik) works the same
   way: terminate TLS, forward to the server and add the client's address to
   `X-Forwarded-For` (nginx: `proxy_set_header X-Forwarded-For $remote_addr;` or
   `$proxy_add_x_forwarded_for`; both work because only the last entry is used).

Passkeys require HTTPS (browsers make an exception for `http://localhost`), so
this is also what makes sign-in with a passkey work on a public server.

## Install from the apt repository

On Debian 13, Ubuntu 24.04 or later (amd64 or arm64), install Beelot from its signed apt
repository on GitHub Pages; `apt upgrade` then follows the releases.

```sh
sudo install -d -m 0755 /etc/apt/keyrings
curl -fsSL https://mederel.github.io/beelot/beelot.asc | sudo tee /etc/apt/keyrings/beelot.asc > /dev/null
sudo tee /etc/apt/sources.list.d/beelot.sources > /dev/null <<'EOF'
Types: deb
URIs: https://mederel.github.io/beelot
Suites: stable
Components: main
Signed-By: /etc/apt/keyrings/beelot.asc
EOF
sudo apt update
sudo apt install beelot
```

The package installs the server, its frontend and a `beelot` systemd service
running as the `beelot` user, and recommends `mariadb-server`. It does not create
the database and does not start the service at install, but it enables it: once
configured, it starts at every boot (a start that fails five times in a minute,
for example before the database is set up, is not retried).

1. Create the database and its user in MariaDB (choose your own password):

   ```sql
   CREATE DATABASE beelot;
   CREATE USER 'beelot'@'localhost' IDENTIFIED BY '<password>';
   GRANT ALL ON beelot.* TO 'beelot'@'localhost';
   ```

2. Edit `/etc/beelot/beelot.env`: uncomment `BEELOT_DATABASE_PASSWORD` and set it
   to that password and, if the database is elsewhere, uncomment
   `BEELOT_DATABASE_URL` and set it. The file lists every
   setting of the [configuration](#configuration) table, commented out with its
   default. It holds the password, so only root and the `beelot` group can read
   it; an upgrade never overwrites your edits.
3. Start it: `sudo systemctl start beelot`. The logs are in
   `journalctl -u beelot`. The database tables are created and migrated at
   startup.

The server listens on `127.0.0.1:8080`: put a proxy in front of it, as in
[Serve over HTTPS](#serve-over-https). To remove the package and its settings:
`sudo apt purge beelot` (the `beelot` user and the database are left alone).

### Install the RPM (Fedora, Rocky Linux, AlmaLinux)

Releases also build `beelot-<version>-1.x86_64.rpm` (amd64) and `beelot-<version>-1.aarch64.rpm` (arm64), served from a signed dnf repository on GitHub Pages, so
`dnf upgrade` follows the releases. Add the repository, then install:

```sh
sudo curl -fsSL https://mederel.github.io/beelot/rpm/beelot.repo -o /etc/yum.repos.d/beelot.repo
sudo dnf install beelot
sudo dnf install mariadb-server      # or use a database elsewhere
```

The `.repo` file turns `repo_gpgcheck` on and fetches the public key from `https://mederel.github.io/beelot/beelot.asc`
(the apt repository's key): dnf checks the signature of the repository's index, which lists the SHA-256 of every package.
The packages themselves are not signed one by one (`gpgcheck=0`). To install without the repository, download the file
from the [latest release](https://github.com/mederel/beelot/releases/latest) and run `sudo dnf install ./beelot-<version>-1.<arch>.rpm` (`x86_64` or `aarch64`).

Then follow steps 1 and 2 above (the database and `/etc/beelot/beelot.env`, which is `root:beelot`, mode 0640, and
kept when you upgrade). Following RPM convention, the install neither enables nor starts the service:
`sudo systemctl enable --now beelot`. An upgrade restarts it if it is running. The package needs the glibc of its
build image (2.39), so `dnf` refuses it on RHEL 9 and its clones (glibc 2.34); use Fedora 40 or later, RHEL 10 or a
clone of it. Removing it (`sudo dnf remove beelot`) keeps the `beelot` user and the database, and an edited settings
file is saved as `beelot.env.rpmsave`.

### Container image

Each release publishes `ghcr.io/mederel/beelot:<version>` and `:latest` for amd64 and arm64 (one multi-architecture
image: `docker pull` takes the machine's own; `<version>-amd64` and `<version>-arm64` name each one, and the arm64 image
appears a few minutes after the amd64 one): the release's own server binary and
frontend on Debian 13, running as the unprivileged user 10001, listening on `0.0.0.0:8080` inside the container, with the
settings of the [configuration](#configuration) table read from the environment. The image has no volume: all state is
in the MariaDB database, so the container can be replaced at any time (games in progress end and players are signed
out). Like the other packages, it refuses to start until the privacy settings and the IP token secret are set, and its
log names what is missing.

The image has a `HEALTHCHECK` on `GET /api/health`, next to `GET /api/version` (the running version): it answers 200 with
`{"status":"ok"}` when the server reaches its database and 503 with `{"status":"unavailable"}` when it does not. The route
needs no sign-in, is not rate limited, never shows an error or any setting, and reads and writes nothing; a proxy or a
monitor can use it the same way.

An operator can see the server's state on `GET /admin/status` (US-152). The page is off unless `BEELOT_ADMIN_TOKEN` is set
(at least 16 characters; the server refuses a shorter one). Then it asks for the token in a form, which sets a cookie for
30 minutes, or accepts `Authorization: Bearer <token>` from a monitor. It shows the version, how long the server has run,
the database state, the open tables by kind, the number of connected players and the last warnings and errors of the log.
It holds no names, tokens or addresses and changes nothing.

`packaging/container/compose.yaml` runs it with MariaDB and a database volume:

```sh
cd packaging/container
cp .env.example .env && $EDITOR .env      # fill in every change-me
docker compose up -d
```

It publishes the port on the host's loopback only (`127.0.0.1:8080`): put a reverse proxy that terminates TLS in front of
it as in [Serve over HTTPS](#serve-over-https), set `BEELOT_PUBLIC_URL` to the address players type and, if the proxy is
the only way in, `BEELOT_TRUST_FORWARDED_HEADERS=true`. To update, `docker compose pull && docker compose up -d`; pin
`BEELOT_VERSION` in `.env` to stay on a release. Take a database backup first, as a release can migrate the schema (see [Back up and restore](#back-up-and-restore)).

The first image pushed creates a **private** package: in the repository's Packages, open `beelot`, Package settings,
and change its visibility to public once, so that `docker pull` works without a login. CI builds the image from the
same binary and runs it against a MariaDB container, on amd64 and on arm64, on every pull request.

### Arch Linux

`packaging/arch/` holds a `PKGBUILD` that builds a tagged release from source (it needs `cargo`; the build takes a few
minutes). It installs the same files as the other packages, with the unit disabled, a `sysusers.d` file for the
`beelot` user and a `tmpfiles.d` file that gives `/etc/beelot/beelot.env` the owner `root:beelot` and mode 0640. The
settings file is a pacman backup file, so an upgrade keeps your edits (a changed default is written as `.pacnew`).

```sh
git clone https://github.com/mederel/beelot && cd beelot
packaging/arch/prepare-pkgbuild.sh <version> /tmp/beelot-pkg   # fills in pkgver and the checksum of the tag
cd /tmp/beelot-pkg && makepkg -si
sudo systemctl enable --now beelot                              # after steps 1 and 2 above
```

CI builds, installs and checks this package in an Arch container on every pull request. A maintainer who wants it on
the AUR copies the output of `prepare-pkgbuild.sh` for the release, generates `.SRCINFO` with
`makepkg --printsrcinfo > .SRCINFO` and pushes both to the AUR repository of the package `beelot`; nothing here
publishes it.

### Gentoo

`packaging/gentoo/` is a small overlay (`beelot`) with the package `games-board/beelot`, built from a tagged release with
`cargo.eclass` and your own flags, and the `acct-user/beelot` and `acct-group/beelot` packages that create the service
user. It installs the same files as the other packages (`/usr/bin/beelot-server`, `/usr/share/beelot/static`, and
`/etc/beelot/beelot.env`, `root:beelot` mode 0640, kept by `CONFIG_PROTECT` when you update) and supports both init
systems: the systemd unit and an OpenRC script (`supervise-daemon`, run as `beelot`, reading the same
`/etc/beelot/beelot.env`; quote a value that holds spaces or shell characters). Neither is started or enabled by the
install. The `mariadb` USE flag (on by default) only adds a dependency on MariaDB; switch it off to have the database on
another machine.

The ebuild lists every crate of `Cargo.lock`, and their licences, so it changes with each release. Every release
therefore carries the ready-made overlay, `beelot-gentoo-overlay-<version>.tar.gz`, with that release's ebuild and its
Manifest (it appears some minutes after the release). Replace the overlay's directory with it to install or update:

```sh
sudo rm -rf /var/db/repos/beelot && sudo mkdir -p /var/db/repos/beelot
curl -fsSL https://github.com/mederel/beelot/releases/download/v<version>/beelot-gentoo-overlay-<version>.tar.gz \
  | sudo tar -xz -C /var/db/repos/beelot
printf '[beelot]\nlocation = /var/db/repos/beelot\n' | sudo tee /etc/portage/repos.conf/beelot.conf
echo 'games-board/beelot ~amd64' | sudo tee /etc/portage/package.accept_keywords/beelot
sudo emerge --ask games-board/beelot
sudo rc-update add beelot default && sudo rc-service beelot start   # or: systemctl enable --now beelot (steps 1 and 2 above first)
```

To build the overlay yourself, from a checkout of the release's tag (`python3`, `cargo` with network access, and `ebuild`
for the Manifest), run `sudo .github/scripts/prepare-ebuild.sh <version> /var/db/repos/beelot`.

CI runs `pkgcheck scan` on the overlay and, in a `gentoo/stage3` container with `dev-lang/rust-bin`, compiles the server,
installs the image, merges it and removes it again. It is a separate job that runs only when `packaging/gentoo/`, its
scripts or `Cargo.lock` change, because compiling there takes long. Publishing the package to GURU or `::gentoo` is left to
a maintainer: commit the generated `games-board/beelot/beelot-<version>.ebuild` and its `Manifest` there.

The root of the Pages site is a presentation page, written once in `pages/` (`index.html`, `site.css`,
`site.js`) and copied by `build-apt-repo.sh` with the newest release number. Set the repository variable
`BEELOT_PLAY_URL` (no trailing slash) to the address of a hosted game to add the page's links to it.

## Back up and restore

All of Beelot's state is in its MariaDB database, so a backup is a dump of it (US-153). `packaging/backup/beelot-backup`
does both directions and the Debian package installs it as `/usr/bin/beelot-backup`:

```sh
sudo beelot-backup                                   # dump: writes /var/backups/beelot/beelot-<UTC time>.sql.gz
sudo systemctl stop beelot                           # restore: stop the server first
sudo beelot-backup restore /var/backups/beelot/beelot-20261114T030000Z.sql.gz
sudo systemctl start beelot
```

It reads the database from `BEELOT_DATABASE_URL`, `BEELOT_DATABASE_USERNAME` and `BEELOT_DATABASE_PASSWORD` in
`/etc/beelot/beelot.env` (a variable in the environment wins; the password is never on a command line). A restore
replaces the tables of the dump in the database of those settings, which must exist: create it as in the install steps.
The server migrates the schema at startup, so a dump from an older release restores into a newer one.

**It runs daily when you ask it to.** The package installs `beelot-backup.service` and `beelot-backup.timer` but does not
enable them:

```sh
sudo systemctl enable --now beelot-backup.timer      # every day, with a random delay of up to 30 minutes
systemctl list-timers beelot-backup.timer            # when it runs next
```

Without systemd, run the same script from cron, for example `17 3 * * * root /usr/bin/beelot-backup` in
`/etc/cron.d/beelot-backup`.

Settings of the script, in `/etc/beelot/beelot.env` (the server ignores them):

| Variable                          | Default               | What it does                                                       |
|-----------------------------------|-----------------------|--------------------------------------------------------------------|
| `BEELOT_BACKUP_DIR`               | `/var/backups/beelot` | where the dumps are written                                        |
| `BEELOT_BACKUP_KEEP`              | `7`                   | how many of the newest dumps stay; older ones are removed          |
| `BEELOT_BACKUP_CLIENT_OPTIONS`    | none                  | extra options for the MariaDB client, such as `--ssl-ca=/path.pem` |

A daily dump kept `BEELOT_BACKUP_KEEP` times lives that many days: set it together with `BEELOT_BACKUP_RETENTION_DAYS`,
the figure the privacy policy states. A dump that fails writes no file and removes no copy.

**A backup holds personal data** (pseudonyms, matches, friendships, security events). The dump gets the owner and mode of the
settings file, `root:beelot` and `0640`, and its directory `0750`. **Encrypt it before it leaves the machine**, for example
`gpg --symmetric --cipher-algo AES256 beelot-<time>.sql.gz` or `age -p -o beelot.sql.gz.age beelot-<time>.sql.gz`; Beelot
does not encrypt it for you, and does not copy it off the machine. Purging the package keeps `/var/backups/beelot`.

The other packages do not ship the script. Take it from the repository (`packaging/backup/beelot-backup`, which needs
`mariadb-dump` and `mariadb`, or `mysqldump` and `mysql`) and point `BEELOT_SETTINGS_FILE` at your settings file. With the
[container image](#container-image), dump the database container instead:
`docker compose exec -T mariadb sh -c 'mariadb-dump -ubeelot -p"$MARIADB_PASSWORD" --single-transaction beelot' | gzip > beelot.sql.gz`
(run it in `packaging/container`; restore with `gunzip -c beelot.sql.gz | docker compose exec -T mariadb sh -c 'mariadb -ubeelot -p"$MARIADB_PASSWORD" beelot'`).

CI tries the procedure on every pull request: it dumps a database holding a played match, restores the dump into a fresh
one and reads the match back (`.github/scripts/test-backup.sh`).

## Android app

`android/` is Beelot as a Trusted Web Activity: the live website full screen, with no address bar, on the website's
own origin (Android 8.0, API 26, or later). Build it with Java 17, Gradle and the Android SDK:

```sh
android/build.sh            # the debug app: android/app/build/outputs/apk/debug/
android/build.sh assembleDebug -PbeeloHost=example.org -PbeeloApplicationId=org.example.app
```

The website must vouch for the app, or the browser shows an address bar. Print the SHA-256 fingerprint of the
certificate the app is signed with (`keytool -list -v -keystore <keystore>`, or the app signing key in the Play
Console) and give it to the server in `BEELOT_ANDROID_CERT_SHA256`; `/.well-known/assetlinks.json` then names the
app, for the browser and for passkeys. The debug build is signed with a debug key, so add its fingerprint to try
it. No signing key or secret is in the repository.

### Publishing on Google Play

Every release of the server also builds the Android bundle (`android-release` job in `build.yml`) and attaches it to
the GitHub release as `beelot-<version>.aab`. Its `versionName` is the release version and its `versionCode` is
`major × 1,000,000 + minor × 1,000 + patch` (`.github/scripts/android-version.sh`), so it only grows. The store texts
(English, French, Dutch) are in `android/store/<locale>/`, in the layout fastlane and Play Console both read.

One-time setup (the details and the Play Console answers are in `docs/android/play-release.md`):

1. Create the upload key outside the repository, with `keytool -genkeypair -v -keystore upload.keystore -alias upload
   -keyalg RSA -keysize 2048 -validity 10000`, and keep it with its passwords in a password manager.
2. Add it as the repository secrets `ANDROID_UPLOAD_KEYSTORE_BASE64` (`base64 -w0 upload.keystore`),
   `ANDROID_UPLOAD_KEYSTORE_PASSWORD`, `ANDROID_UPLOAD_KEY_ALIAS` and `ANDROID_UPLOAD_KEY_PASSWORD`. Without them the
   bundle is built unsigned (`beelot-<version>-unsigned.aab`) and Play will refuse it.
3. In Play Console, create the app, accept Play App Signing, and copy the **App signing** SHA-256 fingerprint into
   `BEELOT_ANDROID_CERT_SHA256` on the server.

For each release: download the `.aab` from the GitHub release, upload it to the **Internal testing** track, install it
from the testers' link on a real device, check that it opens full screen and that a passkey sign-in works, then promote
it to Production. A personal developer account must first run a closed test with enough testers for the period Google
asks for.

## License

Beelot is free software under the [GNU Affero General Public License, version 3 or later](LICENSE) (AGPL-3.0-or-later).
You may run, study, change and share it. If you run a modified version for others over a network, the licence asks you
to offer them its source. Contributions are accepted under the same licence.

## Develop

```sh
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test --workspace
```

The server's database tests start a MariaDB container with Testcontainers, so
Docker must be running. Building the server needs OpenSSL's development files
(`libssl-dev` on Debian and Ubuntu), which `webauthn-rs` links against.

The snapshots the table API sends are pinned by the files in
`crates/beelot-server/tests/contract/`. After an intended change, rewrite them
with `UPDATE_CONTRACT=1 cargo test -p beelot-server --test api_contract` and
review the diff.

The frontend's pure scripts are tested with Node: `node --test crates/beelot-server/frontend-tests/*.cjs`.

The solo table (US-119) and its auction (US-120, a sheet over the table) have a new layout that fits one screen. Open
any page with `?table=legacy` to get the old solo table and bidding view back and `?table=new` to leave them; the choice
is remembered on the device. The flag also brings back the old online table (US-121: the lobby and the cards of private and public tables now share
the solo table). The flag goes with the old views in a later story.

CI measures the tests' coverage with
[cargo-llvm-cov](https://github.com/taiki-e/cargo-llvm-cov), shows it per crate
in the run summary and in a comment on the pull request, and keeps the
`lcov.info` report as the run's `coverage` artifact. To measure it locally:

```sh
cargo install cargo-llvm-cov
cargo llvm-cov --workspace --html --open
```

## Verify

Before a release, check in a browser, with the console open, that these work
without errors:

- a solo Classic game to the end of a round, and a solo Contrée game with a
  coinche;
- pass-and-play with two humans;
- a private table in two browsers: create it, join by code, choose seats, get
  ready, start, play a trick (both update without reloading) and send a
  reaction;
- quick-match in one browser: bots take the empty seats after 60 seconds;
- closing one browser at a private table: its seat shows a bot 2 minutes later;
- passkey sign-up, sign-out and sign-in, statistics after a finished match, the
  data export and the account deletion.

## Release build

```sh
cargo build --release
```

The server is `target/release/beelot-server`. It finds the frontend in the
crate's `static/` folder at the path it was built from; when the binary runs
elsewhere, copy `crates/beelot-server/static/` next to it and point
`BEELOT_STATIC_DIR` at the copy.

### Releases

Every push to `main` that changes more than documentation, and passes the
checks, publishes a release: a `vMAJOR.MINOR.PATCH` tag, a GitHub release and a
workflow artifact holding `beelot-<version>-linux-x86_64.tar.gz` (the server,
its `static/` folder and this README; run it with `BEELOT_STATIC_DIR=static`)
and `beelot_<version>_amd64.deb` (see
[Install from the apt repository](#install-from-the-apt-repository)).
The first release is `v1.0.0`. After that, the version goes up by a minor when
a commit since the previous tag is a feature (its subject starts with `feat:` or
`feat(scope):`), by a major when one is breaking (a `!` before the colon, as in
`feat!:` or `fix(deps)!:`), and by a patch otherwise. Renovate follows it: a major
update of a dependency is a breaking commit, a minor update a `feat`, a patch update a `fix`.
`.github/scripts/next-version.sh` computes it.

### Publishing the apt repository

Each release also builds `beelot_<version>_amd64.deb` and `beelot_<version>_arm64.deb` (the arm64 ones come from a second job on an arm64 runner and join the release a few minutes later), attaches them to the GitHub
release and rebuilds the signed apt repository from every release's package,
deployed to GitHub Pages. The same job builds the dnf repository (`rpm/`) from the releases' RPMs and signs its index with
the same key, so the setup below covers both. This needs a one-time setup:

1. Generate a signing key without an expiry that you keep, with a passphrase, in a
   real terminal (gpg asks for the passphrase through a prompt that needs one):

   ```sh
   export GPG_TTY=$(tty)
   gpg --quick-generate-key 'Beelot apt repository <you@example.org>' rsa3072 sign never
   ```

   If it fails with `agent_genkey failed: End of file` (no terminal, for example in
   an editor's console), have gpg read the passphrase from standard input instead:

   ```sh
   read -rs -p 'Passphrase: ' P; echo
   printf %s "$P" | gpg --batch --pinentry-mode loopback --passphrase-fd 0 \
     --quick-generate-key 'Beelot apt repository <you@example.org>' rsa3072 sign never
   unset P
   ```

   The key's user id is published in `beelot.asc`, so use an address you are happy
   to make public.
2. Add it as repository secrets (Settings, Secrets and variables, Actions):
   `APT_GPG_PRIVATE_KEY`, the output of `gpg --armor --export-secret-keys <key id>`,
   and `APT_GPG_PASSPHRASE`.
3. Set Pages' source to "GitHub Actions" (Settings, Pages).

Without the secrets the `apt-repo` job is skipped with a warning naming the missing
secret; the release still holds the tarball and the `.deb`. To rotate the key, make a new one,
replace the two secrets and publish a release: users then fetch the new
`beelot.asc` again. The workflow's `package` job builds and checks the package and
the repository script on every pull request without any secret.

## Bot arena

The arena plays two bots against each other on seeded duplicate deals: every
deal is played twice with the same cards, once with each bot as North–South,
and the report gives the point difference per deal with its 95% confidence
interval, the matches won, contract and coinche success (and the tout-atout and
sans-atout contracts on their own), and decision times.

```sh
cargo run --release -p beelot-arena -- --first current --second random
```

| Option            | Values                                   | Default                       |
| ----------------- | ---------------------------------------- | ----------------------------- |
| `--first`         | an arena bot                             | `current`                     |
| `--second`        | an arena bot                             | `random`                      |
| `--deals`         | duplicate deal pairs, at least 2         | `10000`                       |
| `--seed`          | the seed the deals are dealt from        | `1`                           |
| `--variant`       | `classic`, `contree` or `both`           | `both`                        |
| `--announcements` | `on` or `off`                            | `on`                          |
| `--all-trumps`    | Contrée tout-atout and sans-atout        | `on`                          |
| `--dealing`       | `shuffled` or `table` (see below)        | `shuffled`                    |
| `--report`        | the report file                          | `target/bot-arena/report.txt` |

Games deal like at a real table: only a match's first deal is shuffled, and
each later deal is cut from the previous deal's gathered tricks. The arena
shuffles every deal pair by default, so that bot strength is measured on
independent hands; `--dealing table` deals each pair from the previous pair's
gathered cards instead.

The arena bots are `current`, `challenging`, `baseline`, `previous-play`,
`previous-trumps`, `previous-all-trumps-play`, `no-coinche`,
`no-announcement-bidding`, `no-all-trumps-bidding` and `random`. The command
prints each variant's report and writes them to the report file.

The bots' tout-atout and sans-atout estimates were fitted on bot play by least
squares. To fit them again:

```sh
cargo run --release -p beelot-arena --bin fit-estimates -- --stage offence --deals 20000 --seed 1
```

`--stage offence` fits the taker's estimate and `--stage defence` the
defence's, which the coinche uses. The command prints each feature's weight
with its standard error and the fit's R²; the rounded weights go into
`crates/beelot-game/src/bot/rule_based.rs`.

## Solver benchmark

The double-dummy solver behind the Challenging bot has its own benchmark:

```sh
cargo bench -p beelot-game --bench solver
```
