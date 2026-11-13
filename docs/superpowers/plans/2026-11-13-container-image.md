# Plan: a container image (US-135)

1. Dockerfile, `stage-container.sh`, `test-container.sh`.
2. `build.yml`: build and test the image on every pull request; a `container` job publishes it after a release.
3. `compose.yaml` and `.env.example`; README section; spec; backlog note.
4. Pull request (`feat:`), auto-merge, fix what the first CI run finds.
