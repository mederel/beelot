# Design: remove files that should not be in the repository (US-197)

## Goal

A clone holds sources only. Two kinds of leftovers were tracked: the compiled Python cache of the music script
(`tools/music/__pycache__/compose.cpython-314.pyc`) and four of the JetBrains project's files (`.idea/.gitignore`,
`beelot.iml`, `modules.xml`, `vcs.xml`).

## Decisions

- **`__pycache__/` and `*.pyc` are removed and ignored** in `.gitignore`.
- **`.idea/` is removed and ignored.** The four files are the editor's own project description (a module and a VCS mapping,
  no shared run configuration or code style), so they carry nothing the build or a reviewer needs, and each developer's IDE
  regenerates them. Keeping them would make every editor setup a diff. Recorded as the decision of the pull request.
- **A check in CI**, `.github/scripts/check-no-build-leftovers.sh`, lists `git ls-files` and fails for a path in a
  `__pycache__/` folder or ending in `.pyc` or `.pyo`. It runs first in the `check` job, so that it fails fast and with a
  message that names the files. A plain script rather than a Rust or Node test, because it needs nothing built.
- **Not covered:** `.idea/` is ignored but not checked in CI (the story asks for the Python leftovers only).

## Tests

`frontend-tests/repo-hygiene.test.cjs` (run in CI by `node --test`): the script passes for a scratch repository of sources and
fails for a tracked `__pycache__` folder, a `.pyc` at any depth; the repository itself passes; `git check-ignore` confirms the
cache and `.idea/` are ignored; the workflow runs the script. Before the change the repository itself failed the check.
