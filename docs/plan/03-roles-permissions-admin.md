# 03 · Roles, Permissions & the Super User

## Two levels of "God rights"

The word "super user" covers two different people, and we keep them separate:

| Level | Who | Scope | Can |
|-------|-----|-------|-----|
| **Platform Admin** (vendor staff) | Us | All tenants | Create/suspend tenants, manage plans and billing, publish global templates, and (with the tenant's consent, time-boxed and audited) access a tenant for support. **Cannot** browse tenant data without that consent. |
| **Super User** (a.k.a. Tenant Owner) | The customer's lead administrator | Their tenant (their "version of CAFM") | **Everything inside their tenant**: configure every module, create and manage all users and roles, control branding, security, integrations, data and subscription. Cannot be locked out by other admins, and each tenant must always have at least one. |

A tenant can have several Super Users. Ownership transfer requires the current owner's confirmation and a re-authentication step.

## Permission model

A combination of **RBAC** (roles), **data scoping** (which records) and **field-level rules**.

```
Permission = Resource × Action × Scope (+ optional Conditions)
```

- **Resources:** every module entity (work_order, asset, location, ppm_schedule, certificate, purchase_order, invoice, booking, visitor, user, role, config…), plus admin areas (branding, security, billing, integrations, audit_log).
- **Actions:** `view`, `create`, `edit`, `delete`, `assign`, `approve`, `close`, `export`, `import`, `comment`, `view_costs`, `configure`, `impersonate`.
- **Scopes:** `own` (created by/assigned to me) → `team` → `location subtree` (e.g. "Wales region") → `client` / `contract` → `all`.
- **Conditions (ABAC)** `[P]`: e.g. "approve POs **≤ £5,000**", "edit work orders **while status ≠ Closed**", "view only requests in category Cleaning".
- **Field-level security:** hide or make fields read-only per role (e.g. costs, rates, access codes, bank details, personal data).
- **Effective permissions** = union of all the user's roles, then restricted by data scope. An admin screen shows "why can this user see this?" as an explanation trace.

Every check is enforced in the API (never only in the UI), and tenant isolation is additionally enforced by PostgreSQL row-level security (see [04-architecture](04-architecture.md)).

## Default roles (seeded per tenant, fully editable/clonable)

| Role | Licence type | Summary |
|------|--------------|---------|
| Super User | Full | All permissions incl. security, billing, roles |
| Administrator | Full | All config and user management, excluding billing and owner transfer |
| FM Manager | Full | All operational modules, approvals, reports, own region/sites |
| Helpdesk Operator | Full | Log/triage/assign requests and work orders, view assets/locations |
| Supervisor / Planner | Full | Schedule and dispatch, manage team, PPM planning |
| Technician | Mobile | Own assigned jobs, record time/parts/readings, raise defects |
| Contractor | Contractor (free) | Jobs assigned to their company, quotes, invoices, certificates; portal only |
| Requester / Occupant | Requester (free) | Log/track own requests, book rooms/desks, register visitors |
| Compliance / H&S Officer | Full | Compliance, audits, incidents, permits, risk |
| Finance | Full | Budgets, POs, invoices, approvals, cost views |
| Stores Clerk | Full | Inventory and goods receipt |
| Space Planner | Full | Space, floor plans, moves |
| Client Viewer | Client (free, FM-provider edition) | Read-only view of their contract's jobs, reports, quote approvals |
| Auditor (read-only) | Read-only (free, time-limited) | View compliance evidence, no edit |
| Executive | Full (view) | Dashboards and reports |

Licence types matter for pricing: see [07-monetisation](07-monetisation.md).

## Everything the Super User can do

### People & access
- Invite users by email; create users directly with temporary password; **bulk import** from CSV; sync from **SCIM/SSO** `[E]`.
- Assign roles (multiple per user), teams, data scopes, licence type, default site, language, time zone.
- Deactivate/reactivate users, reassign their open work, transfer record ownership.
- Force password reset, reset MFA, revoke sessions, view login history.
- **Impersonate / "view as"** another user to troubleshoot (audited, with visible banner; can be disabled by policy).
- Create and edit **roles** in a permission matrix UI; clone roles; compare roles.
- Create **teams/groups** (e.g. "North Region Electricians") used for assignment and scoping.
- Delegation and out-of-office rules for approvals.
- Manage contractor companies and their users; client organisations and their users (FM-provider edition).
- Time-limited guest/auditor access links.

### Shaping the system
- **Modules:** switch modules on/off (within plan), reorder and rename navigation, choose default landing page per role.
- **Terminology:** rename any label (e.g. "Work Order" → "Job", "Site" → "School").
- **Custom fields, picklists and forms** on every entity; field rules per role/status.
- **Statuses and workflows:** design state machines per entity/type; required fields per transition.
- **Automation rules and approvals:** no-code builder with test mode and run history.
- **SLA and priority setup:** priority matrices, targets, business-hours calendars, holidays, escalation chains.
- **Request catalogue:** categories, problem codes, triage scripts, routing rules.
- **Templates:** PPM task libraries, checklists/inspection forms, compliance types, job sheet and PDF layouts, email/SMS templates.
- **Numbering formats**, default values, units of measure, currencies, tax rates.
- **Dashboards:** set defaults per role; publish shared dashboards and reports.
- **Location hierarchy levels** and asset classification scheme.

### Brand & experience
- Logo, colours, favicon, login page message; requester portal look and feel.
- Custom domain (e.g. `fm.customer.co.uk`) and email sender domain (SPF/DKIM) `[E]`.
- Branded PDFs (job sheets, POs, reports); per-client branding (FM-provider edition).
- Portal announcements and banner messages.

### Security & governance
- Password policy, **MFA enforcement** (TOTP/WebAuthn passkeys), SSO configuration (SAML/OIDC) `[E]`, session timeout, IP allow-list `[E]`.
- **Audit log** viewer with filters and export; configuration change history with diff and **rollback** of config changes.
- Data retention and deletion policies (e.g. visitor data after 30 days); UK GDPR subject-access-request export and erasure tools.
- Approve or deny vendor support access requests.

### Data & integrations
- Import/export of any entity; full tenant data export (JSON/CSV archive).
- API keys and OAuth apps with scoped permissions; webhooks with delivery logs.
- Connect integrations (Microsoft 365, Google, Xero, Teams, Slack, SFG20, IoT…).
- **Sandbox** tenant and config promotion `[E]`; export/import config packages.

### Subscription (Phase 5)
- View plan, usage and seats; add/remove seats; buy add-ons; upgrade/downgrade; update payment method; download invoices; billing contacts.

## Security guardrails on admin power
- Sensitive actions (role changes, SSO changes, data export, owner transfer, API key creation) require **re-authentication** and are notified to all Super Users.
- Separation of duties option: e.g. a user cannot approve their own PO.
- Configuration changes are versioned and reversible.
- Rate-limited bulk destructive operations with confirmation and undo window (soft delete).
