# A multi-architecture container image (US-144)

## Design

- Each architecture builds its image from the server binary it already built, natively: nothing is cross-compiled or
  emulated. The `container` job (amd64) now pushes `ghcr.io/mederel/beelot:<version>-amd64`, and the `release-arm64` job
  of US-137 builds, tries (against MariaDB, as on amd64) and pushes `<version>-arm64` after it has attached the arm64
  packages, so an image failure loses none of them.
- A `container-manifest` job joins them with `docker buildx imagetools create` into `<version>` and `latest`. It runs when
  the amd64 image was pushed, and adds the arm64 one when its job succeeded, so a failed arm64 job never withholds
  the amd64 image; the next release repairs it. Pulling `<version>` or `latest` still works as before on amd64.
- In pull requests the `package` legs already build and run the container on both runners (the steps are not tied to
  one architecture), so both are tried before a release.
- The README names the architectures and the two per-architecture tags.

## Not verified here

The release jobs only run for a release on `main`; they were not run. Expect a fix after the first release.
