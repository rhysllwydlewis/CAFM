# Locations

Open **Locations** from the signed-in menu. Expand a branch or search by name or code. Select a location to see where it sits (the path above its name), its details, the levels underneath it and, for sites, its business calendar. The hierarchy opens along that path, and every list is in name order. Location managers can add and edit records within their scope. Tenant-wide managers can create sites and move branches. Any active location custom fields appear in the editor and in location details when a value is saved.

Enter coordinates to place a site on the **Portfolio map**. The same filters apply to the map and the site list. The list also includes sites without coordinates. Status reflects the location's operational state. Compliance colouring depends on the compliance register in Phase 2A.

Use **Edit calendar** to set a site's jurisdiction, time zone, weekly opening windows and date ranges for custom closures. The ends of closure ranges are included. Split overnight opening into two windows, ending the first at 24:00. England and Wales share a bank holiday calendar. Scotland and Northern Ireland use their own published calendars. The bundled dataset covers 2019–2028. Refresh it from GOV.UK when dates are added or changed. Contains public sector information licensed under the Open Government Licence v3.0. [GOV.UK data](https://www.gov.uk/bank-holidays.json) · [Licence](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)

The shared `siteBusinessHoursOn` function resolves openings for a site-local date and gives the future SLA clock one place to evaluate closures and bank holidays. Convert an instant into the site's time zone before calling it.

Select **QR labels** to choose and print one or more labels. Labels carry the organisation's own address (`APP_URL`, or Railway's public domain), not whichever address you printed from, and the page shows it before you print. Without either set, they use the address the page was opened at. Each QR points to the same location ID even after a rename or move. It returns authorised users to the location after sign-in. The Helpdesk batch (P1-03) will use this same scan link to prefill fault reporting.

## API

Use the signed-in organisation's session for all location requests. Locations need the `locations` feature. Reading needs `locations.read`, and creating or editing needs `locations.manage`.

| Request | Behaviour |
| --- | --- |
| `GET /api/locations` | Lists visible locations. Use `q` for a literal, case-insensitive search of names and codes, or `kind` and `status` to filter records. Use `parent=root` for visible roots or `parent=<id>` for immediate children. Results are in name order. Pass `nextCursor` back as `after` to fetch the next page; a cursor that no longer points at a visible location returns `400`. `limit` defaults to 50 and goes up to 100. |
| `GET /api/locations/custom-fields` | Returns the active location field definitions used by the editor. |
| `GET /api/locations/:id` | Returns one visible location, with `path`: its ancestors from the top down. A parent outside your assigned branch is omitted from the visible hierarchy and from `path`. |
| `POST /api/locations` | Creates a location from `name`, `code`, `kind` and optional `parentId`, `status` and `custom`. Codes are unique within the organisation. `details` holds site attributes and `siteCalendar` holds calendar settings. |
| `PATCH /api/locations/:id` | Changes fields using the `version` from the most recent read. Reload after a `409` before retrying. A supplied `details` or `siteCalendar` object replaces its previous snapshot. |
| `PUT /api/locations/access/:membershipId` | Replaces access for a member with `{ "locationIds": [...] }`. Each ID grants access to that location and its descendants. `[]` grants nothing. `null` removes the explicit restriction and returns the member to role-based defaults. |

Send the custom fields you want to change in `custom`. Omitted values carry forward. Set an optional field to `null` to clear it. Retired fields are kept in storage and hidden from location responses. Sending back a scoped record's hidden parent as `null` preserves its parent link.

Levels run Portfolio, Region, Site, Building, Floor, Zone and Space. Levels can be skipped (a floor can sit straight under a site) but not inverted, so a building can't go inside a room. Zones can contain zones and spaces can contain spaces. A portfolio or region can contain sites. Buildings, floors, zones and spaces belong inside a site. Only organisation-wide managers create portfolios, regions and sites. New sites count towards the organisation's site limit, even when their status changes. Members with organisation-wide location management can move a branch. Scoped location managers can add and edit locations within their assigned branches.

Assigning access requires organisation-wide location access and both `locations.manage` and `people.manage`. The existing rules on who can manage roles and demo personas also apply. A location outside the current organisation or assigned branches returns `404`.

Super Users have organisation-wide location access. Any saved branch restrictions apply again if they leave the Super User role.

Restricted access instructions are returned only by the detail API for location managers who can see the record. They are omitted from lists, map and label data, and audit values.
