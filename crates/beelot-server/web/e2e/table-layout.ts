// What the layout checks (layout.ts) accept on a table, each exemption with its reason (US-201), shared by the tests that look at
// a table: the key screens and the live auction.
import type { Exemption } from "./layout";

// The exemptions the table needs, each with its reason (US-201). The table fills the screen and does not scroll: nothing of it
// may lie below the fold.
export const TABLE_EXEMPTIONS: Exemption[] = [
  {
    selector: "section.auction button",
    invariant: "touch",
    reason:
      "the auction panel's choices shrink with the screen so that the player's hand stays in view (auction-layout, #253): they are 38 to 43 px tall, at least 120 px wide and 0.4 rem apart"
  },
  {
    selector: ".icon-button.hint, a.account",
    invariant: "overlap",
    below: 600,
    reason:
      "KNOWN FAULT, needs a design decision: US-200 fixes the account button at the top right of the table, where the header's hint button is, and a phone in portrait has no room for both; the hint is also in the table menu. Remove this exemption when the header leaves room for the account button"
  }
];
export const TABLE = { pageScrolls: false, exemptions: TABLE_EXEMPTIONS };
