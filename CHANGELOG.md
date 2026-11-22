# Changelog

What changed for people using CAFM, newest first. Each pull request that changes behaviour adds a line under "Unreleased".

## Unreleased

### Changed

- Locations are listed in name order, and a location shows its path (for example Wales region › Cardiff HQ › Basement) with the hierarchy opened to it, so a scanned room can be placed straight away.
- Locations keep the level order Portfolio, Region, Site, Building, Floor, Zone, Space, and only organisation-wide managers can create the top three levels, in the API as well as on screen.
- Printed location QR labels use the organisation's own address, and the page shows it before you print.
- The location form now says which custom field needs attention, a required text field can no longer be satisfied by blank text, and a badly typed opening time gets a clear message.
- The page for a scanned label you can't open explains why and offers Switch organisation.
- Menu section labels are lighter, so they meet WCAG AA contrast on the dark menu.
- The homepage uses sharper device and plant room media and gives each scroll scene more time on screen.
- A labelled Sign out button appears next to your name and lets you retry if sign-out fails.

### Added

- Asset records for printable QR and barcode labels, NFC scan links, cumulative meter readings with rollover, warranties and claims, expiry alerts and documents. Scan a tag to report a fault against its asset and include a photo.

- Helpdesk queue, requester portal, request catalogue and priority matrix. Report from a location QR label, an asset page, the portal, a phone call or a configured inbox. Operators can triage and link duplicates, and each requester receives status updates and can rate their completed report.
- Request notifications in the CAFM inbox, with templates for email and browser push.

- What an asset serves: name the floors, rooms and other assets that depend on an asset, and see on its page what is affected if it goes out of service. People only see what is inside their branches.
- Assets in the signed-in app: a register with classification groups, search and filters, an asset page with its details, components and lifecycle, and forms to add and edit assets, with a cost typed in the asset's currency and the class's own attributes. Phone friendly.
- Assets API: classes with attribute templates, and assets with a parent and component hierarchy, in any location inside a site. References are issued automatically (`AST-00214`), the plan's asset limit applies, and people only see assets in the branches they can access.
- Locations in the signed-in app, with a searchable hierarchy, site details, UK business calendars, a filterable portfolio map and printable QR labels.

- Locations API: create and organise estate locations, search by name or code, and restrict access to assigned sites or branches of the hierarchy. Edits carry forward custom fields you leave out.
- On the Free plan, inviting a fourth full user (or changing someone's role to one) explains the plan's limit of 3. Lighter licences, such as technicians and requesters, don't count.
- Custom fields (API): people who can change settings can add fields such as text, numbers, money, dates, pick lists and links to people or assets on requests, work orders, assets, locations, PPM schedules, contractors and people. How many depends on the plan. Every change is versioned and can be rolled back. Forms that show them arrive with each module in Phase 1.
- Reference numbering: choose the format for work order, request, asset and PPM numbers, such as `JOB-{YYYY}-{0000}`. Numbers are unique and have no gaps.
- The full app shell: a menu of every module your role can use (locked modules say which plan includes them; modules still to come say which phase), a command palette (Ctrl K) to jump to any page, a notifications drawer, light, dark or system theme, and a menu drawer on phones.
- Switch organisation from the user menu, for people who belong to more than one.
- Demo guard rails: the demo personas and built-in roles can't be changed, and the demo resets every night at 03:00 UK time, with a warning banner 10 minutes before.
- Password reset by email: a single-use link that works for 30 minutes and signs you out everywhere. The demo accounts can't be reset.
- Invitations: invite someone into the organisation with a role; they set a password, accept the terms and land in the app. People who already have an account sign in to accept.
- Emails are queued and sent by the background worker. Email from demo organisations, or when no mail server is set up, is captured instead of sent.
- Tenant command-line tool for the platform team: create an organisation (with its first Super User invite), change its plan, suspend or reactivate it.
- Roles and permissions: 15 built-in roles per organisation (doc 03) plus custom roles, with data scopes (all or own). Super Users can create and edit roles; nobody can grant a permission they don't hold, change their own role or remove the last Super User.
- Change someone's role or deactivate them; their licence follows the role, and deactivated people are signed out straight away.
- Audit log of role and people changes, append-only.
- Plans and add-ons decide which features an organisation has (Free, Starter, Professional, Enterprise); locked features say which plan unlocks them.
- Background worker for emails and scheduled jobs, fed by a transactional outbox.
- Public CAFM homepage with a scroll-driven plant room walkthrough, an interactive sample job and links to sign in or choose a demo account where enabled.
- Railway deployment: one service runs the API and web app, with database setup, migrations and demo reseeding before each deploy.
- Sign-in page with email or username and password, "Keep me signed in" (30 days) and generic error messages.
- Demo accounts panel (demo environments only): click a role to fill in its details; six roles shown, all 16 on request.
- Choose an organisation, for people who belong to more than one.
- Home page with the organisation, your name and role, and sign out.
- Security: passwords hashed with Argon2id, accounts locked for 15 minutes after five failed attempts, a limit on failed sign-ins per network address, sessions that end on sign-out, expiry or organisation suspension.
- Each organisation's data is isolated in the database itself (row-level security).
