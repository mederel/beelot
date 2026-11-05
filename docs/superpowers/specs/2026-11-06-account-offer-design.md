# Offer an account when it is worth it (US-115)

## Decisions

- **Where**: only on the end-of-match screen (US-093), for a guest, when a match ends live. Never during a game,
  never on coming back to a finished match, never for a signed-in player.
- **What**: a short card above the actions: "Keep this result: create an account with a passkey." with a
  "Create an account" button and a "Not now" text button.
- **Create an account** closes the screen, goes to the home page, opens the sign-in panel and shows the existing
  passkey warning. The passkey flow, its warning and the privacy link are unchanged.
- **Frequency**: kept on the device (`beelot.account-offer`: `{ matches, dismissedAt }`). The first finished match
  is offered. "Not now" hides the card and it comes back after 3 more finished matches. Each finished match is
  counted once (by game and final score). Blocked storage: the offer shows on every match end.
- **Home**: the existing "Sign in to keep track of your matches." line stays as it is; it is not the main prompt
  (Play now is).
- Texts in French and Dutch (native review pending).
