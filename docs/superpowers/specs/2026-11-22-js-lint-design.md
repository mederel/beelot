# Design: check the JavaScript in CI (US-196)

## What changed since the story was written

The story targets `crates/beelot-server/static` and `frontend-tests`. Since the Svelte redesign (US-198, ADR-007) `static/` is
the built, minified output, so linting it makes no sense, and the frontend's sources are TypeScript, JavaScript tests and
Svelte components in `crates/beelot-server/web/`. The check runs over those sources and over `frontend-tests/` (the `.cjs`
tests of the repository's scripts), which is what the story meant.

## Decision: Biome

One development dependency (`@biomejs/biome`, pinned) that formats and lints, with no plugin, no Prettier config and no
parser packages, and no build step; ESLint with Prettier and the TypeScript parser would bring a dozen packages and two
configurations. It checks the whole tree in about 50 ms.

- **Configuration:** `crates/beelot-server/biome.json`, above both `web/` and `frontend-tests/` because Biome cannot include files outside its own folder; `npm run lint` runs `biome check ..` from `web/`.
- **Covered:** `.ts`, `.js` and `.cjs` under `src/`, `tests/`, `build/`, `e2e/`, `frontend-tests/`, the root `*.ts` and `*.json`.
- **Not covered:** `.svelte` files (Biome's Svelte support is partial and would re-indent every `<script>`; `svelte-check`
  with `--fail-on-warnings` already checks them), `src/app.css` (Tailwind syntax), `package-lock.json` and the recorded
  `frontend-tests/fixtures/`.
- **Formatter:** the style the code already has (two spaces, double quotes, no trailing comma, quoted keys kept so that the
  dictionaries do not change), with a 180-column line (the code was written to about 140 to 180 columns, and 140 reflowed twice as many lines), which keeps the reformatting to
  about 1,500 lines. Biome's import sorting is off (it would only reorder lines).
- **Linter:** the recommended rules. Command: `npm run lint` (`biome check`, which also checks the format) in `web/`;
  `npm run format` fixes the format. It runs in the `check` job after the type check.

## The formatting is its own commit

The pull request has separate commits: the tool and its configuration; the formatting of the existing files (`biome format
--write`, nothing else; `npm run build` gives an identical `static/`); the few lint fixes (optional chains, a template
string, a `const`, unused test helpers removed, one constant condition), after which `static/` is rebuilt.

## Rules that need a rewrite, so are not switched on

| Rule | Findings | Why it is off |
| --- | --- | --- |
| `suspicious/noExplicitAny` | 190 | the API and snapshot types are `any` in many places; typing them is its own story |
| `style/noNonNullAssertion` | 88 | `!` after a lookup the code has just checked |
| `suspicious/useIterableCallbackReturn` | 17 | `forEach`/`map` callbacks written as expressions |
| `suspicious/noAssignInExpressions` | 8 | assignments in arrow bodies and conditions |
| `complexity/noCommaOperator` | 5 | comma expressions |
| `suspicious/noDocumentCookie` | 2 | the CSRF cookie read, which US-193 moves into one function |
| `complexity/noImportantStyles` | 5 | in `app.css`, not covered anyway |

## Tests

`frontend-tests/js-lint.test.cjs`: the configuration covers the sources and the repository tests and the version is pinned;
the `check` job runs `npm run lint` between the install and the build; AGENTS.md, the README and the develop page give the
command. The lint itself is the check: it fails the job when the code is not formatted or breaks a rule (the same command on the tree before the format commit
reported format differences in 61 files).
