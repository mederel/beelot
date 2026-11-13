# A container image (US-135)

- **Image:** `packaging/container/Dockerfile`, `debian:trixie-slim` (glibc 2.41, newer than the 2.39 of the build image, so
  the binary runs), `ca-certificates`, user `beelot` (uid 10001, no home, no shell), the binary and the frontend,
  `BEELOT_BIND=0.0.0.0:8080` and `BEELOT_STATIC_DIR`. It runs as `10001:10001`, has no volume and no `HEALTHCHECK` (the
  slim base has no `curl`; orchestrators use `/api/health` themselves). OCI labels carry the source, licence and version.
- **Built from the release binary, not from source:** `stage-container.sh BINARY STATIC DEST` puts the binary, the frontend
  and the Dockerfile in one directory, so the pull request job (`target/release`) and the release job (the release's own
  tarball, downloaded with `gh`) build the same way, and no action had to be added and pinned.
- **Test:** `test-container.sh IMAGE` starts MariaDB on a throwaway network, checks the image's user, that the server
  refuses to start without the privacy settings and names `BEELOT_PRIVACY_CONTROLLER`, then starts it with them and
  checks `/api/health`, the page, `/privacy-policy.json` and the process' uid. It runs on every pull request in the
  `package` job and before the push in the release flow.
- **Publishing:** a `container` job after `release` logs in to ghcr.io with the workflow token (`packages: write`), builds
  `ghcr.io/mederel/beelot:<version>` and `:latest`, runs the test and pushes. It is separate from `release`, so a registry
  problem cannot fail the GitHub release. The first push creates a private package; making it public is one manual step
  (documented).
- **Compose:** `packaging/container/compose.yaml` runs the image with MariaDB 12.3 (the same version as the development
  `compose.yaml`) behind a healthcheck, publishes `127.0.0.1:8080`, and uses `${VAR:?message}` so compose refuses to start
  with a missing required value. `.env.example` lists them.
- **Out of scope:** Kubernetes manifests, arm64 (US-137), a `HEALTHCHECK`.

## Not verified
Never built or run where it was written (no Docker, no network). Likely first-run issues: a shared library the binary needs
that the slim base lacks (the test would show `error while loading shared libraries`), MariaDB 12.3's `healthcheck.sh`, and
the refusal test's timing.
