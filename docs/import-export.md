# Import and export

Estate data can be downloaded as CSV files. Locations can be imported from CSV (below). Assets, people and PPM schedules, and the import screens, come in later batches of P1-11.

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
