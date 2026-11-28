# Changelog

What changed for people using FM Stead, newest first. Each pull request that changes behaviour adds a line under "Unreleased".

## Unreleased

### Added

- Phone app: a poor signal no longer signs a technician out. If the answer to a sign-in refresh is lost, the phone's retry within a minute is answered with a fresh sign-in instead of being treated as a stolen device. A person can also have at most 10 phones signed in, and expired approval codes are cleared automatically. See [mobile](docs/mobile.md#stolen-and-lost-devices).
- Time recorded on a phone is filed on the London day, so work between midnight and 1am in summer is no longer filed on the day before.
- The Business calendars screen counts only closures that are still ahead, and the roles screen no longer shows its confirmation again when the page is reloaded.
- Import and export now has its own entry in the side menu, shown to anyone who can import or export data. Before, people such as Planners, who have no Administration item, and FM Managers, who are sent back from the Administration page, had no way to find it. When it is open, only Import and export is marked as the current item.
- A person whose password an administrator generated, such as a new username-only account or a reset, must now choose their own password at their first sign-in. Until they do, they are taken to a Choose your own password page and nothing else opens. See [Username-only accounts](docs/admin.md#username-only-accounts).
- Automated security scanning in the repository: weekly dependency update pull requests (Dependabot), CodeQL code scanning, and a weekly passive OWASP ZAP baseline scan of the demo build. Nothing changes in the product.
- The full content security policy in report-only mode now sends violation reports to the site, which logs each one without any page path or query string, so we can see what enforcing it would block. Nothing changes for people using the product.
- The security policy report now gives each page its own script nonce, a step towards enforcing the full content security policy. Nothing changes for people using the product.
- Security hardening, first part: the site now sends HSTS and a content security policy (the parts that stop other sites framing it enforced, the full policy in report-only mode while scripts are tidied), and the API writes one structured log line per request with a request ID and the organisation it was for. See [security notes](docs/security.md).
- Security and sign-in has an **Allow view as user** setting. It is on by default; switch it off and nobody can start a view-as-user session in your organisation. See [view as user](docs/admin.md#view-as-user).
- Account security: anyone signed in can change their own password from the name at the foot of the side menu. People with a username only can now replace the password an administrator generated for them. Every other device, phones and tablets included, is signed out, people with an email address are told by email, and wrong attempts count towards the sign-in limit. On the phone app it is under "Me". See [changing your password](docs/admin.md#changing-your-password).
- Two-step verification with an authenticator app. Turn it on from the account menu, sign in with a code (or a single-use recovery code), and let administrators reset it for someone who has lost their phone. The "Require MFA" security setting now holds people to the set-up until they have it. See [two-step verification](docs/admin.md#two-step-verification).
- Branding: upload your logo (PNG, JPEG or WebP, 64 KB or smaller) to show in the menu, and set the name your emails come from. See [branding](docs/admin.md#branding).
- Roles: a new data scope, "my team’s records". People with it see their own records and those of the people they share a team with, in people lists, requests and work orders. See [roles and permissions](docs/admin.md#roles-and-permissions).
- A new logo: "FM Stead" as a heavy serif wordmark with "FMS" as the short form. The favicon and the mark beside the product name are now an "FM" tile in your accent colour. The product name in the app is unchanged for now.
- Administration: a Business calendars screen lists every site's opening hours, bank holiday nation, closures and time zone, and flags sites with no calendar. See [business calendars](docs/admin.md#business-calendars).
- Import and export screen in Administration: choose locations, assets, people or PPM schedules, download the template, check your CSV file (problems are listed by line and column, with an error report to download), import it, and undo a recent import. Exports are on the same page. See [import and export](docs/import-export.md#the-screen).
- Administration: the sign-in message saved under Branding now shows on the organisation's own sign-in page. Nothing is revealed about organisations that have no message, or that don't exist.
- Import: PPM schedules can be imported from a CSV file through the API, with a template, a check that lists every problem by line and column (and an error report file), an all-or-nothing import, and an undo while the new schedules are untouched. See [import and export](docs/import-export.md#importing-ppm-schedules). The screens come next.
- You can import people from a CSV file as invitations, with a check first, an error report and a way to withdraw the invitations. The screens come later.
- Import: assets can be imported from a CSV file through the API, with the same template, check, error report, all-or-nothing import and rollback as locations. A file can add a system and its components together, and class attributes and custom fields are checked. See [import and export](docs/import-export.md#importing-assets).
- Import: locations can be imported from a CSV file through the API, with a template, a check that lists every problem by line and column (and an error report file), an all-or-nothing import, and a rollback while the new locations are untouched. See [import and export](docs/import-export.md#importing-locations). The screens come next.
- Import and export: CSV exports of locations (`GET /api/locations/export`), assets (`/api/assets/export`), people (`/api/people/export`) and PPM schedules (`/api/ppm/schedules/export`), each limited to what you can already see (the first part of import and export). Spreadsheet formulas in cells are defused, and each export is recorded in the audit log.
- Administration: the audit log can be filtered by person, record id and date range, and exported as a CSV file (up to 5,000 events). Each export is itself recorded in the log. See [Audit log](docs/admin.md#audit-log).
- Reports: a Satisfaction report (average and spread of the ratings requesters gave) for people who triage requests, and a Cost analysis report (labour, parts, sub-contract and expense cost per currency) for people who can see costs, both for the chosen period. See [Reports](docs/reports.md).

- Administration: a Service levels screen showing the priority matrix, the response, attendance and fix targets for each impact and urgency pair, and the request categories, with a link to edit them in the request catalogue. See [Service levels and categories](docs/admin.md#service-levels-and-categories).

- Administration: a Custom fields screen. A Super User adds fields to requests, work orders, assets, locations and other records, renames them, makes them required, and deactivates them without losing saved values. It shows how many fields the plan allows. See [Custom fields](docs/admin.md#custom-fields).

- With the side menu collapsed, each icon shows its name beside the menu when you hover over it or move to it with the keyboard. Before, only a mouse hover showed anything. A locked module says so in the same label.

- The side menu shows a soft glow along its lower edge when there is more menu below, and along its upper edge once you have scrolled down. The glow disappears at each end. It helps because the scrollbar stays hidden until you hover the menu.

- The side menu can be collapsed to a slim icon rail with the button beside the logo, and opened again with the same button. Hover an icon to see its name. The choice is saved on your account, so it follows you to another browser or device, and the phone menu is unchanged. (In the demo, and while an administrator is viewing as someone else, the choice lasts only until the page is reloaded. The demo's shared people save none, so one visitor's choice never reaches the next.)

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

- Phone app: the QR scanner can now use the camera. The site was telling the browser to keep the camera off for everyone, so the scan screen only ever offered typing the number.
- Password reset: resetting a password now also signs out phones and tablets signed in to the phone app. Before, they could keep refreshing their saved sign-in for up to 30 days.

- Two-step verification: a wrong password when turning it off or replacing recovery codes now counts towards the same limit on failed attempts as signing in, so a stolen session can’t be used to guess the password.

- Business calendars: the warning for a site with no calendar now says what its service level clocks really use, the default hours (Monday to Friday, 09:00 to 17:00, UK time), instead of saying they run around the clock. The screen also pages through organisations with more than 100 sites, instead of stopping silently at 500, and its count of sites without a calendar covers every site.

- Roles and permissions: the confirmation after creating, duplicating or deleting a role now stays on screen. It used to vanish if the page reloaded first.

### Changed

- A new homepage. It is one continuous film of a London street, rising past a glass tower and out across the city at dusk, played by your scroll in five chapters (requests, planned maintenance, compliance and the whole estate). Below it are the product screens, who FM Stead is for and what sets it apart. It scrubs smoothly forwards and backwards, a phone gets lighter clips, with reduced motion it shows a still picture for each chapter, and without JavaScript it shows every word over the first picture. The "Try the demo" and "Sign in" buttons work as before. The previous flight-over-an-estate homepage is kept in `archive/homepage-flight-v1`.
- The homepage is now one scroll-driven flight over a demo estate: from a city square up a tower, over its roof plant and out across a twelve-site district at night, ending back in the square. Short headlines and callouts pinned to the plant appear as you rise, with an altitude readout and a stage rail. It keeps the demo and sign-in links, uses the FM Stead logo, works without JavaScript, follows reduced motion, and has a written version for screen readers.
- Internal names now say FM Stead too: the sign-in and theme cookies, the offline phone app's sign-in client, background job queue and email identifiers. You are signed out once and the theme resets to the default, and the demo password is now `FmsDemo!2026`. Replies to earlier request acknowledgement emails still reach the right request.
- The product is now called FM Stead (short form FMS). The name replaces "CAFM" in the side menu, the sign-in pages, the homepage, page titles, the phone app name, emails, notifications and job sheets, and the logo is the new FM Stead wordmark. Sign-in details, saved settings and the demo password are not affected.
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
