# Design: an account icon that says whether the player is signed in (US-200)

## Problem

A player who has not signed in sees nothing at the top of the page that says so. Signing in lives on the Me tab, so a guest
does not know that an account exists or where to get one. A signed-in player sees no sign of it either.

## Decision

A round account button is fixed at the top right of every page, on phones and on the desktop, and it always says the account's
state:

- **Guest:** an outlined user icon with the word "Sign in" beside it, in a pill. The text is the clear marker: a bare icon
  reads as "profile" and does not say that the player is not signed in.
- **Signed in:** a filled user icon in a round button, with no text; its accessible name is "Signed in as {name}".

Activating it:

- **Guest:** opens the sign-in panel directly, with the same `signInRequest` path the match end's offer uses (US-115), on the
  Me tab (`/settings`).
- **Signed in:** opens the Me tab (`/settings`), where the account is.

## Where it sits

- `position: fixed`, `top: max(0.75rem, env(safe-area-inset-top))`, `right: 0.75rem`, above the page (`z-index` of the shell's
  navigation) and below the skip link.
- It is shown on every view, the table included: a guest playing a game must be able to see that they are not signed in.
- A view's own top-right controls are not moved. The button is kept small (2.5 rem high) so it covers little.
- The guest pill has a visible focus ring and a text label, so the icon is not the only sign of the state.

## Sign-in state

The button reads `account.loaded` and `account.signedIn` from the store (US-084). Until the account is loaded, it shows
nothing, so a guest never sees the pill flash for a signed-in player.

## Text

Every new string goes through `t()` with French and Dutch in `src/lib/i18n/fr.ts` and `nl.ts`:

- "Sign in" (guest pill and its accessible name)
- "Signed in as {0}" (accessible name of the signed-in button), with the name as a parameter.

## Out of scope

- No change to the sign-in itself, the Me tab or the account's data.
- No new route: the button opens existing views.

## Tests

- `tests/components/account-button.test.ts`: a guest sees the "Sign in" pill and activating it opens the sign-in panel
  (`signInRequest.open`) and navigates to `/settings`; a signed-in player sees the name in the accessible label and no pill;
  nothing is shown before the account has loaded.
- The i18n tests check the new keys in French and Dutch.
- The static build is regenerated and committed (`npm run build`).

## Screenshots

A before-and-after screenshot at 375×667 goes in the pull request, showing the guest pill at the top right.
