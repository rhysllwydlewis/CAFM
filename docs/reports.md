# Reports

Standard reports are fixed queries over the jobs a person may already see (their sites and own-work scope). They need the `reports` feature (Starter plan) and the `reports.read` permission. The API is under `/api/reports`; the screen is **Reports** in the menu.

| Report | Endpoint | What it counts |
|---|---|---|
| Open jobs by age | `GET /api/reports/open-jobs-by-age` | Jobs not yet finished, in bands of days since they were logged. Optional `locationId`. |
| SLA performance | `GET /api/reports/sla-performance` | Jobs completed in the period that had a fix target, and how many met it, overall and by priority. `from` and `to` are UK days; the default is the last 30. |
| PPM compliance | `GET /api/reports/ppm-compliance` | Planned visits due in the period: done on time, done late (completed on a later UK day than due), overdue, still to come. Cancelled visits are left out. |
| Reactive and planned work | `GET /api/reports/work-mix` | Jobs raised in the period (default the last 30 UK days), reactive against planned (PPM), and the reactive share. |
| Busiest sites | `GET /api/reports/busiest-sites` | The five sites with the most jobs raised in the period, counting jobs at places below each site. |

The **Executive overview** (Reports, then Executive overview) puts the key figures and the busiest sites on one page for the last 30 days. Cost, satisfaction and carbon figures from the mockup arrive with those modules.

## Home page key figures by role

The home page shows fixed key figures that suit the role, from `GET /api/home/summary`. Each block appears only when the role's permission and the plan allow it, and every count is over the sites and jobs the person may already see.

| Tile | Who sees it | Shows |
|---|---|---|
| Your open jobs (technician, contractor) or Open work orders | `work_orders.read` | Open jobs, how many are past their fix target, how many are due today (UK day). |
| Unassigned jobs | `work_orders.read`, not limited to own work | Open jobs with nobody assigned. |
| New requests | `requests.manage` | Requests still to triage, and those past their response target. |
| Cost, last 30 days | `costs.read` and `work_orders.read` | Cost entered in the last 30 days per currency (whole minor units, shown as money) and jobs that went over their limit. |
| SLA met, PPM on time | `reports.read` | The two report figures, each linking to Reports. |

Not built yet: configurable dashboards and the report builder (Phase 4).
