# Import and export

Estate data can be downloaded as CSV files. Locations, assets and people can be imported from CSV (below). PPM schedules and the import screens come in later batches of P1-11.

## Exports

| Data | Endpoint | Permission | What you get |
|---|---|---|---|
| Locations | `GET /api/locations/export` | `locations.read` | Code, name, kind, status, parent code, address, use class, areas and the active custom fields (`custom.<key>`). |
| Assets | `GET /api/assets/export` | `assets.read` | Asset number, class, location, parent number, money as integer minor units with a currency column, and custom fields. |
| People | `GET /api/people/export` | `people.read` | Name, email, role and status. |
| PPM schedules | `GET /api/ppm/schedules/export` | `ppm.read` (plan feature `ppm`) | Number, title, discipline, criticality, frequency, mode, active, asset count, next due date and assignee. |

Rules that apply to every export:

- It returns only what the person can already see. Site limits, own-record scope and delegated administration apply exactly as they do on the matching list.
- It stops at 5,000 rows, so one request cannot read an unbounded estate.
- Cells that start with `=`, `+`, `-`, `@`, a tab or a carriage return get a leading apostrophe, so a spreadsheet does not read them as a formula. Values with a comma, quote or line break are quoted.
- Each export is recorded in the audit log (`location.exported`, `asset.exported`, `people.exported`, `ppm.schedule.exported`) with the number of rows.
- Files are sent with `Cache-Control: no-store`.

## Importing locations

The API is ready. The screens come in a later batch.

| Step | Endpoint | What it does |
|---|---|---|
| Template | `GET /api/locations/import/template` | The header row, with a `custom.<key>` column for each active custom field. |
| Check | `POST /api/locations/import/preview` | Reads the file and lists every problem with its line and column. Saves nothing. Add `?format=csv` for the error report as a file. |
| Import | `POST /api/locations/import` | Makes the locations. All or nothing: a file with any problem makes none. |
| Recent imports | `GET /api/locations/import/batches` | The last 20 imports. |
| Roll back | `POST /api/locations/import/<id>/rollback` | Removes what an import made. |

The body is `{ "csv": "<the file's text>", "fileName": "estate.csv" }`. A file can hold up to 1,000 rows and about 90,000 characters (the API reads JSON bodies up to 600 kB, which covers JSON escaping).

Rules:

- Columns match the export, so an exported file imports into another organisation unchanged. `code`, `name` and `kind` are needed. Unknown or repeated columns are reported.
- Import only adds. A code that already exists is a problem, never an update.
- `parent_code` names a row in the same file or a location that already exists. Rows can come in any order, and parents are made first. The same rules as the screen apply: levels run from the top down, and everything below a site sits inside a site.
- Custom fields are checked as they are on the location form, including required fields. Several choices in one cell are separated by semicolons, and yes or no can be written `yes`, `no`, `true` or `false`.
- Your plan's site limit applies to the whole file.
- It needs `locations.manage` across the whole organisation. A manager limited to some sites cannot import.
- Roll back works only while the import's locations are untouched: none edited, and nothing (assets, requests, work orders or other locations) placed in them. Otherwise it is refused and nothing changes.
- The import and the rollback are each one audit event (`location.imported`, `location.import_rolled_back`) with the number of rows.

## Importing assets

Same flow as locations. The API is ready and the screens come in a later batch.

| Step | Endpoint | What it does |
|---|---|---|
| Template | `GET /api/assets/import/template` | The header row, with a `custom.<key>` column for each active custom field. |
| Check | `POST /api/assets/import/preview` | Lists every problem with its line and column. Saves nothing. Add `?format=csv` for the error report. |
| Import | `POST /api/assets/import` | Makes the assets. All or nothing. |
| Recent imports | `GET /api/assets/import/batches` | The last 20 asset imports. |
| Roll back | `POST /api/assets/import/<id>/rollback` | Removes what an import made. |

All of them need `assets.manage` and the Assets feature.

Columns: `ref`, `name`, `location_code`, `parent`, `class`, `status`, `make`, `model`, `serial`, `installed_on`, `supplier`, `expected_life_years`, `replacement_cost_minor`, `currency`, `criticality`, `condition`, then `custom.<key>` and `attr.<key>` columns.

- `name` and `location_code` are needed. The location must be one you can see and must sit inside a site.
- Asset numbers are made for you, in the same way as when you add an asset by hand. They are never reused, so a rolled-back import still uses up its numbers.
- `ref` is a label for the row. Another row's `parent` can name it, which lets a file add a system and its components together. `parent` can also be the number of an asset that already exists (such as AST-00214). A component must be in the same site as its parent. Rows can be in any order; parents are made first.
- `class` is a class's code or name (for example `BOILER` or `Boilers`). `attr.<key>` columns hold the class's attributes and are checked against that class, including required attributes.
- Money is whole pence in `replacement_cost_minor` with a three-letter `currency` (GBP if left blank). `installed_on` is `YYYY-MM-DD`. Status, criticality and condition use the same values as the asset form.
- Your plan's asset limit applies to the whole file. Decommissioned assets do not count.
- An exported file imports into another organisation once its first columns are renamed: `number` to `ref` and `parent_number` to `parent`.
- Roll back works only while the import's assets are untouched: none edited, and none has requests, work orders, PPM schedules, links, tags, meters, warranties, files or components outside the import. A manager who cannot see all of the assets cannot roll the import back.
- The import and the rollback are each one audit event (`asset.imported`, `asset.import_rolled_back`) with the number of rows.

## Importing people

People are imported as invitations. Nobody gets an account until they accept, and they choose their own name and password then. The API is ready and the screens come in a later batch.

| Step | Endpoint | What it does |
|---|---|---|
| Template | `GET /api/people/import/template` | The header row: `email,role`. |
| Check | `POST /api/people/import/preview` | Lists every problem with its line and column. Saves and sends nothing. Add `?format=csv` for the error report. |
| Import | `POST /api/people/import` | Sends the invitations. All or nothing. |
| Recent imports | `GET /api/people/import/batches` | The last 20 people imports. |
| Withdraw | `POST /api/people/import/<id>/rollback` | Withdraws the invitations nobody has used yet. |

All of them need `people.invite` across the whole organisation, as the invite form does.

- `email` and `role` (the role's key, such as `technician`) are needed. Other columns are reported. An exported people file needs its `name` and `status` columns removed first.
- The same rules as the invite form apply to every row: you cannot give a role beyond what you hold, an address that is already a member is a problem, and full-licence roles must fit the seats your plan has left (counted across the whole file).
- A new invitation replaces an earlier pending one to the same address. The same address twice in a file is a problem.
- Each person gets the usual invitation email, which works for 7 days.
- Withdrawing works only while nobody from the import has accepted. Emails already sent cannot be unsent, but their links stop working.
- The import and the withdrawal are each one audit event (`people.imported`, `people.import_rolled_back`) with the number of rows.

## Importing PPM schedules

Schedules are imported as new schedules. The API is ready and the screens come in a later batch.

| Step | Endpoint | What it does |
|---|---|---|
| Template | `GET /api/ppm/schedules/import/template` | The header row. |
| Check | `POST /api/ppm/schedules/import/preview` | Lists every problem with its line and column. Saves nothing. Add `?format=csv` for the error report. |
| Import | `POST /api/ppm/schedules/import` | Makes the schedules. All or nothing. |
| Recent imports | `GET /api/ppm/schedules/import/batches` | The last 20 schedule imports. |
| Undo | `POST /api/ppm/schedules/import/<id>/rollback` | Removes what the import made. |

All of them need `ppm.manage`, the planned maintenance feature on your plan, and access to every location, as the schedule form does.

- Columns: `title`, `discipline`, `criticality`, `frequency_type` (`calendar` or `meter`), `interval`, `unit_or_meter` (`day`, `week`, `month` or `year` for a calendar schedule, the meter's name for a meter one), `mode` (`fixed` or `floating`), `starts_on` (`YYYY-MM-DD`), `duration_minutes`, `lead_days`, `priority` (1 to 4) and `assets`. `title`, `frequency_type`, `interval`, `unit_or_meter`, `starts_on` and `duration_minutes` must be filled in. The other columns may be left out, and their cells may be empty. They take the same defaults as the form.
- `assets` lists asset numbers separated by semicolons. Each must be an asset in service that you can see, and a meter schedule's assets must each have a meter of that name.
- Every row follows the schedule form's rules, so a meter schedule is always counted from the last visit.
- Task library links, assignees and estimated costs are not imported. Set them on the schedule afterwards.
- Undo works only while none of the schedules has been edited and none has raised a job.
- The import and the undo are each one audit event (`ppm_schedule.imported`, `ppm_schedule.import_rolled_back`) with the number of rows.
