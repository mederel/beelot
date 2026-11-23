# Plan: the account icon (US-200)

Design: `docs/superpowers/specs/2026-11-23-account-icon-design.md`.

1. **Spec and backlog.** Commit the design, this plan and the US-200 entry of `docs/product-backlog.md`.
2. **Test first.** `web/tests/components/account-button.test.ts`: guest pill and its click (opens the sign-in request and goes
   to `/settings`), signed-in name in the accessible label, nothing before the account loads. Run it and see it fail.
3. **Component.** `web/src/shell/AccountButton.svelte`: the guest pill and the signed-in round button, `style:` directives only
   (no inline `style=` attribute, as the content security policy requires).
4. **Mount.** Render it once in `web/src/App.svelte`, beside `Banners`, so it shows on every view.
5. **Text.** Add "Sign in" and "Signed in as {0}" to `fr.ts` and `nl.ts`, at the end, under a new section.
6. **Check.** `npm run check && npm run lint && npm test`; screenshot at 375×667 before and after with the static server.
7. **Build.** `npm run build`; commit the rebuilt `crates/beelot-server/static/`.
8. **Backlog.** Mark US-200 delivered in `docs/product-backlog.md`.
