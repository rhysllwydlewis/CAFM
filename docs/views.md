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

The screens that use views (the view bar, column chooser and bulk actions) are built in later batches of P1-08.
