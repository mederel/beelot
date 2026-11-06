# Security headers

## Decisions

Every response, API and static files alike, carries:

- `Content-Security-Policy`: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:;
  font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self';
  frame-ancestors 'none'`. `data:` images are there for the one inline SVG in the stylesheet. No
  `unsafe-inline`: the page has no inline script, style element or style attribute, and its scripts set styles
  through the CSSOM (`style.setProperty`), which the policy allows.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` (older browsers; `frame-ancestors` does the job in
  current ones) and `Permissions-Policy: camera=(), microphone=(), geolocation=()`.
- `Strict-Transport-Security: max-age=31536000`, only when `BEELOT_PUBLIC_URL` is `https://`, so a local HTTP
  setup is not locked out. No `includeSubDomains` or `preload`: the operator may share the domain.
- The four theme swatches used `style` attributes in `index.html`: they become CSS classes (`swatch-<theme>`).

## Guard rails

A frontend test fails if the page gains an inline script, style element, style attribute or event handler
attribute, or if a script writes markup or a style attribute. Server tests check the headers on pages, API,
errors and static files, and HSTS only over HTTPS.

## Out of scope

Subresource integrity (all scripts are same-origin), CSP reporting, and TLS settings, which belong to the proxy.
