# ADR-003: Choose the identity provider for email accounts

- Status: Superseded by ADR-004 (email links in Spring); never accepted
- Date: 2026-10-07
- Decision makers: Product and engineering

## Context

Today players sign in only with Google or GitHub (US-057). Spring Security's
OAuth2 client creates a server-side session, and the `account` table in
MariaDB stores the provider, the provider's user id and a display name. The
application stores no password and sends no email.

Phase 5 of the roadmap (US-075 to US-083) adds accounts created with an email
address and a password. These accounts need email confirmation, password
reset, an optional second factor, deletion and data export. The stories
follow the GDPR (RGPD), and they apply the authentication controls of PCI DSS
v4.0 requirement 8 as a baseline. Beelot processes no payment cards, so PCI
DSS does not formally apply. The controls that weigh most in this choice are:

- passwords of at least 12 characters, checked against breached passwords;
- a 30-minute lock after 10 failed attempts;
- a 15-minute inactivity timeout and a 30-day maximum session;
- email links that work once: confirmation valid 24 hours, reset valid 1 hour;
- no reuse of the last 4 passwords;
- an optional second factor with recovery codes;
- deletion, export, and 12 months of security events.

The project has no budget for paid plans yet, and traffic is low and
irregular. Three options were compared, with their free plans as of
2026-10-07:

1. **Local storage:** Spring Security with accounts in MariaDB.
2. **Supabase Auth, Free plan.**
3. **Zitadel Cloud, Free plan**, with self-hosting as a fallback.

## Options

### 1. Local storage (Spring Security + MariaDB)

Spring Security handles registration, sign-in and reset. Password hashes,
tokens and second-factor secrets live in MariaDB, and Spring sends the emails
through SMTP.

- Every criterion can be met exactly as written: Argon2id or bcrypt, the
  breached-password check, the lock with automatic unlock, password history,
  separate expiries for each kind of link, and recovery codes.
- No external service, no quota and no inactivity clause. Personal data stays
  in our database, so the GDPR analysis has one processor fewer.
- **We build and maintain every security-sensitive flow:** registration,
  confirmation, reset, email change, second factor, the lock and the sign-in
  pages. That is the largest amount of code of the three options, all of it
  security-critical, and all of it must be translated into French and Dutch.
- **A database leak exposes password hashes.** The liability and the security
  reviews are ours.
- Argon2id needs Bouncy Castle, which must be checked in the native image
  (US-031). bcrypt (cost of 12 or more) is the fallback.

### 2. Supabase Auth, Free plan

Supabase provides email and password accounts, confirmation, reset, email
change, authenticator-app codes and security notification emails. It runs on
its own PostgreSQL project.

- **The project is paused after 1 week of inactivity.** While paused, nobody
  can sign in. For a game with irregular traffic, this risk alone rules out
  the free plan for production.
- **No backups** on the free plan, community support only, and no uptime
  guarantee.
- Missing on the free plan: the breached-password check, the inactivity
  timeout and the maximum session (Pro), and the lock after failed attempts
  (Team, through the password verification hook).
- Missing on every plan: password history and recovery codes.
- One expiry setting covers every email link, so a 24-hour confirmation link
  and a 1-hour reset link can't coexist.
- Passwords are limited to 72 characters, because they are hashed with
  bcrypt.
- The OpenID Connect provider ("OAuth 2.1 Server") is in public beta. A
  stable integration means Spring calls the Auth API and so handles
  passwords. Spring then has to add the lock, the breached-password check and
  the session limits itself, and those are most of the hard parts of option 1.
- A data processing agreement is available on every plan, and specific EU
  regions exist. Supabase is a US company.

### 3. Zitadel Cloud, Free plan

Zitadel is an OpenID Connect provider with hosted pages for sign-in,
registration, email verification, password reset and the second factor.

- **Its pricing and its cloud service description mention no pausing of
  inactive free instances.** The Terms of Service must confirm this.
- The free plan includes "all security features":
  - password complexity rules;
  - a lock after failed password and one-time-code attempts;
  - a separate expiry for each kind of email link;
  - authenticator apps, email and SMS codes, and passkeys;
  - hiding whether an account exists (the "ignore unknown usernames" setting);
  - custom SMTP, and privacy and terms links on the registration page.
- **Spring never sees a password.** It signs players in through the standard
  OpenID Connect flow with Spring Security's OAuth2 client, as it already does
  for Google and GitHub. Google and GitHub can move behind Zitadel (the free
  plan allows 3 identity providers).
- Limits of the free plan:
  - **100 daily active users**. What happens above that is not documented.
    Pro costs US$100 per month.
  - no custom domain: the sign-in pages are served from `*.zitadel.cloud`;
  - no uptime guarantee.
- Missing:
  - **automatic unlock**: only an administrator can unlock an account (GitHub
    issue #6502);
  - a breached-password check;
  - password history;
  - mature recovery codes (an API exists, but users report problems).
- Zitadel is a Swiss company, with EU and Swiss data regions. Its data
  processing agreement allows US subprocessors.
- Zitadel stores every change as an event. We must check that deleting a user
  erases the personal data in earlier events, as GDPR article 17 requires.
- Zitadel is open source (AGPL-3.0). It can be self-hosted with PostgreSQL
  in Docker Compose if the free plan stops fitting. Because Spring only speaks
  OpenID Connect, the move is a configuration change.

## Comparison

| Criterion | Local storage | Supabase Free | Zitadel Free |
| --- | --- | --- | --- |
| Inactivity clause | None | **Paused after 1 week** | None found (to confirm) |
| Quota | None | 50,000 monthly users | **100 daily users** |
| Passwords handled by Spring | Yes | Yes | **No** |
| Lock after failed attempts | Build | ✗ (Team plan) | ✅, manual unlock |
| Breached-password check | Build | ✗ (Pro plan) | ✗ |
| Inactivity timeout and maximum session | Build (Spring session) | Build (Pro in Supabase) | Build (Spring session) |
| Separate link expiries | Build | ✗ | ✅ |
| Password history | Build | ✗ | ✗ |
| Second factor | Build | Authenticator app | Authenticator app, passkeys, email and SMS codes |
| Recovery codes | Build | ✗ | Immature |
| Hosted, translated sign-in pages | Build | Build | ✅ (French and Dutch to check) |
| Backups | Ours (MariaDB) | ✗ | Provider's |
| Uptime guarantee | Ours | ✗ | ✗ (Pro) |
| Code to write and secure | Most | Medium | Least |

## Decision

Proposed: **use Zitadel Cloud (Free plan, EU region) as the identity provider
for email accounts**, and plan to self-host Zitadel if the free plan stops
fitting.

- **The Zitadel user id is the only data that crosses into Beelot.** Spring
  asks for the `openid` scope only and never requests, stores, logs or
  displays a name or an email address; players appear under a random
  pseudonym (US-075). The user id is still pseudonymised personal data, so
  deletion and export (US-081, US-082) apply to it.
- Spring Security's OAuth2 client signs players in through Zitadel with
  OpenID Connect, and the server-side session of US-057 stays as it is.
  Google and GitHub move behind Zitadel as external identity providers.
- The `account` table keeps one row per player and refers to the Zitadel user
  id. Existing Google and GitHub accounts are linked during a migration, by
  matching provider and subject.
- Spring keeps the controls that belong to the application session: the
  15-minute inactivity timeout, the 30-day maximum, the last sign-in time, and
  the application's security events.
- A scheduled job in Spring uses Zitadel's API to:
  - unlock accounts 30 minutes after they were locked;
  - delete accounts left unconfirmed for 7 days;
  - warn accounts inactive for 3 years, then delete them.

Supabase's free plan is rejected for its weekly pausing, its lack of backups,
and its missing security controls. Local storage is rejected for now because
it makes the project responsible for every authentication flow and for
password hashes. It stays the fallback if no hosted provider fits.

Before acceptance, verify:

1. Zitadel's Terms of Service contain no suspension or deletion of inactive
   free instances, and state what happens above 100 daily active users.
2. Deleting a user erases their personal data from the event store, or the
   remaining data is acceptable under the GDPR.
3. The hosted sign-in pages and emails are available in French and Dutch.
4. Sign-up with an address that already has an account doesn't reveal that
   the account exists.
5. Zitadel Cloud's hosted login refuses to finish signing in with an
   unconfirmed email address, as the self-hosted login does with
   `EMAIL_VERIFICATION=true`.

Checked on 2026-10-07 with Zitadel v4.19.4 in Docker Compose: the login pages
exist in French and Dutch (part of check 3; emails not checked), and the
self-hosted login refuses unconfirmed addresses.

## Consequences

- The phase 5 stories change:
  - **US-075:** the breached-password check is dropped. It can come back
    through a Zitadel custom workflow if one can inspect the password;
  - **US-077:** the lock is set in Zitadel, and Spring unlocks after 30
    minutes;
  - **US-078:** the "not one of the last 4 passwords" criterion is dropped
    (NIST SP 800-63B doesn't require it);
  - **US-080:** recovery codes are replaced by enrolling a second factor
    (passkey or email code) until Zitadel's recovery codes are reliable;
  - the registration, confirmation, reset and second-factor pages are
    Zitadel's hosted pages, styled with its branding settings.
- The privacy policy (US-083) lists Zitadel and its subprocessors. A data
  processing agreement with Zitadel must be signed.
- The application never stores passwords, password hashes or second-factor
  secrets. The password-hash decision for phase 5 becomes unnecessary.
- New configuration through environment variables: the Zitadel issuer URL,
  client id and secret, and an API token for the scheduled job. Docker
  Compose may run a local Zitadel for development.
- Sign-in depends on an external service without an uptime guarantee. Guests
  can still play every mode while Zitadel is unavailable.
- Above 100 daily active users, the choice is between Zitadel Pro (US$100 per
  month) and self-hosting Zitadel. That decision will need a new ADR.

## Sources

- Supabase: [pricing](https://supabase.com/pricing),
  [password security](https://supabase.com/docs/guides/auth/password-security),
  [sessions](https://supabase.com/docs/guides/auth/sessions),
  [rate limits](https://supabase.com/docs/guides/auth/rate-limits),
  [auth hooks](https://supabase.com/docs/guides/auth/auth-hooks),
  [email link expiry](https://supabase.com/docs/guides/auth/auth-email-passwordless),
  [OAuth 2.1 server beta](https://supabase.com/changelog/38022-oauth-2-1-server-capabilities-for-supabase-auth),
  [GDPR](https://supabase.com/docs/guides/security/gdpr-compliance).
- Zitadel: [pricing](https://zitadel.com/pricing),
  [default settings](https://zitadel.com/docs/guides/manage/console/default-settings),
  [cloud service description](https://zitadel.com/docs/legal/service-description/cloud-service-description),
  [data processing agreement](https://zitadel.com/docs/legal/data-processing-agreement),
  [recovery codes discussion](https://questions.zitadel.com/m/1293859410367741974).
