# Saved list views

A saved view stores what someone chose on a list screen: the layout (list, board or calendar), filters, sort, grouping and columns. It never stores records, so opening a view always shows what the viewer is allowed to see.

## Who can do what

- Anyone who can see a list (for example `work_orders.read` for work orders) can keep **private** views of it, up to 50 per list.
- A view marked **shared** is seen by everyone in the organisation who can see that list. Only people with `views.share` (FM Managers, Administrators and Super Users by default) can share a view.
- Only the owner changes a view. A person with `views.share` can also remove a shared view they don't own. Nobody can read, change or delete someone else's private view: it answers "not found".
- Lists covered: work orders, assets, requests and planned maintenance schedules.

## API

All calls are inside the signed-in organisation, and each checks the list's own feature and permission.

| Call | What it does |
| --- | --- |
| `GET /api/views?entity=work_orders` | Your views and the shared ones for that list, by name. |
| `POST /api/views` | `{ entity, name, visibility, config }`. A name is unique per owner and list, ignoring case. |
| `PUT /api/views/:id` | `{ name, visibility, config, version }`. A stale `version` returns 409 `stale_view`. The list can't change. |
| `DELETE /api/views/:id` | Removes it. |

`config` is `{ layout, filters, sort, group, columns }`. Filter, sort, group and column keys are field keys such as `status` or `custom.zone`, never free text. At most 20 filters and 30 columns. Every create, edit and delete is in the audit log (`saved_view.*`).

## On the screens

Each of the four lists has a **Saved view** bar above its filters. Pick a view to open the list with its filters (the address carries them, so it can be bookmarked), choose **Save current filters as a view** to keep what you are looking at, and delete a view you own (or a shared one, if you can share). The bar saves the filters in the address and the layout (list or board). Sort, grouping and the column chooser are covered below. Bulk actions and kanban and calendar layouts for the other lists are built in later batches of P1-08.

## Sorting the work order list

`GET /api/work-orders` takes `sort` (`created`, `priority`, `number` or `title`) and `dir` (`asc` or `desc`). The default is newest first. Only columns that are never empty are offered, so paging with the cursor never skips or repeats a job. The work order screen has **Sort by** and **Sort order** controls; because they live in the address, a saved view keeps them. 
## Sorting the other lists

The same **Sort by** and **Sort order** controls are on the other three lists, and a saved view keeps them.

| List | Endpoint | `sort` values | Default |
|---|---|---|---|
| Requests | `GET /api/helpdesk/requests` | `created`, `priority`, `number`, `title` | newest first |
| Assets | `GET /api/assets` | `created`, `number`, `name` | oldest first, as before |
| Planned maintenance schedules | `GET /api/ppm/schedules` | `number`, `title`, `priority` | by reference |

Requests and assets page with a cursor on a column that is never empty, with the id to break ties. Schedules page with `offset`. An unknown `sort` is refused with 400.

## Grouping and choosing columns

Every list has a **Group by** control and a **Columns** chooser beside its filters. They work on the rows of the page you are looking at: a group heading with a count is shown each time the value changes, in the order the sort gives, so a group can continue on the next page.

| List | Group by | Columns that can be hidden |
|---|---|---|
| Work orders | status, priority, assigned to, location | priority, status, assigned to, SLA |
| Requests | status, priority, category, channel, location | category, priority, SLA, status, requester, channel |
| Assets | condition, criticality, status, location | make and model, location, condition, criticality, status |
| Schedules | criticality, fixed or floating, assigned to | how often, assets, next due, overdue, assigned to |

The reference and title columns always show. With nothing chosen, every column shows. The choice is in the address as `groupby` and `cols`, so a saved view keeps it. On assets, `group` is still the asset class from the Classification panel; `groupby` is the display grouping. The API never sees either, and neither changes who can see which rows or fields.

## Bulk actions on work orders

Tick rows on the work order list (or the box in the header for the whole page) and a bar offers **Change status**, **Assign to**, **Clear assignee** and **Set priority**. Only the actions your role allows are listed: status needs `work_orders.edit` or `work_orders.close`, assigning needs `work_orders.assign`, and priority needs `work_orders.edit`.

`POST /api/work-orders/bulk` takes `{ action, items: [{ id, version }], ... }` with up to 50 jobs and the same fields as the single-job call (`status` and `pauseReason`, `assigneeId`, or `impact` and `urgency`). Each job is changed by the same code as the single-job call, in its own transaction, so every rule holds per job (status order, checklists, who can be assigned, site access, the version you saw) and one refusal never undoes the others. The reply is `{ succeeded, failed, results }`, with `{ id, ok, version }` for a job that changed and `{ id, ok: false, status, message }` for one that did not. Each change is in the audit log and the job's activity as if it were made on its own. Jobs from another organisation answer 404, so they show as failed rows.

When assigning, the people offered are those who can work at the first ticked job's site. A job at another site where that person can't work is reported as not changed.

Requests, assets and schedules get bulk actions in a later batch.
