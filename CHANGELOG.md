# Changelog

What changed for people using CAFM, newest first. Each pull request that changes behaviour adds a line under "Unreleased".

## Unreleased

### Added

- Administration: the audit log can be filtered by person, record type, record id and date range, and downloaded as a CSV file. Each export is itself recorded in the audit log. See [Audit log](docs/admin.md#audit-log).
- Administration: a Service levels screen showing the priority matrix, the response, attendance and fix targets for each impact and urgency pair, and the request categories, with a link to edit them in the request catalogue. See [Service levels and categories](docs/admin.md#service-levels-and-categories).
- Administration: a Custom fields screen. A Super User adds fields to requests, work orders, assets, locations and other records, renames them, makes them required, and deactivates them without losing saved values. It shows how many fields the plan allows. See [Custom fields](docs/admin.md#custom-fields).
- The side menu can be collapsed to a slim icon rail with the button beside the logo, and opened again with the same button. Hover an icon to see its name. The choice is remembered, and the phone menu is unchanged.
- Home: the key figures now suit the role. A technician or contractor sees their own open, overdue and due-today jobs; the helpdesk sees new requests and unassigned jobs; finance and managers see cost over the last 30 days. See [Reports](docs/reports.md).
- Administration: accounts with a username only, for staff without an email address. An administrator creates one on the Users screen (name, username, role) and is shown a generated password once. The person signs in with just the username at the organisation's own address, `/t/<organisation>/login`, and an administrator resets the password there too. Every creation and reset is audited.
- Reports: an Executive overview screen (key figures and the busiest sites for the last 30 days), plus two new standard reports, reactive against planned work and the busiest sites. See [Reports](docs/reports.md).
- Administration: a Security and sign-in screen sets the shortest password (12 to 64 characters) and the longest sign-in (1 to 720 hours), and records whether multi-factor authentication is required (enforced when authenticator-app sign-in arrives). An Audit log screen lists every change, newest first, with a search by event. Every change to the security settings is audited.
- Administration: a regional admin who is limited to certain sites now sees only the people inside those sites from the people list too, not only on the users screen. A mockup of the Site access card (`admin-13-site-access`) is added.
- Technician app: a change queued on the phone is now applied once even if it is sent twice at the same moment, for example a note when two screens sync together. The app also sends its queue one batch at a time.
- Reports: a Reports screen with open jobs by age, SLA performance and PPM compliance for a chosen period, limited to the sites you can see, and three key-figure tiles on the home page.
- Admin console: branding for Enterprise organisations. A Super User picks an accent colour for buttons, which is refused if white text on it would be hard to read, and a sign-in message (saved now, shown on the sign-in screen later). See [Branding](docs/admin.md#branding).
- Admin console: a Super User can view the app as another person to troubleshoot, from a View as user card on the users screen. It needs a reason, is read-only, ends after an hour, shows a banner on every page, and both ends are recorded in the audit log under the Super User. Super Users and people with more access than you can't be chosen.
- Board layout on the Helpdesk queue (a lane for each stage of a request, with the queue views and filters applying) and a Calendar view on planned maintenance (each schedule on the day its next visit is due). See [Saved list views](docs/views.md#board-on-requests).
- Calendar layout on the work order list: a month calendar with each job on the day its fix is due, coloured for due soon and overdue, with previous and next month. On a phone it is a list of the days that have jobs. See [Saved list views](docs/views.md#calendar-layout-on-work-orders).
- Bulk actions on the request queue, the asset register and the planned maintenance schedules: tick rows and change request status, assignee or priority, asset status, or archive, restore, assign and set the priority of schedules. Each row is checked on its own and the result lists any that could not be changed.
- Admin console: switch menu modules on or off, use your own name and order for them, and use your own words for work order, request, site, asset and contractor. The menu follows for everyone in your organisation.
- Bulk actions on the work order list: tick jobs and change their status, assign or clear the assignee, or set the priority in one go. Each job is checked on its own and the result lists any that could not be changed and why. See [Saved list views](docs/views.md#bulk-actions-on-work-orders).
- Group the work order, request, asset and planned maintenance schedule lists (by status, priority and more) and choose which columns each list shows. Both are kept when you save the filters as a view.
- Admin console: a Site access card on the users screen sets which sites each person can see, and people with people permissions who are limited to certain sites can now manage only the people inside their own sites (delegated admin). Invitations stay with organisation-wide admins.
- Sort the request, asset and planned maintenance schedule lists, ascending or descending, with the same Sort by and Sort order controls as work orders. The order is kept when you save the filters as a view.
- Sort the work order list by date raised, priority, number or title, ascending or descending. The order carries across pages and is kept when you save the filters as a view.
- A saved views bar on the work order, asset, request and planned maintenance lists: save the filters you are looking at as a view (private, or shared if you may share), open it from the list, and delete it.
- Saved list views (API): keep your own filters, sort, grouping and columns for work orders, assets, requests and planned maintenance, and share a view with the whole organisation if you are allowed to. The screens follow. See [Saved list views](docs/views.md).
- Administration console, first part: an overview with licence use, recent changes and a setup checklist, and a Users and licences screen to invite people, withdraw invitations, change roles and deactivate or reactivate people. See [Administration](docs/admin.md).

- Administration console, second part: a Roles and permissions screen with a permission checkbox matrix (create, duplicate, edit and delete roles), and a Teams screen to create teams and choose who is in them. See [Administration](docs/admin.md).

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

### Fixed

- Roles and permissions: the confirmation after creating, duplicating or deleting a role now stays on screen. It used to vanish if the page reloaded first.

### Changed

- The Light, Dark and System theme buttons in the account menu now look like the rest of the interface (a soft track with a raised chip for the chosen one) instead of plain browser buttons.

- The side menu has a rounded scrollbar in the navigation colours. It is wide enough to grab easily, fades out until you hover over the menu, and takes the petrol accent as you drag it.

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
