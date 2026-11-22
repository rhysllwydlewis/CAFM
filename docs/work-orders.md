# Work orders

Reactive jobs at a location, usually raised from a Helpdesk request. This page covers the screens, the model and the API. Checklists and photos, and job sheets follow in the other P1-04 sub-items (see [PROGRESS](PROGRESS.md)).

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
| Raise or edit a job, verify, close, cancel or reopen it | `work_orders.edit` |
| Assign or unassign | `work_orders.assign` |
| Accept, travel, go on site, pause or complete a job, and add notes | `work_orders.close` or `work_orders.edit` |
| Convert a request | `work_orders.edit` and `requests.manage` (and the Helpdesk plan) |

Everything needs the Work orders feature on the plan. A member limited to their own work (a technician) sees only the jobs assigned to them, and only at locations they have been given. Anyone else sees the jobs at the locations they can see. A job at a location someone can't see is reported as not found.

Only people who can do jobs at the location can be assigned: active, with a full, mobile or contractor licence, with `work_orders.read` and either `work_orders.close` or `work_orders.edit`, and access to the location. `GET /api/work-orders/locations/{locationId}/assignees` lists them.

## Raising jobs

- `POST /api/work-orders` raises a job at an open location in an open site. It takes an impact and urgency (1 to 3), and the priority and the response, attendance and fix targets come from the Helpdesk priority matrix and the site's business calendar. Send a `submissionId`; a retry with the same one returns the same job, and a different payload with it is refused.
- `POST /api/work-orders/from-request/{requestId}` turns a Helpdesk request into one to ten jobs, for example one per trade. The jobs keep the request's priority and targets, so the clock does not restart. The request moves to In progress and the requester is told. Send the request's `requestVersion`, so a change made by someone else is not overwritten.
- When every job on a request that is still wanted has been completed, the request is completed and the requester is told. Reopening a job reopens the request.

Numbers use the `work_order` sequence (`WO-00001`), whose format can be changed through the numbering configuration (`/api/config/numbering`).

## SLA targets, pauses and alerts

Each job carries three targets from the Helpdesk priority matrix and the site's business calendar: **response** (the job is picked up), **attendance** (someone is on site) and **fix** (the job is completed). A job raised from a request keeps the request's targets, so the clock doesn't restart. The job page shows where it stands on each: how long is left, how late it is, or whether it was met. Giving a job to a person or a contractor is the response, and so is raising it from a request that has already been answered.

The priority matrix has one fix target. The catalogue also lists separate temporary and permanent fix clocks, which need a second fix time in the matrix and aren't built yet.

**Pausing.** Pausing a job needs a reason. These reasons stop the SLA clock, because the delay is outside the team's control: **awaiting parts**, **awaiting access** and **awaiting approval**. **Awaiting contractor** and **other** don't, so the clock keeps running. When a job that stopped the clock goes back to work, the attendance and fix targets move out by the time lost. For a target measured in business hours that is business time only (opening hours, no weekends, bank holidays or closures); for a round-the-clock priority such as an emergency it is plain elapsed time. A target that has already been met doesn't move. The job page shows the clock as stopped, and how much time has been added. A stopped clock is not counted as overdue. The timeline and the audit log record when the clock stops and restarts, and how much time was added. Re-triaging a job keeps the time already lost.

**Alerts.** A check runs every five minutes for each organisation:

| When | Who is told |
| --- | --- |
| A job is within an hour of its response, attendance or fix target (or within a quarter of the target's length, if that is shorter, so a new emergency isn't alerted the moment it is raised) (response stops mattering once the job is picked up, and attendance once someone has been on site) | The person it is assigned to, or the supervisors for that location if nobody has it (for example, with a contractor) |
| A target has been missed | The assignee and the supervisors for that location |

Supervisors are people whose role can assign work and who can see the job's location. Each alert is sent once for a given target time, in the app and by email, and as a browser push if set up. If the target moves, the clock is paused or the job is finished before the alert is delivered, it is dropped, so no one is told something that is no longer true. Alerts appear in the notification drawer and link to the job. Who is told, and when, is fixed for now; configurable escalation chains arrive with the workflow builder (P2A-06).

## Costs

The job page has a **Costs** card for what the job has cost, and the work order list has a **Cost** column.

- **Types:** labour (hours at a rate, as on site, travel or overtime), parts and materials (a quantity at a cost each), sub-contract (with an invoice reference) and expenses. Each has a description, an optional reference and the date it was incurred.
- **Money is whole pence plus a currency code**, never a floating point number. The amount is worked out on the server from the quantity (in thousandths) and the cost each, rounded half up to the penny, and any amount sent by a client is refused. A job's costs are in the job's currency (pounds, for now). No cost or limit can be more than £10 million.
- **The total** is on the card with a breakdown by type, and in the list. Costs are removed, not edited, so every change is in the audit log (`work_order_cost.add`, `.remove` and `.limit`). Costs stay out of the job's timeline, which people who can't see costs can read.
- **Not-to-exceed limit.** A job can have a limit. Spend that would take the total over it is refused, with the new total and the limit in the message, unless the person gives the reason to go over it. The reason is kept with that cost, shown on it and audited. Clearing the limit lifts the block, and a limit set below what is already spent blocks further spend. The full approval of variations arrives with the approvals engine (P2A-06).
- **Who can do what:** seeing costs needs `costs.read`. Adding or removing a cost, or setting the limit, also needs `work_orders.edit`, so technicians and Helpdesk, who don't have `costs.read`, never see rates or totals, and Finance can read costs but not change them. Costs can't be added, removed or the limit changed once a job is closed or cancelled.
- **Not built yet:** mark-up on parts, charge-out to a client or cost centre, and sub-contractor invoices matched to purchase orders. These follow with Finance.

## Contractors

A job can be sent to an outside contractor who has no account. On the job page, enter the contractor's name and email and choose **Send to contractor**. They get an email with a link to a page (`/job/{token}`) where they can accept the job, say they are on their way or on site, pause it with a reason, mark it complete and add notes. They never see internal notes, and staff notes are shown as the Facilities team's.

- The job moves to Assigned and has no internal assignee while it is with a contractor. Choosing a person instead takes the job back and ends the link.
- The link works for 30 days. It is for one job and one contractor, and is stored only as a hash. **Send the link again** issues a new link and email to the same address, and the old link stops working.
- **Take the job back** withdraws it from the contractor and returns it to the queue, until the contractor has started work. A link that is withdrawn, replaced or expired shows a plain message asking for a new one.
- What the contractor does appears on the job's timeline under their name, completes the job's request like any other job, and is in the audit log as done through the contractor link.
- Sending, resending and withdrawing need `work_orders.assign`. Demo email is captured rather than sent.

The full contractor portal, accreditations and quotes are a Phase 2A feature.

## Changing a job

- `PATCH /api/work-orders/{id}` edits the title, description, asset and custom fields, or re-triages it. Changing impact and urgency (always together) recalculates the priority and targets from the time the job was raised. Closed and cancelled jobs can't be edited.
- `POST /api/work-orders/{id}/status`, `/assign` and `/comments`.
- Every change sends the job's `version`, and a stale one is refused with a conflict.
- Status changes, assignment and notes appear on the job's timeline. Notes can be marked internal. Internal notes are hidden from a contractor, whether they use a link or have an account, and from client viewers. A note that isn't internal can be read by the contractor the job is with, and the job page says so. Every change is in the audit log (`work_order.create`, `.update`, `.status`, `.assign`, `.comment`).

Custom fields for work orders are defined under the `work_order` entity type.

## Data

`work_order` and `work_order_entry`, both tenant-owned with row-level security and tenant-checked foreign keys. The database also refuses an unknown status, a pause without a reason, an out-of-range priority and a blank title.
