# Import and export

Estate data can be downloaded as CSV files. Import (template, column mapping, validation preview, error report and rollback) comes in a later batch of P1-11.

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
