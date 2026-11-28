# Administration

The Super User console lives at `/app/admin`. It has the overview, users and licences, roles, modules, branding, custom fields, service levels, business calendars, security settings, the audit log and the import screen. The sections below cover each one.

## Overview

`GET /api/admin/overview` (needs `settings.manage`) returns the numbers on the overview screen: active users by licence type, full user seats against the plan limit (pending full invitations count as seats), open invitations, the number of changes in the audit log over the last 7 days and who made them, and a setup checklist (team invited, sites, assets, request catalogue, a second Super User).

## Users and licences

`GET /api/admin/users` (needs `people.manage`) lists everyone in the organisation with role, licence, status and last sign-in. The screen changes things through the existing endpoints, so the same guard rails apply:

- `POST /api/people/invites` and `DELETE /api/people/invites/:id` (`people.invite`): invite and withdraw.
- `PATCH /api/people/:membershipId` (`people.manage`): change role, or deactivate and reactivate. You can't change yourself, grant more than you hold, or remove the last active Super User, and a full licence needs a free seat on the plan.

Everything here is tenant-scoped (RLS), and each change is written to the audit log. In the demo, the shared demo people stay as seeded.

## Roles and permissions

`/app/admin/roles` (needs `roles.read`; changes need `roles.manage`) lists every role with how many people hold it. Pick a role to see its name, description, data scope and a checkbox for each permission, grouped by area. You can create a role, duplicate one, edit it and delete a custom role nobody holds. Role names are unique in the organisation whatever the case, built-in roles included, so a custom role can't be called Technician, and renaming is held to the same rule.

The screen uses the existing `/api/roles` endpoints, so the guard rails stay: you can only grant permissions you hold yourself, the Super User role can't be edited, built-in roles are locked in the demo, and every change is audited. Data scope is "all records", "my team’s records" or "own records only". Team scope shows a person their own records and those of the people they share a team with: people lists, requests and work orders follow it. A scope the system does not recognise is treated as "own records only", so it can never show more. Anyone below "all records" is also limited to the sites they have been given. Scoping by site is set on the person (site access).

## Teams

`/app/admin/teams` lists teams and who is in them. `GET /api/teams` needs `people.read`; `POST /api/teams`, `PATCH /api/teams/:id` (rename, or replace the member list) and `DELETE /api/teams/:id` need `people.manage`. Only active people in the same organisation can be members, a team name is unique within an organisation, whatever the case ("North" and "north" are one name), and all changes are audited (`team.created`, `team.updated`, `team.deleted`). Teams live in the `team` and `team_member` tables, both under row-level security. Assigning work to a team and scoping by team come later with the workflow and dispatch items.

## Site access and delegated admin

The users screen has a **Site access** card. Pick a person, then choose "Every site in the organisation" or "Only the sites I choose" and tick the regions and sites. It uses `PUT /api/locations/access/:membershipId` (needs `people.manage`) and each change is audited as `location.access_updated`. `GET /api/admin/site-access` (`people.manage`) lists the regions and sites you can hand out and each person's current limit.

**Delegated admin.** A person who has people permissions but is limited to certain sites is a delegated admin, for example a regional admin. Create a role with `people.manage` (and `people.read`), then limit that person to their sites. They then:

- see, and manage, only people who are limited to sites inside their own. Anyone else, including Super Users and people with organisation-wide access, is hidden and answers `404`;
- can change role, deactivate and set site access, but only choose sites they hold themselves, and can't remove a limit (`null`);
- get the same narrowed list from `GET /api/people` (`people.read`) as on the users screen: themselves and the people inside their own sites, so the screen can't be bypassed by calling the API directly. Everyone else's name and email stay out of the answer;
- can't invite people, see invitations, or create, edit or delete teams (`403`), because neither has a site. An organisation-wide admin does those;
- are still held by the no-privilege-escalation rule: they can't grant or manage a role with permissions they don't hold.

A role can also limit people, requests and work orders to the person's own records and their teammates' (data scope "team"); the roles screen sets it.

## Modules and navigation

`/app/admin/modules` (needs `settings.manage`) lists every module in the main menu with the plan that includes it. For each you can switch it off, give it your own name, and set its position within its menu section (1 is first). Home, My requests and Administration always show, so nobody is locked out.

`GET /api/admin/modules` and `PUT /api/admin/modules` read and save the choices; saving a module back to its standard state removes its row. Every change is audited as `settings.modules_updated`. Choices live in `module_setting` (row-level security). A module your plan doesn't include stays locked whatever you choose: switching a module on never unlocks a feature.

Switching a module off hides it from the menu. It does not block the module's API or its direct web address, and the data stays; it is a menu choice, not a permission or a plan limit.

`GET /api/display` is readable by anyone signed in to the organisation. It returns only the choices the menu needs (which modules are off, their names and positions, and the terminology), never plan or role details.

## Terminology

`/app/admin/terminology` lets you use your own word for a few standard terms: work order, request, site, asset and contractor, each with a singular and a plural. Leave both empty to keep the standard words. `GET` and `PUT /api/admin/terminology` (`settings.manage`) read and save them, audited as `settings.terminology_updated`, stored in `term_override` (row-level security).

For now your words show in the menu: the Work orders, Assets, Locations and Contractors items use the plural of their term unless you have also named the module yourself. Screens, emails and reports pick them up as each is built, through `termLabel()` in `@fmstead/shared`.

## View as user

The **View as user** card on `/app/admin/users` lets a Super User see the app as another person sees it, to troubleshoot ("why can't Tom see this job?"). It needs the `people.impersonate` permission, which only the Super User role holds. A custom role can be given it, but see the limits below.

`POST /api/admin/impersonation` takes `{ membershipId, reason }` (the reason is 3 to 200 characters) and swaps your session for a viewing one. Rules:

- **Read-only.** Any request that could change data (anything but GET, HEAD or OPTIONS) is refused with `impersonation_read_only`. That also stops a viewing session switching organisation or starting another view.
- **One hour**, never extended, and one level only.
- **Not yourself, and not a Super User.** The person must be active in your organisation (another organisation's people answer `404`). You can't view as someone who holds permissions you don't hold, and a delegated admin can only choose people inside their own sites.
- **Always visible.** A banner on every page says who you are viewing as and who you are signed in as, with a Stop viewing button. `GET /api/auth/me` returns `impersonation: { by, expiresAt }` while it runs.
- **Audited under you.** `impersonation.started` (with the person's name, your reason and when it ends) and `impersonation.ended` are written with you, not them, as the actor.

`POST /api/admin/impersonation/end` gives you a fresh session of your own. If you have lost the permission or been deactivated meanwhile, it signs you out instead. The viewing session carries `impersonator_account_id` and `impersonator_membership_id` on the `session` row.

Organisations can switch this off with **Allow view as user** on Security and sign-in. It is on by default. When it is off, starting a session is refused with a clear message; sessions already running end at their one-hour limit.

## Branding

`/app/admin/branding` (Enterprise plan, `settings.manage`) sets an accent colour and a sign-in message. The accent is applied across the app; the message is shown on the organisation's own sign-in page (`/t/<organisation>/login`), read without a session from `GET /api/public/sign-in-message/<organisation>`. That answer is `{ "message": null }` for an unknown or suspended organisation, one without the branding feature and one with no message, so the page can't be used to find out which organisations exist. The accent is used for buttons and is rejected unless white text on it has a contrast of at least 4.5:1 (WCAG AA); the check runs in the screen and again in the API. Leave both boxes empty to keep the standard look. `GET /api/branding` is readable by anyone signed in, and `GET` and `PUT /api/admin/branding` read and save it, audited as `settings.branding_updated`, stored in `tenant_branding` (row-level security). 

**Logo.** Upload a square PNG, JPEG or WebP image of 64 KB or smaller on the Branding screen. It replaces the initials tile beside your organisation's name in the menu, and **Remove logo** puts the initials back. SVG is refused, because an SVG can carry script, and the API checks that the file really is the type it claims. `PUT` and `DELETE /api/admin/branding/logo` change it (audited as `settings.branding_logo_updated` and `settings.branding_logo_removed`); any signed-in member can `GET /api/branding/logo`, which is served with `nosniff` and a sandbox policy.

**Email sender name.** The name people see on emails from the system (for example "Demo Estates facilities"). Letters, numbers, spaces and `. , & ' ( ) -` only, 60 characters at most. The sending address stays the platform's, so the email still passes SPF and DKIM. Leave it empty for "FM Stead".

**Custom domain and your own sender address** need DNS records and domain verification, so they are set up with your account manager and are not on this screen yet.

## Custom fields

`/app/admin/fields` (`settings.manage`, plan feature `custom_fields`) lists every custom field grouped by record type, with its type, whether it is required and whether it is active. Add a field by choosing the record type, a label, a type and, for pick lists, the options one per line. The key is made from the label unless you give one, and can't be changed afterwards. Edit changes the label, help text and whether it is required; Deactivate hides the field and keeps the saved values. The screen shows how many active fields the plan allows (5 Free, 25 Starter, unlimited above). `GET /api/config/fields/all` returns every field including deactivated ones, and every change is versioned and audited (`field.created`, `field.updated`, `field.deactivated`).

Not built yet on this screen: editing a pick list's options, reordering, bringing a deactivated field back (the API can roll it back), and showing the fields on every record's form.

## Service levels and categories

`/app/admin/service-levels` (`settings.manage`, plan feature `helpdesk`) shows the priority matrix (impact against urgency), the response, attendance and fix targets for each impact and urgency pair with their clock (business hours or 24/7), and the request types grouped by category. It reads `GET /api/helpdesk/settings`. To change anything use the request catalogue (`/app/helpdesk/settings`), which writes the targets and types and audits every change.

Not built yet: configurable work order and request statuses (the lifecycle is fixed, and they come with the workflow engine in Phase 2A).

## Business calendars

`/app/admin/calendars` (`settings.manage`). Screen: `admin-15-calendars`. It lists every open site with its bank holiday nation, opening hours, number of closures and time zone, and warns when sites have no calendar. A site with no calendar (or one that no longer validates) uses the default hours, Monday to Friday 09:00 to 17:00 UK time, for business-hours priorities; priorities that run around the clock do not use a calendar at all. It reads `GET /api/admin/calendars`, which is tenant-scoped (row-level security) and limited to the sites the signed-in person can see. Sites are shown 100 at a time in name order (`?page=2` for the next); the response also carries the `total` and the `missing` count across every page, so the warning and the paging stay true however many sites there are. The calendar itself is still edited on the site's location page (the **Edit** link opens it); this screen is an overview and changes nothing.

## Security and sign-in

Administration > Security and sign-in (needs the "Change organisation settings" permission). Screen: `admin-08-security`.

- **Minimum password length:** 12 to 64. 12 is the platform floor and can only be raised. It applies when someone accepts an invitation or resets a password. A person who belongs to several organisations gets the strictest minimum among them when they reset a password.
- **Longest sign-in:** 1 to 720 hours, or empty for the standard (12 hours, or 30 days with "Keep me signed in"). It only shortens a new sign-in. Existing sign-ins are not changed.
- **Require multi-factor authentication:** enforced. Until a person has set up an authenticator app, every other page and API call in that organisation is refused and they are taken to set it up (see Two-step verification below).

Not built yet: single sign-on, IP allow-lists, breached-password checks, separate idle timeout. Every save is recorded in the audit log as `settings.security_updated` with the before and after values. API: `GET` and `PUT /api/admin/security`.

## Audit log

Administration > Audit log (needs "See the audit log"). Screen: `admin-09-audit`. Events are listed newest first, 50 at a time. Filter by event name, by the person who acted, by the record's id and by a date range (whole days, in your browser's time zone), then **Clear** to start again. Each row can show the recorded before and after values.

**Export CSV** downloads the events that match the filters you last searched for: up to 5,000, newest first, with times in UTC and the changes as JSON. Cells that start with `=`, `+`, `-` or `@` are prefixed with an apostrophe so a spreadsheet won't run them. Each export is itself recorded as `audit.exported`, with the filters and the number of rows.

API (all need `audit.read`, and only ever show your own organisation): `GET /api/admin/audit` with `action`, `entityType`, `entityId`, `actor` (a membership id), `from`, `to` and `cursor`; `GET /api/admin/audit/actors` (the people who appear in the log); `GET /api/admin/audit/export` (the same filters, as CSV). A start date after the end date answers `400`.

## Username-only accounts

For staff without an email address, such as operatives on shared devices. On the Users screen, **Accounts with a username only** creates one from a name, a username (3 to 32 letters, numbers, dots, dashes or underscores) and a role. The password is generated to meet your password rules and is shown once: copy it and pass it on.

- The person signs in at your organisation's own address, `/t/<organisation>/login`, with the username. The username only works inside your organisation, so two organisations can use the same one. It does not work on the general sign-in page.
- There is no email, so there is no "Forgot password" link. Choose **Reset password** on the same card: it makes a new password, signs the person out everywhere and clears any lockout.
- **The person must choose their own password before anything else opens.** After you create the account, or reset it, the first sign-in takes them to a **Choose your own password** page. They type the password you gave them as the current one, then pick a new one. Until they do, every other page and API call is refused (the web app, the requester portal and the phone app all send them there); signing out is always possible. See [changing your password](#changing-your-password) for the rules the new password must meet.
- Creating and resetting need `people.manage`, and, as with invitations, only organisation-wide administrators can create an account. The role you give is limited by the same no-privilege-escalation rule as a role change, and full-licence roles use a seat.
- Anyone with an email address resets their own password from the link in an email, so the reset here refuses them.


## Changing your password

Anyone signed in can change their own password from the name at the foot of the side menu, then "Account security", under "Change your password". On the phone app, open the "Me" tab and choose "Account security". Enter the current password, then the new one twice; "Show passwords" reveals what you typed. The form says how long the new password must be: at least 12 characters, or longer if any organisation you belong to asks for it. It can't be a common password and must differ from the current one.

- **Other devices are signed out.** The device you change it on stays signed in. That includes phones and tablets signed in to the phone app, which can't get back in on their saved sign-in, and any pending second step of sign-in. A password reset by email does the same.
- **A wrong current password counts as a failed sign-in** against the same limit per IP address, so someone holding a stolen session can't guess the password here. After too many, the change is refused for a few minutes.
- **They are emailed.** A person with an email address gets a message saying the password changed, with a link to reset it if it wasn't them. Accounts with a username only have no email, so there is no message.
- **It is recorded.** Each change, and each failed attempt, is in the sign-in events for the account (`password_changed`, `password_change_failed`).
- The shared demo accounts can't change their password, and nobody can change the password of a person they are viewing the app as. Neither is ever held on the change-password step.
- **Held until it is done.** An account with a password an administrator generated or reset has `mustChangePassword` set. `GET /api/auth/me` returns `passwordChangeRequired: true`, and every endpoint except `POST /api/auth/password`, `GET /api/auth/password-policy`, `GET /api/auth/me`, sign-out and choosing an organisation answers `403` with the code `password_change_required`. Changing the password clears it.
- `POST /api/auth/password` with `currentPassword` and `newPassword` (signed in; no other permission). `GET /api/auth/password-policy` returns the `minLength` that applies to the signed-in person.

## Two-step verification

Anyone can turn on two-step verification from the name at the foot of the side menu, then "Account security". It uses an authenticator app (Microsoft Authenticator, Google Authenticator, 1Password and others): scan the code, or type the key, then enter the 6-digit code the app shows. Ten single-use recovery codes are shown once. After that, signing in asks for a code from the app, or a recovery code, once the password is right.

- **Required for everyone:** the "Require MFA" setting under Security and sign-in. Until a person has set it up, every other page and API call in that organisation is refused, and they are taken to the set-up page. The shared demo accounts are exempt, because their password is public and they can't change MFA. Someone who belongs to several organisations is only held in the one that requires it.
- **Turning it off, or making new recovery codes,** asks for the password again.
- **Lost phone and recovery codes:** an administrator with the "change people's roles" permission uses "Reset two-step" on the Users screen. The person's authenticator and recovery codes are removed and the reset is recorded in the audit log. They set it up again at their next sign-in if it is required.
- **Safeguards:** a code can be used once (the app's code for the same 30 seconds is refused a second time), five wrong codes end the sign-in attempt and the person starts again from the password, and the secret is stored encrypted. Set `MFA_ENCRYPTION_KEY` (a long random value) on any real deployment; the API refuses to enrol anyone in production without it.

API (all for the signed-in person): `GET /api/auth/mfa`, `POST /api/auth/mfa/enrol`, `/confirm`, `/recovery-codes` and `/disable`; the sign-in step is `POST /api/auth/mfa/verify`. An administrator's reset is `POST /api/people/:membershipId/mfa/reset` (`people.manage`). Passkeys come in Phase 2A and SMS codes are not offered (SIM-swap risk).
