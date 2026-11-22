# ADR-007: A built frontend in Svelte, TypeScript and Tailwind, committed as files

- Status: Proposed
- Date: 2026-11-22
- Decision makers: Product and engineering
- Amends: ADR-001 (the frontend gains a build step; the server and the packages do not change)

## Context

The frontend is 12,500 lines of hand-written JavaScript modules (US-171) and 2,600 lines of CSS, with no build step. Every
screen is built by imperative DOM code (`document.querySelector`, `replaceChildren`, class toggles), and one renderer draws
the table from snapshots with timers and flags shared between `app-*.js` files that import each other in a cycle. The
frontend tests (90 files) mostly read the source as text and match regular expressions against ids and CSS rules, so they
pin the markup rather than the behaviour.

The product owner asked for a complete redesign of the look, the motion and the sound (US-198), keeping every feature, and
asked whether a framework (TypeScript, a CSS framework, other) would help. A redesign touches every screen; doing it in the
imperative style would mean rewriting the 5,000 lines of `app-*.js` anyway, with nothing to keep the state and the DOM in step.

Constraints that any choice must keep:

- **The content security policy** (`app.rs`): `script-src 'self'; style-src 'self'`, no inline script or style.
- **The packages build offline from the repository.** The Debian, RPM, Arch, Gentoo and container builds copy
  `crates/beelot-server/static/` as it is. The Gentoo ebuild builds in a network sandbox; none of them has Node.
- **The Android app is a Trusted Web Activity** of the site, and the site works offline for the rules (service worker).
- **Phones first**: the page must load and run well on a mid-range Android phone.

## Decision

1. **Svelte 5 with TypeScript (strict)**, built with **Vite**, styled with **Tailwind CSS 4** and component-scoped CSS,
   tested with **Vitest**. Icons come from **Lucide** (`@lucide/svelte`, inline SVG) and the fonts from **Fontsource**
   packages (SIL Open Font License), served from the site.
2. **The sources live in `crates/beelot-server/web/`** and the build writes `crates/beelot-server/static/`, which it empties
   first. Files that are copied as they are (the privacy policy, the music, the icons, the manifest) live in `web/public/`.
3. **The build output is committed.** Nothing else in the repository changes: the server serves `static/`, the packages copy
   it, the Rust tests read it. The output has fixed names (`app.js`, `app.css`, `chunks/*.js`, `assets/*`), not hashed ones:
   the server already asks browsers to revalidate every file (`Cache-Control: no-cache`), and fixed names keep the diffs and
   the service worker simple.
4. **CI checks that the output matches the sources**: the `check` job runs `npm ci`, the type check, the tests and the build,
   then fails if `git status --porcelain crates/beelot-server/static` is not empty, printing the difference. Whoever changes
   `web/` commits the rebuilt `static/` with it, like `Cargo.lock`.
5. **CSP-safe by construction**: no `{@html}`, no `style="…"` attribute in templates (Svelte's `style:` directives set
   properties through the CSSOM, which the policy allows), CSS extracted to files, transitions through the Web Animations
   API. A test checks the built `index.html` for inline scripts and styles, and the browser check runs with the server's
   real policy and fails on a violation report.

## Considered options

### Keep plain modules, rewrite the screens by hand

No toolchain, nothing to install. But the redesign rewrites every screen, and the imperative style is what made the table
renderer hard to change: animations, timers and the DOM are kept in step by hand, across files that share mutable state.
TypeScript would also be out, and the tests would stay tied to markup.

### React (with Motion)

The largest ecosystem. It ships a runtime of about 45 kB gzipped before any app code, and animation libraries for it add
more; on a phone that is load time spent before the first card. Svelte compiles components to direct DOM updates, ships a
few kilobytes of runtime, and has transitions, FLIP animations and springs built in, which a card game uses everywhere.

### Vue, Solid, Lit

Vue is close to Svelte but heavier and its animation story is less complete; Solid is fast but has a smaller ecosystem;
Lit's web components add a shadow DOM that a single-page game does not need. Svelte 5's runes give the same fine-grained
reactivity as Solid with a larger community and first-class TypeScript.

### Build in CI and in each package instead of committing the output

Keeps generated files out of Git, but every package build would need Node and the network: the Gentoo ebuild cannot fetch
npm packages in its sandbox, and the Arch, RPM and container builds would each grow a Node step. Committing the output keeps
the packages exactly as they are; the CI check stops a stale build from being merged.

### A component library (Skeleton, shadcn-svelte, bits-ui)

The game needs custom components (cards, seats, the table, the auction) more than generic ones, and native `<dialog>`,
radio groups and buttons already give accessible sheets and choices. A library would add weight and a look to fight.

## Consequences

- Contributors need Node 22 or later and `npm` to change the frontend; the server and its tests still need only Rust.
- `static/` becomes generated: it is edited only through `web/`. The Rust tests that read `static/` keep working.
- The frontend tests move to Vitest in `web/` and test behaviour (models, components); the repository tests that are not
  about the page (`site`, `android-store`, `ci-gate`, …) stay in `frontend-tests/` and still run with `node --test`.
- Renovate (or a person) updates `web/package-lock.json` like `Cargo.lock`.

## Revisit when

- A package or distribution needs to build the frontend from source.
- The committed output becomes a source of merge conflicts often enough to matter.
