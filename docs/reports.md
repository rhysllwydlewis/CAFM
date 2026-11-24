# Reports

Standard reports are fixed queries over the jobs a person may already see (their sites and own-work scope). They need the `reports` feature (Starter plan) and the `reports.read` permission. The API is under `/api/reports`; the screen is **Reports** in the menu.

| Report | Endpoint | What it counts |
|---|---|---|
| Open jobs by age | `GET /api/reports/open-jobs-by-age` | Jobs not yet finished, in bands of days since they were logged. Optional `locationId`. |
| SLA performance | `GET /api/reports/sla-performance` | Jobs completed in the period that had a fix target, and how many met it, overall and by priority. `from` and `to` are UK days; the default is the last 30. |
| PPM compliance | `GET /api/reports/ppm-compliance` | Planned visits due in the period: done on time, done late (completed on a later UK day than due), overdue, still to come. Cancelled visits are left out. |

The home page shows three key-figure tiles (open work orders, SLA met, PPM on time) to anyone who can read reports. Each links to the Reports screen.

Not built yet: the executive dashboard, per-role dashboard layouts, and the report builder (Phase 4).
