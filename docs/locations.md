# Locations API

Use the signed-in organisation's session for all location requests. Locations need the `locations` feature. Reading needs `locations.read`, and creating or editing needs `locations.manage`.

| Request | Behaviour |
| --- | --- |
| `GET /api/locations` | Lists visible locations. Use `q` for a literal, case-insensitive search of names and codes, or `kind` to select a level. Pass `nextCursor` back as `after` to fetch the next page. `limit` defaults to 50 and goes up to 100. |
| `GET /api/locations/:id` | Returns one visible location. A parent outside your assigned branch is omitted from the visible hierarchy. |
| `POST /api/locations` | Creates a location from `name`, `code`, `kind` and optional `parentId`, `status` and `custom`. Codes are unique within the organisation. |
| `PATCH /api/locations/:id` | Changes fields using the `version` from the most recent read. Reload after a `409` before retrying. |
| `PUT /api/locations/access/:membershipId` | Replaces access for a member with `{ "locationIds": [...] }`. Each ID grants access to that location and its descendants. `[]` grants nothing. `null` removes the explicit restriction and returns the member to role-based defaults. |

Send the custom fields you want to change in `custom`. Omitted values carry forward. Set an optional field to `null` to clear it. Retired fields are kept in storage and hidden from location responses. Sending back a scoped record's hidden parent as `null` preserves its parent link.

A portfolio or region can contain sites. Buildings, floors, zones and spaces belong inside a site. Intermediate levels can be omitted. New sites count towards the organisation's site limit, even when their status changes. Members with organisation-wide location management can move a branch. Scoped location managers can add and edit locations within their assigned branches.

Assigning access requires organisation-wide location access and both `locations.manage` and `people.manage`. The existing rules on who can manage roles and demo personas also apply. A location outside the current organisation or assigned branches returns `404`.

Super Users have organisation-wide location access. Any saved branch restrictions apply again if they leave the Super User role.
