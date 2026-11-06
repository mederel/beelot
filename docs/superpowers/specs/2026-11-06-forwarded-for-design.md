# Rate limits behind a proxy: trust the rightmost address

## Problem

With `BEELOT_TRUST_FORWARDED_HEADERS=true` the rate limiter keyed clients by the **leftmost** valid address of
`X-Forwarded-For`. A proxy such as nginx (`$proxy_add_x_forwarded_for`) appends to what the client sent, so the
leftmost entry is client-controlled: a client sending a new fake address on each request is never limited. That
removes the brake on guessing 6-character invitation codes and on passkey ceremonies.

## Decision

Use the **rightmost** valid address: the one the single trusted proxy appended. Entries before it are ignored.
Invalid entries are skipped. With no valid entry, or when the header is not trusted, the peer address is used.
The README states that exactly one proxy must be in front and shows the nginx header.

## Out of scope

Chains of several trusted proxies (a count of trusted hops would be needed).
