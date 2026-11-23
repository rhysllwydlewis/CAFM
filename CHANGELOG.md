# Changelog

What changed for people using CAFM, newest first. Each pull request that changes behaviour adds a line under "Unreleased".

## Unreleased

### Added

- Saved list views (API): keep your own filters, sort, grouping and columns for work orders, assets, requests and planned maintenance, and share a view with the whole organisation if you are allowed to. The screens follow. See [Saved list views](docs/views.md).
- Administration console, first part: an overview with licence use, recent changes and a setup checklist, and a Users and licences screen to invite people, withdraw invitations, change roles and deactivate or reactivate people. See [Administration](docs/admin.md).

- Quick jobs, recent scans, time and root cause in the technician app: raise a job from a scanned asset (saved on the phone and sent when there is signal, for people allowed to create jobs), reopen the last scans, and add time on the job and an internal root cause when completing a job.

- Scan and quick capture in the technician app: the new Scan tab looks up an asset label, asset number or job number from the jobs saved on the phone (with the camera where the browser supports it), opens its jobs and records a meter reading without signal. A new job can now be accepted, or declined with a reason that goes to the helpdesk as a note. See [Mobile app](docs/mobile.md#scan-accept-and-readings).

- Offline checklists, photos and signatures in the technician app: answer checklist steps, add photos, start and complete a job and take the customer's signature with no signal. Everything is saved on the phone and sent in order when signal returns, and the new Sync tab shows what is waiting and anything the server refused. See [Mobile app](docs/mobile.md#working-offline).

- Technician app shell: open `/m` on a phone and add it to the home screen. It lists your jobs with priority, location and how long is left to fix, shows a job's location, access notes, asset and description, and keeps working without signal. The jobs are saved on the phone, refreshed when there is signal, and removed when you sign out. See [Mobile app](docs/mobile.md#the-app-shell).

- Time and labour rates: technicians record the time they spend on a job (on site, travel or overtime) without seeing any cost. Finance, administrators or any role given the permission set hourly rates, for everyone or per role, and the cost of the time is posted to the job automatically using the rate at the time. Who can record time, see costs and set rates is chosen per role. See [Work orders](docs/work-orders.md#time-and-labour-rates).

- Mobile sync queue: changes a technician makes offline (status, notes, checklist answers and meter readings) are sent in a batch, each with a key so a retry never applies a change twice. A change that no longer fits, such as a job that has since changed, is rejected on its own. See [Mobile app](docs/mobile.md#mutation-queue).

- Mobile work pack: a technician's phone can download their open jobs with locations, assets and checklists, and then ask only for what changed since the last sync. See [Mobile app](docs/mobile.md#work-pack-and-sync).

- Mobile sign-in: the technician app signs in with OAuth 2.0 and PKCE. A person signed in at a browser approves a device, which gets a 15-minute access token and a refresh token that changes on every use. A copied refresh token signs the device out. People can list and sign out their own devices. See [Mobile app](docs/mobile.md#signing-in-a-device).

- Planned maintenance screens: a 52-week planner of every schedule, a list of schedules, a forecast of visits, labour and estimated cost by month, the overdue visits, and how many were done on time in the last 12 months. Planners can add tasks to the library, plan schedules, put assets on them and raise the jobs now. See [Planned maintenance](docs/ppm.md#screens).

- Planned maintenance: a library of maintenance tasks (steps, duration, skills, safety notes), and schedules that repeat on a calendar or by a meter reading, with fixed dates or counted on from the last visit. Work orders are raised automatically ahead of each due date, once, with the task's steps as a checklist that must be completed, and the schedule moves on when the job is done. See [Planned maintenance](docs/ppm.md).

- Work order checklists, photos, sign-off and job sheets: add checklists to a job from a template or written out, with steps to tick, pass or fail, read or comment on; a checklist can hold back starting work or completing the job until its required steps are answered, including from a contractor's link. Add before and after photos, take the customer's and the technician's drawn sign-off, and download the job as a PDF job sheet or email it to the requester (without costs). See [Work orders](docs/work-orders.md#checklists).

- Work order costs: record labour, parts, sub-contract and expenses on a job, with the total on the job and in the list. Amounts are worked out in whole pence on the server. A job can have a not-to-exceed limit, and spend over it needs a recorded reason. Only people who can see costs see them. See [Work orders](docs/work-orders.md#costs).

- Work order SLA clocks: pausing a job for parts, access or approval stops its clock and the targets move out by the business time lost when work resumes ("awaiting contractor" and "other" don't stop it). The job page shows how it stands against its response, attendance and fix targets. People are alerted when a job is close to one of them and again when it is missed: the assignee first, and supervisors for that location on a breach. See [Work orders](docs/work-orders.md#sla-targets-pauses-and-alerts).

- Work orders: reactive jobs with a lifecycle from Logged to Closed, assignment to people who can do the job at that location, notes, and a history of every change. A Helpdesk request can be turned into one or more jobs, which keep the request's priority and targets, and the request is completed and the requester told when all the work is done. There is a list, a board and a page for each job, and a panel on Helpdesk requests to raise work. A job can be sent to an outside contractor by an emailed link, with no account needed: they accept it, update its progress and add notes. SLA clocks, costs, checklists and job sheets follow. See [Work orders](docs/work-orders.md).

### Changed

- A new homepage: one day at Cardiff HQ, with scroll as the clock. The day plays on the building from 05:00, with what CAFM did at each time (a request logged by QR code, planned visits raised, a boiler fault at 17:45), then at 18:00 the floors slide apart and the evening follows the fix through the plant room to midnight, ending on the links to try the demo or sign in. With reduced motion the film steps between still frames, and without WebGL the stills cross-fade.

- Fix a site whose opening hours end at 24:00 (the way overnight opening is entered) being unable to receive Helpdesk requests, because the response deadline couldn't be worked out.

- Stop email auto-replies, bounces and the Helpdesk mailbox writing to itself from opening requests and replying to each other in a loop. Email sent by CAFM is now marked as automatic.

- Keep accented filenames intact on uploads, link duplicate-report photos from the primary Helpdesk request, and cancel queued warranty deliveries when cover is renewed or archived.

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
