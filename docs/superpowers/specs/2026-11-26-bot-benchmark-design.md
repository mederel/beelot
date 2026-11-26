# Design: report how the bots play on every pull request (US-211)

Issue: <https://github.com/mederel/beelot/issues/503>. Source: `docs/improvement-ideas.md`, section 3, item 1 ("Measure first").

## Problem

A change to a bot is judged today by running `beelot-arena` by hand, if at all. Nothing on the pull request says whether the bot
got stronger or weaker, so a bot change is an anecdote and a regression can be merged unseen.

## Decision

A job `bots` of the `ci` workflow plays the bot of the pull request and the bot of `main` against the same fixed opponent on the
same seeded deals, and comments the difference on the pull request.

### What is measured

The arena (`pages/docs/arena.html`) already plays seeded duplicate deals and reports a point difference per deal with its 95%
confidence interval and the matches won with their Wilson interval. The job runs, for each of the two commits:

```
beelot-arena --first current --second baseline --deals 10000 --seed 1 --variant both
```

- `current` is the bot players meet; `baseline` is the reference bot that keeps the behaviour of an older release, so it is the
  fixed yardstick. The same seed gives the same deals, so the two runs are a paired comparison.
- Only the rule-based bots are played. The Challenging bot searches within a time budget, so its result depends on the machine's
  speed; it is out of scope.
- Both variants (Classic and Contrée) run, with announcements and all trumps on (the arena's defaults, as public tables play).
- A run takes seconds (500 deal pairs: 0.1 s), so 10,000 pairs per variant cost less than the build.

### Base and pull request

The job checks the pull request out, adds a `git worktree` of the base commit (`github.event.pull_request.base.sha`) and builds
`beelot-arena` in release mode in both, with `--locked`. When the base commit has no `baseline` bot or no such option, the
build or the run fails and so does the job: a change of the arena's own options is a change to the workflow too.

### The comment

`.github/scripts/arena-summary.mjs BASE_REPORT PR_REPORT` reads the two reports the arena wrote (the text of
`ArenaReport::format`, the format `arena.html` documents) and prints Markdown:

| Variant | | Point difference per deal | Matches to 1,000 won |
| --- | --- | --- | --- |
| Classic Belote | `main` | +26.10 ± 6.09 | 82.5% (66/80) |
| | this pull request | +27.00 ± 6.10 | 83.0% (66/80) |
| | change | +0.90 | +0.5 points |

and a verdict per variant, from the change of the point difference `d` and the noise `n = sqrt(m₁² + m₂²)` (the two margins of
error): **better** when `d > n`, **worse** when `d < −n`, otherwise **within the noise**. Adding the margins in quadrature is
conservative for a paired comparison (the two runs are correlated), so a verdict of better or worse is trustworthy and a
within-the-noise one only says that this sample cannot tell. The matches won are shown, not judged: there are few matches in
10,000 deal pairs and their interval is wide.

The comment is a sticky comment (header `bots`), like the coverage one: it is replaced on every push of the pull request, and not
posted for a pull request from a fork (a read-only token). The Markdown also goes to the job summary, and both reports and the
Markdown are uploaded as the artifact `bot-benchmark`.

### It reports, it does not gate

A weaker bot does not fail the job: a deliberate change may trade strength for something else (explainability, speed), and a
statistical test is wrong one time in twenty. The job fails only when an arena cannot be built or run or a report cannot be read
(the script exits 1 with the reason). The job is in the `ci` job's `needs` so that a broken benchmark cannot go unseen, and it
stops the pull request's run when it fails, like every check.

### When it runs

A new flag `bots` in `ci-changes.sh`: the files under `crates/beelot-game/` and `crates/beelot-arena/`, `Cargo.lock`,
`rust-toolchain.toml` (documentation excluded, as for every flag). A change to the workflows or their actions sets it, with the
others. The job's condition is `github.event_name == 'pull_request' && needs.changes.outputs.bots == 'true'`: on `main` there is
nothing to compare with, and a skipped job counts as passed. On a push the flag is `rust` as for the others, which is harmless
since the job does not run there.

## Tests

- `crates/beelot-server/frontend-tests/arena-summary.test.cjs`: the script on real reports: better, worse, within the noise, the
  change's sign and rounding, a variant missing from one report, a section without matches (`n/a (0/0)`), a malformed report
  (exit code 1 and a message).
- `ci-changes.test.cjs`: the flag for each kind of file, and the others unchanged.
- `ci-gate.test.cjs`: the job exists, is in the gate's `needs`, runs on pull requests only and on its flag, stops the run on failure.
- The job itself, on this pull request (it changes the workflow, so the flag is on).

## Out of scope

The Challenging bot; a threshold that fails the job; the history of the results across pull requests; benchmarks of the bidding
alone; the solver's timing (`cargo bench`, `benchmark.html`).
