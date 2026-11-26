# Design: share a private table with a link that has a rich preview (US-212)

Issue: [#505](https://github.com/mederel/beelot/issues/505). Source: `docs/improvement-ideas.md`, section 1 (viral loops).

## Problem

A private table is joined with six characters that a player copies, switches apps, pastes and retypes. The lobby's
"Share" button sends a sentence with the code. Nothing opens Beelot with the code already typed, and a pasted address
would show as a bare URL in WhatsApp or Messenger.

## Decision

An invite link, `{public url}/join/{CODE}`, that previews well and opens the join form with the code typed.

### The server answers the preview

Link crawlers (WhatsApp, Messenger, iMessage, Slack, Discord) read the first bytes of the page and run no script, so the
frontend cannot add the tags. `GET /join/{code}` answers `index.html` with these tags inserted before `</head>`:

| Tag | Value |
| --- | --- |
| `og:type`, `og:site_name` | `website`, `Beelot` |
| `og:title`, `og:description` | a sentence that invites to a belote table, in the language below |
| `og:url` | `{BEELOT_PUBLIC_URL}/join/{CODE}` |
| `og:image` (+ width, height, alt) | `{BEELOT_PUBLIC_URL}/og-image.png`, 1200×630 |
| `og:locale` | `fr_FR`, `en_US` or `nl_NL` |
| `twitter:card` | `summary_large_image` |
| `robots` | `noindex`: a table's link is not a page to search for |

- **Language**: the best match of `Accept-Language` among French, English and Dutch, else English (the matcher of the
  pseudonym generator, `auth::pseudonyms::language`). Crawlers send none, so they get English. The page's own `<title>`
  and `lang` are left as they are.
- **Privacy**: the server never looks the table up. The preview holds only the code that is already in the link, so it
  cannot tell a crawler (or anyone) whether a table exists, who sits at it or what it plays. The code is checked against
  the table-code alphabet and length (`tables::codes`) before it is written, so no other text reaches the page. A link
  that is not a code is answered with the plain page and no code tags: the frontend then shows the join form.
- **Same safeguards as the other pages**: the headers, the compression and the rate limit of the router apply. The tags
  are meta elements, which the content security policy does not restrict.
- **Cache**: `no-cache`, like the other pages. The page is read from the static folder per request (a small file, in the
  operating system's cache).

### The image

`web/public/og-image.png`, 1200×630, the brand mark on the dark background with the tagline; the build copies it to
`static/`. It is drawn once from `web/public/og-image.svg`'s equivalent HTML with the pre-installed Chromium and committed; a
test checks the file's size and PNG header, so a replaced image keeps the dimensions the tags announce.

### The page

- `/join/{code}` is a route of the Crew view (`routes.ts`, the same way as `/friends/add/{code}`). The Crew page puts the
  code in its boxes (normalised, as a paste is), focuses the name field and replaces the address with `/online/private`, so
  a reload or the back button does not retype it.
- The player still taps "Join table": joining is never automatic (it takes a seat under a name the player confirms).
- **Lobby**: the code row gets a "Copy link" button beside "Copy", and "Share" passes `{ text, url }` so a messenger shows
  the link, which previews. Both build the address with `inviteLinkUrl(origin, code)` in `models/small.ts`, next to
  `friendLinkUrl`.
- New texts: "Copy link" (fr, nl in `i18n`). "Copied" and the share sentence exist.

## Tests

- `tests/invite_preview.rs` (server): the tags and their values for a valid code; French and Dutch by `Accept-Language`;
  English by default; lowercase codes are normalised; an invalid code (too short, forbidden letters, markup) gets the plain
  page byte for byte; the image is served as `image/png`; no tag outside the allowed set carries input.
- `web/tests`: `routes` (`/join/ABC234` is the Crew view with the code), `inviteLinkUrl`, the image's dimensions, and the
  French and Dutch texts (the i18n completeness test already exists).
- `e2e`: the Crew screen with a prefilled code is added to the layout checks' screens.

## Out of scope

A preview that names the table; deep links into the Android app; a preview for friend links; a link for spectators.
