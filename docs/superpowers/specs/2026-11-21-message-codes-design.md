# Message codes instead of English sentences (US-170)

## Problem

The server sends English sentences ("Ben bids 90 Hearts.", "That seat is taken.") and the page translates them with the
English as the key: a dictionary entry per sentence, and regular expressions (`translateServer`, one list of patterns per
language) for the sentences that carry a name, a suit or a number. Rewording a sentence in Rust silently drops its French and
Dutch translation, and nothing fails. The page also reads some of these sentences as data: the kind of a call
(`/^coinche/`), the contract of a bid (`/^(\d+)\s+(.+)$/`), the declarer of a Belote (`startsWith("Ann declares")`).

## Design

### The wire

Every text the server sends gets a code and its parameters beside the English sentence, which stays for one release (a page
loaded before the deploy still reads it):

| Where | English (stays) | New |
| --- | --- | --- |
| error bodies (`AppError`), and the `error` event of the stream | `message` | `code`, `params` |
| the auction line | `bidding.message` | `bidding.messageCode` |
| a call (the seats, the auction, the `call` event of the stream) | `call` | `callCode` (absent for a seat that has not called) |
| the Belote announcement | `board.declarationMessage` | `board.declarationCode` (absent before one) |

`code` and `messageCode`/`callCode`/`declarationCode` are `{ "code": "auction-bid", "params": { "name": "Ben", "value": "90",
"trump": "HEARTS" } }` (for an error the two keys sit in the body). Parameters are strings: names as typed (the built-in seat is
`You`), values as digits, suits and contracts as the enum names the snapshot already uses (`HEARTS`, `ALL_TRUMPS`).

The `error` field of an error body keeps what it was: it says what failed (`settings-locked`, `owner-only`, `not-ready`,
`not-your-turn`), and the frontend and the rate limit act on it. Several texts share one such code, so the text has a code of
its own (`timer-locked`, `owner-sets-timer`, `not-your-turn-to-bid`).

### The server

`beelot_table::messages` is the only place that makes a text. `Message { code, params, english }` has private constructors:
the fixed texts are constants made by one macro (`fixed_messages!`, which also lists them), and the texts with parameters are
functions of the module (`auction_bid`, `call_bid`, `declared_belote`, ...). The English is written once, next to the code, so
the two cannot drift. `Refusal::Conflict`, `AppError::Conflict` and `AppError::Unauthorized` carry a `Message`; the texts that
only the routes send (sign-in, friends, the generic errors) are in the same module.

`messages::catalogue()` lists every code with samples of its parameters (every trump, two values, a name and `You`). A test of
the server writes it to `frontend-tests/fixtures/message-catalogue.json` (`UPDATE_MESSAGES=1`) and fails when the file is stale;
a test of the module fails when the source makes a code the catalogue does not list.

### The page

`i18n-messages.js` holds the three dictionaries keyed by code (English included): a sentence, or a function of the
parameters and of two helpers (`you(name)` for the verb forms of the built-in seat, `suit(word, capitalise)`). `i18n.js`
renders them with `renderMessage(code, params, language)` (pure) and `localized({ code, params }, english)`, which shows the
English that came with a code the page does not know. The patterns of `translateServer`, the Dutch patterns and the dictionary
entries of the sentences that have a code are removed; the entries the page itself uses (a name check, "Pass", "Coinche!")
stay.

The page stops reading English as data. A call is its `callCode`: `callKind` and `callKey` (`contract-badge.js`) tell what it
is and compare two, the contract badge, the sound, the bot's reaction to a coinche, the screen reader events and the call
bubbles read it. A Belote is its `declarationCode`: the celebration finds the seat by the name in the parameters. The
sentences the page used to compose for the translator to match ("Ben bids 90 Hearts.", "Ben is deciding.", "N cards") are
built with the same codes (`auction-bid`, `auction-deciding`, `cards-count`).

## What does not change

Every text a player reads in English, French and Dutch. `fixtures/message-texts-today.json` records what the page showed for
each English sentence before the change, taken from the old page, and a test compares each code, with each sample of its
parameters, in each language with it. Seven texts were never translated (the daily deal, the undo, the round that is not
finished, and "Forbidden"): their French and Dutch text is the English, as today, and translating them is left for a story of
its own.

The golden run's hashes (`tests/golden/*.txt`) are unchanged: the hashed snapshots leave the new fields out, which proves that
no English text and no other field changed. The contract files only gain fields.

## Tests

- Server: the catalogue is the file the page checks; the module makes no code the catalogue lacks; error bodies, the auction
  line, the calls and the Belote carry their codes; the spectator's view carries the new keys.
- Page (`message-codes.test.cjs`): each code of the catalogue renders in each language as it did; a code without a text in a
  language, and a text for a code the server never sends, fail; an unknown code shows the English; no pattern is left.
- The tests that fed the page English calls and declarations feed it codes.

## Out of scope

New languages, rewording any text, removing the English `message` (next release), and the page's own sentences, which stay
keyed by their English.
