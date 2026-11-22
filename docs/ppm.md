# Planned preventive maintenance (PPM)

Maintenance that is done on a schedule, not when something breaks. This page covers how it works and the API. The planner, forecast and compliance screens follow in the next P1-05 sub-item (see [PROGRESS](PROGRESS.md)).

## The task library

A **task** is a reusable piece of maintenance: what is done, how long it takes, the skills it needs, safety notes, how critical it is, and its steps.

- **Criticality** is statutory, mandatory, optimal or discretionary.
- **Steps** are the same four kinds as a job checklist: a tick, pass or fail, a reading with a unit, or a comment, each optional or required.
- Changing a task changes the jobs raised from then on. Jobs already raised keep the steps they were given.
- A task that an active schedule uses can't be retired. Retiring a task frees its name.

`GET /api/ppm/templates` (add `?retired=1` to include retired ones), `POST`, `PUT /{id}` (with the `version` read), `DELETE /{id}`. Reading needs `ppm.read`; changing needs `ppm.manage`. Everything needs the Planned maintenance feature on the plan.

## Schedules

A **schedule** says when a task is done and on which assets. It takes the next number (`PPM-0142`).

| Setting | Meaning |
| --- | --- |
| Frequency | **Calendar** (every N days, weeks, months or years) or **meter** (every N units on a named meter on each asset, such as every 1,000 run hours). |
| Fixed or floating | Fixed unless you say otherwise, and floating for a meter. **Fixed** visits keep their dates: each is counted from the first date, so a visit on the 31st is on the last day of a shorter month and back on the 31st the month after. **Floating** visits are due a set time after the last visit was done. A meter schedule is always floating. |
| Starts on | The first visit, and the date every later fixed visit is counted from. A fixed schedule that started in the past carries on from its next date and does not raise a backlog. |
| Lead time | Jobs are raised this many days before they fall due (default 28). |
| Priority, duration, assignee, estimated cost | What the jobs are raised with, and what the forecast will use. Money is in whole pence, and the estimated cost is shown and changed only by people who can see costs (`costs.read`): for everyone else it is hidden, and editing the rest of a schedule leaves it as it was. |

Each asset on a schedule has its own next visit, last visit and open job. An asset taken off a schedule keeps its history. Putting an asset on a meter schedule needs a meter of that name on it, and its first visit is a full interval on from where the meter stands now.

Changing how often, from when, or fixed against floating works each asset's next visit out again; other edits leave the dates alone. Jobs already raised are left alone. The assignee must be able to do jobs at every place the schedule's assets are. The asset on a planned maintenance job can't be changed, because doing the visit on another would count for the wrong one.

`GET /api/ppm/schedules` (filters `q`, `criticality`, `discipline`, `status=active|archived|all`, `limit`, `offset`), `GET /{id}`, `POST`, `PUT /{id}` (with `version`), `PUT /{id}/assets` (with `version`). A schedule is archived by setting `active` to false. People limited to some sites see only schedules with an asset on their sites, and only those assets. Changing schedules needs access to every location.

## Raising jobs

The generator raises a work order for each visit that falls due within its lead time, and moves the schedule on.

- It runs **every hour** in the worker, for every organisation with planned maintenance, so a new schedule or a meter reading that makes a visit due is picked up within the hour. **Generate now** (`POST /api/ppm/schedules/{id}/generate`, or `POST /api/ppm/generate` for everything) does it straight away.
- The generator looks at each active asset on an active schedule in batches, and only at those with a visit within a year (or a meter reading to check). A visit is raised **once**: the asset and the due day are unique, so running it again, or two runs at once, change nothing.
- At most 12 visits per asset are raised in one run, so a daily schedule with a long lead time doesn't flood the list. The rest follow on later runs.
- Each job has type PPM, the schedule's priority and assignee (only if that person can still do jobs at the asset's place; otherwise it is left for someone to assign), a fix target of the end of the due day (in the site's time zone), and a **checklist copied from the task's steps that holds back completing the job** (see [Work orders](work-orders.md#checklists)). The description carries the task's notes, skills and safety notes. The job page says which schedule it came from.
- When the job is **completed**, a fixed schedule keeps its dates and remembers the last visit; a floating one is now due a set time after the visit (from the meter's reading, for a meter schedule). When it is **cancelled**, a floating schedule counts on from the day the visit was due, so it doesn't wait for ever.

## Not built yet

- The planner, calendar and forecast screens, and the compliance KPI (the next sub-item).
- SFG20 import, condition-based schedules, seasonal rules, shutdown and outage planning.
- Combining tasks into one visit (nested frequencies, such as a 12-monthly visit replacing that month's monthly one), grouping by route or contractor, and one job for several assets.
- Contractor assignment of PPM jobs (jobs go to a person), custom fields on schedules, and recording asset condition at each visit.
