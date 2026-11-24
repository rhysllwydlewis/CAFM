# Administration

The Super User console lives at `/app/admin`. This first part has the overview and the users screen. More screens follow in later batches of P1-09.

## Overview

`GET /api/admin/overview` (needs `settings.manage`) returns the numbers on the overview screen: active users by licence type, full user seats against the plan limit (pending full invitations count as seats), open invitations, the number of changes in the audit log over the last 7 days and who made them, and a setup checklist (team invited, sites, assets, request catalogue, a second Super User).

## Users and licences

`GET /api/admin/users` (needs `people.manage`) lists everyone in the organisation with role, licence, status and last sign-in. The screen changes things through the existing endpoints, so the same guard rails apply:

- `POST /api/people/invites` and `DELETE /api/people/invites/:id` (`people.invite`): invite and withdraw.
- `PATCH /api/people/:membershipId` (`people.manage`): change role, or deactivate and reactivate. You can't change yourself, grant more than you hold, or remove the last active Super User, and a full licence needs a free seat on the plan.

Everything here is tenant-scoped (RLS), and each change is written to the audit log. In the demo, the shared demo people stay as seeded.

## Roles and permissions

`/app/admin/roles` (needs `roles.read`; changes need `roles.manage`) lists every role with how many people hold it. Pick a role to see its name, description, data scope and a checkbox for each permission, grouped by area. You can create a role, duplicate one, edit it and delete a custom role nobody holds.

The screen uses the existing `/api/roles` endpoints, so the guard rails stay: you can only grant permissions you hold yourself, the Super User role can't be edited, built-in roles are locked in the demo, and every change is audited. Data scope is "all records" or "own records only"; scoping by site or team is not built yet.

## Teams

`/app/admin/teams` lists teams and who is in them. `GET /api/teams` needs `people.read`; `POST /api/teams`, `PATCH /api/teams/:id` (rename, or replace the member list) and `DELETE /api/teams/:id` need `people.manage`. Only active people in the same organisation can be members, a team name is unique within an organisation, and all changes are audited (`team.created`, `team.updated`, `team.deleted`). Teams live in the `team` and `team_member` tables, both under row-level security. Assigning work to a team and scoping by team come later with the workflow and dispatch items.

## Site access and delegated admin

The users screen has a **Site access** card. Pick a person, then choose "Every site in the organisation" or "Only the sites I choose" and tick the regions and sites. It uses `PUT /api/locations/access/:membershipId` (needs `people.manage`) and each change is audited as `location.access_updated`. `GET /api/admin/site-access` (`people.manage`) lists the regions and sites you can hand out and each person's current limit.

**Delegated admin.** A person who has people permissions but is limited to certain sites is a delegated admin, for example a regional admin. Create a role with `people.manage` (and `people.read`), then limit that person to their sites. They then:

- see, and manage, only people who are limited to sites inside their own. Anyone else, including Super Users and people with organisation-wide access, is hidden and answers `404`;
- can change role, deactivate and set site access, but only choose sites they hold themselves, and can't remove a limit (`null`);
- get the same narrowed list from `GET /api/people` (`people.read`) as on the users screen: themselves and the people inside their own sites, so the screen can't be bypassed by calling the API directly. Everyone else's name and email stay out of the answer;
- can't invite people, see invitations, or create, edit or delete teams (`403`), because neither has a site. An organisation-wide admin does those;
- are still held by the no-privilege-escalation rule: they can't grant or manage a role with permissions they don't hold.

Scoping by team is not built yet.

## Modules and navigation

`/app/admin/modules` (needs `settings.manage`) lists every module in the main menu with the plan that includes it. For each you can switch it off, give it your own name, and set its position within its menu section (1 is first). Home, My requests and Administration always show, so nobody is locked out.

`GET /api/admin/modules` and `PUT /api/admin/modules` read and save the choices; saving a module back to its standard state removes its row. Every change is audited as `settings.modules_updated`. Choices live in `module_setting` (row-level security). A module your plan doesn't include stays locked whatever you choose: switching a module on never unlocks a feature.

Switching a module off hides it from the menu. It does not block the module's API or its direct web address, and the data stays; it is a menu choice, not a permission or a plan limit.

`GET /api/display` is readable by anyone signed in to the organisation. It returns only the choices the menu needs (which modules are off, their names and positions, and the terminology), never plan or role details.

## Terminology

`/app/admin/terminology` lets you use your own word for a few standard terms: work order, request, site, asset and contractor, each with a singular and a plural. Leave both empty to keep the standard words. `GET` and `PUT /api/admin/terminology` (`settings.manage`) read and save them, audited as `settings.terminology_updated`, stored in `term_override` (row-level security).

For now your words show in the menu: the Work orders, Assets, Locations and Contractors items use the plural of their term unless you have also named the module yourself. Screens, emails and reports pick them up as each is built, through `termLabel()` in `@cafm/shared`.

## View as user

The **View as user** card on `/app/admin/users` lets a Super User see the app as another person sees it, to troubleshoot ("why can't Tom see this job?"). It needs the `people.impersonate` permission, which only the Super User role holds. A custom role can be given it, but see the limits below.

`POST /api/admin/impersonation` takes `{ membershipId, reason }` (the reason is 3 to 200 characters) and swaps your session for a viewing one. Rules:

- **Read-only.** Any request that could change data (anything but GET, HEAD or OPTIONS) is refused with `impersonation_read_only`. That also stops a viewing session switching organisation or starting another view.
- **One hour**, never extended, and one level only.
- **Not yourself, and not a Super User.** The person must be active in your organisation (another organisation's people answer `404`). You can't view as someone who holds permissions you don't hold, and a delegated admin can only choose people inside their own sites.
- **Always visible.** A banner on every page says who you are viewing as and who you are signed in as, with a Stop viewing button. `GET /api/auth/me` returns `impersonation: { by, expiresAt }` while it runs.
- **Audited under you.** `impersonation.started` (with the person's name, your reason and when it ends) and `impersonation.ended` are written with you, not them, as the actor.

`POST /api/admin/impersonation/end` gives you a fresh session of your own. If you have lost the permission or been deactivated meanwhile, it signs you out instead. The viewing session carries `impersonator_account_id` and `impersonator_membership_id` on the `session` row.

Not built yet: the organisation setting "Allow view as user" (the mockup `admin-08-security`) comes with the security settings in P1-09e.

## Branding

`/app/admin/branding` (Enterprise plan, `settings.manage`) sets an accent colour and a sign-in message. The accent is applied across the app; the message is stored but not yet shown on the sign-in screen. The accent is used for buttons and is rejected unless white text on it has a contrast of at least 4.5:1 (WCAG AA); the check runs in the screen and again in the API. Leave both boxes empty to keep the standard look. `GET /api/branding` is readable by anyone signed in, and `GET` and `PUT /api/admin/branding` read and save it, audited as `settings.branding_updated`, stored in `tenant_branding` (row-level security). The logo, custom domain and email sender in the mockup are not built yet.

## Security and sign-in

Administration > Security and sign-in (needs the "Change organisation settings" permission). Screen: `admin-08-security`.

- **Minimum password length:** 12 to 64. 12 is the platform floor and can only be raised. It applies when someone accepts an invitation or resets a password. A person who belongs to several organisations gets the strictest minimum among them when they reset a password.
- **Longest sign-in:** 1 to 720 hours, or empty for the standard (12 hours, or 30 days with "Keep me signed in"). It only shortens a new sign-in. Existing sign-ins are not changed.
- **Require multi-factor authentication:** saved now and enforced when authenticator-app sign-in (P1-12) ships.

Not built yet: single sign-on, IP allow-lists, breached-password checks, separate idle timeout. Every save is recorded in the audit log as `settings.security_updated` with the before and after values. API: `GET` and `PUT /api/admin/security`.

## Audit log

Administration > Audit log (needs "See the audit log"). Screen: `admin-09-audit`. Events are listed newest first, 50 at a time, with a search on the event name. Each row can show the recorded before and after values. Not built yet: filters by person, record and date range, and export. API: `GET /api/admin/audit` with `action`, `entityType`, `from`, `to` and `cursor`.
