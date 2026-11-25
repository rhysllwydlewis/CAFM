# 06 · Login Page & Demo Environment

The sign-in page remains the entry point to the authenticated app. The public homepage introduces CAFM and includes an interactive sample work order. The wider marketing and onboarding plan remains in Phase 5.

## Routes

| Route | Phase | Purpose |
|-------|-------|---------|
| `/login` | 0 | Username/email + password sign-in, with demo credentials underneath (demo/dev only) |
| `/login/mfa` | 1 | Second-factor challenge (TOTP; passkeys later) |
| `/select-organisation` | 0 | Shown only when the account belongs to more than one tenant |
| `/logout` | 0 | Ends the session (POST, CSRF-protected) |
| `/forgot-password`, `/reset-password/:token` | 0 | Password reset by email (single-use token, 30-minute expiry) |
| `/accept-invite/:token` | 0 | New users set a password and accept terms |
| `/` | 0+ | Public marketing homepage with a sample workflow and a link to sign in. Demo environments also link to the demo account chooser. |
| `/app/...` | 0+ | The authenticated application |
| `/portal/...` | 1+ | Requester self-service portal (same login) |

## Login page layout

```
┌──────────────────────────────────────────┐
│               [ Logo ]                   │
│          Sign in to your account         │
│                                          │
│  Email or username                       │
│  [______________________________]        │
│  Password                         [show] │
│  [______________________________]        │
│  [ ] Keep me signed in   Forgot password?│
│                                          │
│  [            Sign in              ]     │
│                                          │
│  ── Demo accounts ─────────────────────  │
│  Click a role to fill in its details:    │
│  Office   [Super User] [FM Manager] …    │
│  Field    [Technician] [Contractor]      │
│  Others   [Requester] [Client] …         │
│                         Show all roles ▾ │
└──────────────────────────────────────────┘
```

### Behaviour
- Clicking a demo card **autofills** the username and password fields (it does not submit automatically, so the user sees what happened). A secondary "Sign in as …" button on each card fills and submits in one click.
- Each card shows role name, a one-line description ("Full control of the system"), username and password.
- Cards are grouped (Office / Field / External & others); the six most useful roles show by default, the rest under "Show all roles".
- The demo panel renders **only when `DEMO_MODE=true`** (dev, preview and demo environments). It must never render in production tenants. This is enforced server-side (the credentials are never sent to the browser otherwise) and covered by an automated test.
- Errors: generic "Email/username or password is incorrect" (no user enumeration); progressive delay and temporary lockout after repeated failures; rate limiting per IP and per account.
- "Keep me signed in" extends the session to 30 days (idle timeout still applies if the tenant enforces one); without it, the session ends when the browser closes or after 12 hours.
- After login: redirect to the originally requested page, else the user's role default landing page (dashboard, helpdesk queue, my jobs, or portal).
- Accessible: labelled inputs, visible focus, works with password managers (`autocomplete="username"` / `current-password`), keyboard-operable demo cards.
- Responsive down to 320px wide.

### Identity model (who logs in to what)
- A person has one **account** (global, identified by email) holding the password, MFA and sessions. An account has one or more **memberships**, one per tenant, which carry roles, licence type and settings. The password is checked against the account, so there is no ambiguity when the same email is used in two organisations.
- After password (and MFA) verification, if the account has several memberships, the user picks an organisation; they can switch later from the user menu. Custom domains/subdomains pre-select the tenant.
- **Username-only accounts** for staff without email (e.g. some operatives on shared devices): the Super User creates them with a tenant-scoped username. They sign in at the tenant's own login URL (`/t/{tenant}/login` or the custom domain), where the username field resolves inside that tenant only. Password reset for these accounts is done by an admin.
- When a tenant enforces SSO, its members (except designated break-glass Super Users) are redirected to the identity provider instead of entering a password.
- Tenant security policies (MFA required, password rules, session timeout) apply when the user enters that tenant; the strictest applicable policy wins.

### Security baseline (even for the "basic" login)
- Argon2id password hashing; minimum 12 characters, checked against a breached-password list (local list or k-anonymity API).
- Web: server-side sessions in httpOnly, Secure, SameSite=Lax cookies; CSRF tokens on state-changing requests; session ID rotated on login and privilege change. The API is served on the same site as the web app (via `/api` reverse proxy) so cookies stay first-party.
- Mobile/PWA offline and API clients: OAuth 2.0 (authorisation code + PKCE) access tokens with rotating refresh tokens, so an offline technician can sync when back online without signing in again (revocable from the admin console).
- Login audit events (success/failure, IP, user agent, method).
- Terms of service and privacy notice acceptance recorded at first sign-in (and on material change).
- MFA (TOTP) added in Phase 1, passkeys (WebAuthn) in Phase 2A, SSO in Phase 5.
- MFA recovery: one-time recovery codes issued at enrolment; a Super User can reset a user's MFA (audited). The MFA screen offers "use a passkey instead" and "use a recovery code".

## Demo tenant: "Demo Estates Ltd"

The demo tenant runs on **Enterprise with every add-on and the FM-provider edition enabled**, so every feature is visible. A second, smaller demo tenant on the **Starter** plan shows prospects what the entry tier looks like (locked features with upgrade prompts).

All demo accounts share the password **`CafmDemo!2026`** (demo environment only; seeded directly, so exempt from the breached-password check, but meets the 12-character rule).

| Demo persona | Username | Role | Lands on |
|-----------|----------|------|----------|
| Sam Sutton | `superuser@demo.example` | **Super User** (all rights) | Admin console + dashboard |
| Alex Rowe | `admin@demo.example` | Administrator | Admin console |
| Morgan Ellis | `manager@demo.example` | FM Manager | FM dashboard |
| Evie Shaw | `executive@demo.example` | Executive (read-only) | Executive dashboard |
| Hana Patel | `helpdesk@demo.example` | Helpdesk Operator | Helpdesk queue |
| Priya Shah | `planner@demo.example` | Supervisor / Planner | Dispatch board |
| Tom Price | `technician@demo.example` | Technician | My jobs (mobile layout) |
| Cara Lloyd | `contractor@demo.example` | Contractor (Sparks Electrical Ltd) | Contractor portal |
| Riley Morgan | `requester@demo.example` | Requester / Occupant | Self-service portal |
| Fiona Clarke | `finance@demo.example` | Finance | Approvals + budgets |
| Colin Baxter | `compliance@demo.example` | Compliance / H&S Officer | Compliance matrix |
| Sid Malik | `stores@demo.example` | Stores Clerk | Stock levels |
| Penny Jones | `space@demo.example` | Space Planner | Floor plans (from Phase 3) |
| Clara Wynne | `client@demo.example` | Client Viewer (FM-provider edition) | Client portal |
| Andy Fox | `auditor@demo.example` | Auditor (read-only) | Compliance evidence |
| Starter tenant | `starter@demo.example` | Super User of the Starter-plan tenant | Dashboard with upgrade prompts |

The same persona names are used throughout the screen mockups ([doc 12](12-screen-catalogue.md)) and the seed data, so demos, docs and tests tell one story. `demo.example` uses the `.example` top-level domain, which is reserved (RFC 2606) and can never be a real mailbox. It is replaced by the product's own demo domain once named.

### Seed data (realistic, UK-flavoured)
- **12 sites** across the UK (e.g. Cardiff HQ, Bristol Office, Manchester Warehouse, 3 schools, 2 retail units, a clinic, a data centre, a depot, a residential block), each with buildings, floors, rooms, and floor plans for at least two buildings.
- **~2,400 assets** (2,418 in the seed) across HVAC, electrical, plumbing, fire, lifts, security and catering, classified with Uniclass 2015 codes (with SFG20-style maintenance groupings), with warranties, meters and condition grades.
- **PPM schedules** for every statutory and key asset; 12 months of completed history; upcoming 52-week forecast.
- **~3,600 historical work orders** (12 months, ~300 a month) with a realistic mix of SLA hits and breaches, costs, photos and CSAT scores, so dashboards look real.
- **Open queue** of ~150 work orders and ~25 helpdesk requests in various statuses, some about to breach SLA.
- **Compliance register** with certificates, including some expiring soon, some expired, and remedial actions from an EICR.
- 42 suppliers, of which 8 core contractors have full accreditation, scorecard and job history (one with insurance about to expire, one suspended for expired insurance).
- Inventory in 2 stores + 3 vans; open POs; budgets with variances.
- 3 client contracts (FM-provider edition) with SLA scorecards.
- ~1,280 users: 84 full, 142 mobile, ~1,060 requesters/contractors/clients, plus the demo personas above.
- Bookings, visitors, energy, housing and other module data are added as each module ships.

### Demo operations and guard rails
Many prospects will be signed in as the same demo Super User at once, so the demo must stay usable:
- **Nightly reset** at 03:00 UK time (worker job) restores the seed snapshot and rolls dates forward so data always looks current. It also clears the demo personas' display choices (such as a collapsed side menu), which are saved on the account and would otherwise be shared by every visitor. A banner warns signed-in users 10 minutes before reset.
- Demo accounts cannot change their password, email, MFA or SSO settings, cannot delete the tenant, cannot create API keys or webhooks to external URLs, and cannot remove the demo users. Other configuration changes are allowed and are undone by the reset.
- **All outbound email and SMS from demo tenants is captured, never sent** (so invites and notifications can't be used to spam real addresses). Password reset is disabled in demo.
- Uploads in demo are limited (5 MB per file, images/PDF only) and purged at reset.
- **Personal demo** (Phase 5): a button that clones the demo tenant into a private, short-lived copy for one prospect, which removes the shared-state problem and doubles as a trial.
- The seed generator is deterministic (fixed random seed) and is also used for e2e tests and preview environments.
