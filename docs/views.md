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

Each of the four lists has a **Saved view** bar above its filters. Pick a view to open the list with its filters (the address carries them, so it can be bookmarked), choose **Save current filters as a view** to keep what you are looking at, and delete a view you own (or a shared one, if you can share). The bar saves the filters in the address and the layout (list or board). Sort, grouping and a column chooser, bulk actions, and kanban and calendar layouts for the other lists are built in later batches of P1-08.

## Sorting the work order list

`GET /api/work-orders` takes `sort` (`created`, `priority`, `number` or `title`) and `dir` (`asc` or `desc`). The default is newest first. Only columns that are never empty are offered, so paging with the cursor never skips or repeats a job. The work order screen has **Sort by** and **Sort order** controls; because they live in the address, a saved view keeps them. 
## Sorting the other lists

The same **Sort by** and **Sort order** controls are on the other three lists, and a saved view keeps them.

| List | Endpoint | `sort` values | Default |
|---|---|---|---|
| Requests | `GET /api/helpdesk/requests` | `created`, `priority`, `number`, `title` | newest first |
| Assets | `GET /api/assets` | `created`, `number`, `name` | oldest first, as before |
| Planned maintenance schedules | `GET /api/ppm/schedules` | `number`, `title`, `priority` | by reference |

Requests and assets page with a cursor on a column that is never empty, with the id to break ties. Schedules page with `offset`. An unknown `sort` is refused with 400. Grouping and the column chooser come in a later batch.
