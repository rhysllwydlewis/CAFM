# 09 · Quality, Security & Compliance

## Non-functional requirements

| Area | Target |
|------|--------|
| Availability | 99.9% monthly (Enterprise SLA); status page |
| API latency | p95 < 300 ms for reads, < 500 ms for writes, at target load |
| Page load | First load < 2.5 s (LCP) on 4G; in-app navigation < 500 ms |
| Mobile offline | Full day of work offline; sync of 100 queued actions < 30 s |
| Scale (design target) | 5,000 tenants; largest tenant 2,000 full users, 50k mobile/requester users, 500k assets, 10M work orders, 1B telemetry points |
| Backups | Continuous PITR (7–35 days), daily snapshots retained 35 days, encrypted, restore tested quarterly |
| RPO / RTO | ≤ 15 min / ≤ 4 h |
| Accessibility | WCAG 2.2 AA |
| Browsers | Last 2 versions of Chrome, Edge, Safari, Firefox; iOS 16+, Android 10+ |
| Localisation | en-GB default; i18n framework from day one; Welsh (cy) and EU languages later |

## Security

### Application
- Follow **OWASP ASVS Level 2**; OWASP Top 10 covered by design and tests.
- AuthN: Argon2id, MFA (TOTP + WebAuthn/passkeys), SSO, session rotation, idle and absolute timeouts, device/session management.
- AuthZ: deny-by-default permission guards on every endpoint; **automated cross-tenant access tests** for every resource; field-level filtering in serializers.
- Postgres **RLS** as defence in depth; separate DB roles for app, migrations, platform admin, read-replica reporting.
- Input validation with shared Zod schemas; output encoding; strict CSP; secure headers; CSRF protection.
- File uploads: type/size limits, AV scanning, served from separate domain, presigned short-lived URLs.
- Secrets in a secrets manager; tenant integration credentials envelope-encrypted.
- Rate limiting and abuse detection (login, API, public forms).
- Webhooks signed (HMAC); SSRF protections on outbound calls.
- Dependency scanning (Dependabot/Renovate), SAST (CodeQL), secret scanning, container image scanning.
- Annual third-party penetration test (CREST-accredited), plus a test before first enterprise go-live.

### Data protection (UK GDPR / EU GDPR)
- We are **processor**; customer is controller. Standard DPA, sub-processor list, UK/EU hosting.
- Data minimisation; retention policies configurable per data type; automatic purge jobs.
- DSAR export and erasure tooling for Super Users.
- Encryption in transit (TLS 1.2+) and at rest (AES-256).
- Personal data inventory (RoPA) maintained; DPIA for AI features and location tracking.
- Technician GPS tracking is opt-in, only during working status, and clearly disclosed.
- AI: no customer data used to train models; providers under zero-retention terms where available; tenant toggle.

### Operational
- Least-privilege access for staff; MFA everywhere; production access via audited break-glass.
- Support access to tenant data only with tenant consent, time-boxed and audited (visible to the tenant).
- Incident response plan, breach notification within 72 h (ICO), customer notification commitments.
- Logging without personal data where possible; log retention 90 days (security logs 1 year).

### Certifications roadmap
1. **Cyber Essentials** (Phase 2) → **Cyber Essentials Plus** (Phase 4): required for UK public sector.
2. **ISO/IEC 27001** (Phase 5, ~6–9 months of operation of the ISMS).
3. **SOC 2 Type II** for international enterprise (later).
4. Alignment with **ISO 41001** (FM) and **ISO 55001** (asset management) in product features and marketing.
5. NHS **DSPT** (Data Security and Protection Toolkit) if selling to NHS.

## Testing strategy

| Layer | Tooling | Coverage expectation |
|-------|---------|----------------------|
| Unit | Vitest | Business rules (SLA calc, PPM scheduling, workflow guards, pricing/entitlements): > 90% |
| API / integration | Vitest + Supertest against real Postgres (Testcontainers) | Every endpoint: happy path, validation, permission denied, **cross-tenant denied** |
| End-to-end | Playwright | Primary journeys per role, including demo-credential login |
| Visual / a11y | Playwright screenshots + axe | Key screens |
| Load | k6 | Helpdesk queue, work order list, dispatch board, PPM generation, IoT ingestion |
| Mobile offline | Playwright with network emulation | Offline create/update and sync conflicts |
| Migration | Test migrations against anonymised production-like snapshot | Before each release |

Critical journeys always covered by e2e:
1. Demo login via autofill → dashboard (and the demo panel is absent when `DEMO_MODE` is off).
2. Requester scans QR → logs request → helpdesk converts to WO → technician completes offline → syncs → requester notified → CSAT.
3. PPM schedule generates WOs → contractor completes in portal → certificate uploaded → compliance matrix turns green.
4. Super User creates custom field + workflow change + role → affected user sees the change.
5. PO over approval limit → multi-stage approval → receipt → invoice match.

## DevOps

- Trunk-based development; short-lived branches; PR checks required; code owners.
- Preview environment per PR with seeded demo data.
- Database migrations: expand/contract pattern for zero-downtime deploys.
- Feature flags for in-progress work (separate from plan entitlements).
- Release cadence: continuous to staging; production weekly (or on demand), with changelog.
- Observability: structured logs with tenant and request IDs, traces, RED metrics dashboards, alerting on SLOs, error tracking.
- Cost monitoring per tenant (storage, AI, compute) to protect margins.
