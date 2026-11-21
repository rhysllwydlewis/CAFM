# 06 · Login Page & Demo Environment

The first screen we build. A deliberately simple login page now; the marketing homepage is bolted on in front of it later (Phase 5) without changing the app.

## Routes

| Route | Phase | Purpose |
|-------|-------|---------|
| `/login` | 0 | Username + password sign-in, with demo credentials underneath (demo/dev only) |
| `/forgot-password`, `/reset-password/:token` | 0 | Password reset by email |
| `/` | 0 → 5 | Phase 0–4: redirects to `/login` or the dashboard. Phase 5: marketing homepage |
| `/app/...` | 0+ | The authenticated application |
| `/portal/...` | 1+ | Requester self-service portal (same login) |
| `/accept-invite/:token` | 0 | New users set a password |

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
│  [ ] Remember me     Forgot password?    │
│                                          │
│  [            Sign in              ]     │
│                                          │
│  ── Demo accounts ─────────────────────  │
│  Click a role to fill in its details:    │
│  ┌────────────┐ ┌────────────┐           │
│  │ Super User │ │ FM Manager │  …        │
│  │ superuser@ │ │ manager@   │           │
│  │ Demo123!   │ │ Demo123!   │           │
│  └────────────┘ └────────────┘           │
└──────────────────────────────────────────┘
```

### Behaviour
- Clicking a demo card **autofills** the email and password fields (it does not submit automatically, so the user sees what happened). A secondary "Sign in as …" button on each card fills and submits in one click.
- Each card shows role name, one-line description ("Full control of the system"), email and password.
- The demo panel renders **only when `DEMO_MODE=true`** (dev, preview and demo environments). It must never render in production tenants. This is enforced server-side and covered by an automated test.
- Errors: generic "Email or password is incorrect" (no user enumeration); lockout/backoff after repeated failures; rate limiting per IP and per account.
- After login: redirect to the user's role default landing page (dashboard, helpdesk queue, my jobs, or portal).
- Accessible: labelled inputs, visible focus, works with password managers (`autocomplete="username"` / `current-password`), keyboard-operable demo cards.
- Responsive down to 320px wide.

### Security baseline (even for the "basic" login)
- Argon2id password hashing; minimum 10 characters, checked against breached-password list (k-anonymity API or local list).
- Server-side sessions in httpOnly, Secure, SameSite=Lax cookies; CSRF tokens on state-changing requests; session rotation on login.
- Login audit events (success/failure, IP, user agent).
- MFA (TOTP/passkeys) added in Phase 1; SSO in Phase 5.
- Multi-tenant login: email is unique per tenant. If an email exists in several tenants, show a tenant picker after password verification. Custom domains pre-select the tenant.

## Demo tenant: "Demo Estates Ltd"

All demo accounts share the password **`Demo123!`** (demo environment only).

| Demo user | Email | Role | Lands on |
|-----------|-------|------|----------|
| Sam Super | `superuser@demo.cafm` | **Super User** (all rights) | Admin console + dashboard |
| Morgan Manager | `manager@demo.cafm` | FM Manager | Executive/FM dashboard |
| Hana Helpdesk | `helpdesk@demo.cafm` | Helpdesk Operator | Helpdesk queue |
| Priya Planner | `planner@demo.cafm` | Supervisor / Planner | Dispatch board |
| Tom Technician | `technician@demo.cafm` | Technician | My jobs (mobile layout) |
| Cara Contractor | `contractor@demo.cafm` | Contractor (Sparks Electrical Ltd) | Contractor portal |
| Riley Requester | `requester@demo.cafm` | Requester / Occupant | Self-service portal |
| Fiona Finance | `finance@demo.cafm` | Finance | Approvals + budgets |
| Colin Compliance | `compliance@demo.cafm` | Compliance / H&S Officer | Compliance matrix |
| Clara Client | `client@demo.cafm` | Client Viewer (FM-provider edition) | Client portal |

(The domain `demo.cafm` is a placeholder and is replaced when the product is named. It is never a real mailbox.)

### Seed data (realistic, UK-flavoured)
- **12 sites** across the UK (e.g. Cardiff HQ, Bristol Office, Manchester Warehouse, 3 schools, 2 retail units, a clinic, a data centre, a depot, a residential block), each with buildings, floors, rooms and two floor plans.
- **~1,500 assets** across HVAC, electrical, plumbing, fire, lifts, security and catering, classified with Uniclass/SFG20-style codes, with warranties, meters and condition grades.
- **PPM schedules** for every statutory and key asset; 12 months of completed history; upcoming 52-week forecast.
- **~3,000 historical work orders** with a realistic mix of SLA hits and breaches, costs, photos and CSAT scores, so dashboards look real.
- **Open queue** of ~60 requests/jobs in various statuses, some about to breach SLA.
- **Compliance register** with certificates, including some expiring soon, some expired, and remedial actions from an EICR.
- 8 contractors with accreditations (one with expired insurance, to demonstrate auto-suspension).
- Inventory in 2 stores + 3 vans; open POs; budgets with variances.
- Bookings, visitors and energy data once those modules ship.

### Demo operations
- **Nightly reset** (worker job) restores the demo tenant to the seed snapshot and rolls dates forward so data always looks current.
- Optional "personal demo": a button that clones the demo tenant for a prospect (Phase 5, ties into trial sign-up).
- Outbound email/SMS from the demo tenant is captured, not sent (sandboxed), except password resets disabled entirely in demo.
- The seed generator is deterministic (fixed random seed) and is also used for e2e tests and preview environments.
