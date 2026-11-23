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
