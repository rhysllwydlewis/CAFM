# Work orders

Reactive jobs at a location, usually raised from a Helpdesk request. This page covers the screens, the model and the API. Contractor assignment, SLA clocks and escalation, costs, checklists and job sheets follow in the other P1-04 sub-items (see [PROGRESS](PROGRESS.md)).

## Screens

- **Work orders** (`/app/work-orders`) lists jobs with the views Open, Mine, Unassigned, Overdue and All, a search, and priority and status filters. The queue counts sit above it. **New work order** opens a form to raise a job at a location, with an optional asset and assignee.
- **Board** shows the open jobs in lanes: To assign, Assigned, In progress, On hold and Completed. Each card has a menu of the steps you can take, so the board works with the keyboard, and the same rules apply as on the job page. Pausing a job asks for a reason, so do that from the job page.
- **A job** (`/app/work-orders/{id}`) shows the details, targets and timeline. From there you can update the status, assign, edit the details and priority, and add notes, as far as your role allows.
- **On a Helpdesk request**, the Work orders panel lists the jobs raised from it and has a form to raise one or more, each with its own title and assignee.

## Lifecycle

A job moves through these statuses. It can go back to an earlier step only where the table allows it.

| Status | Next |
| --- | --- |
| Logged | Assigned, Cancelled |
| Assigned | Logged (unassign), Accepted, Travelling, On site, Paused, Cancelled |
| Accepted | Assigned, Travelling, On site, Paused, Cancelled |
| Travelling | Accepted, On site, Paused, Cancelled |
| On site | Paused, Completed, Cancelled |
| Paused | Accepted, Travelling, On site, Cancelled |
| Completed | Verified, Closed, On site (reopen) |
| Verified | Closed, On site (reopen) |
| Closed, Cancelled | none |

Assigning someone moves a logged job to Assigned. Clearing the assignee returns it to Logged. A new assignee has not accepted yet, so reassigning an accepted or travelling job returns it to Assigned. A paused job stays paused. Nobody can be assigned or unassigned once the job is on site. Pausing needs a reason: awaiting parts, access, approval or a contractor, or another reason.

## Who can do what

| Action | Permission |
| --- | --- |
| See jobs | `work_orders.read` |
| Raise or edit a job, verify, cancel or reopen it | `work_orders.edit` |
| Assign or unassign | `work_orders.assign` |
| Accept, travel, go on site, pause, complete or close, and add notes | `work_orders.close` or `work_orders.edit` |
| Convert a request | `work_orders.edit` and `requests.manage` (and the Helpdesk plan) |

Everything needs the Work orders feature on the plan. A member limited to their own work (a technician) sees only the jobs assigned to them, and only at locations they have been given. Anyone else sees the jobs at the locations they can see. A job at a location someone can't see is reported as not found.

Only people who can do jobs at the location can be assigned: active, with a full, mobile or contractor licence, with `work_orders.read` and either `work_orders.close` or `work_orders.edit`, and access to the location. `GET /api/work-orders/locations/{locationId}/assignees` lists them.

## Raising jobs

- `POST /api/work-orders` raises a job at an open location in an open site. It takes an impact and urgency (1 to 3), and the priority and the response, attendance and fix targets come from the Helpdesk priority matrix and the site's business calendar. Send a `submissionId`; a retry with the same one returns the same job, and a different payload with it is refused.
- `POST /api/work-orders/from-request/{requestId}` turns a Helpdesk request into one to ten jobs, for example one per trade. The jobs keep the request's priority and targets, so the clock does not restart. The request moves to In progress and the requester is told. Send the request's `requestVersion`, so a change made by someone else is not overwritten.
- When every job on a request that is still wanted has been completed, the request is completed and the requester is told. Reopening a job reopens the request.

Numbers use the `work_order` sequence (`WO-00001`), whose format can be changed through the numbering configuration (`/api/config/numbering`).

## Changing a job

- `PATCH /api/work-orders/{id}` edits the title, description, asset and custom fields, or re-triages it. Changing impact and urgency (always together) recalculates the priority and targets from the time the job was raised. Closed and cancelled jobs can't be edited.
- `POST /api/work-orders/{id}/status`, `/assign` and `/comments`.
- Every change sends the job's `version`, and a stale one is refused with a conflict.
- Status changes, assignment and notes appear on the job's timeline. Notes can be marked internal. Every change is in the audit log (`work_order.create`, `.update`, `.status`, `.assign`, `.comment`).

Custom fields for work orders are defined under the `work_order` entity type.

## Data

`work_order` and `work_order_entry`, both tenant-owned with row-level security and tenant-checked foreign keys. The database also refuses an unknown status, a pause without a reason, an out-of-range priority and a blank title.
