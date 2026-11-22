# Assets

The asset register holds the equipment and fabric in each location, which work orders, planned maintenance and requests will point at. This page covers what exists so far: the classification, the asset hierarchy and the API. The register and asset screens, "serves" relationships, tags, meters, warranties and attachments follow in the next steps of P1-02.

## How assets are organised

- **Location.** Every asset sits in a location inside a site, such as a plant room or the site itself. An asset is visible to anyone who can see its location, so a member limited to one building sees only that building's assets.
- **Hierarchy.** An asset can have a parent, so a system holds its assets and an asset holds its components. A component must be in the same site as its parent. An asset can't be placed under one of its own components. A system with live components can't be decommissioned, and can't move to another site without them.
- **Reference.** Each asset gets a reference such as `AST-00214` when it is created. It is never reused or changed, and each organisation numbers from its own sequence. The format can be changed under the numbering settings, for example `AST-{SITE}-{00000}` to include the site code.
- **Class.** A class puts an asset in the classification, such as Boilers under "Heating & hot water". The group is the heading the register lists it under. A class can carry attributes, like Output in kW for a boiler, which every asset of that class then records.
- **Status, condition and criticality.** Status is in service, out of service, alarm, spare or decommissioned. Condition is graded A (as new) to D (poor). Criticality is low, medium, high or critical.
- **Money.** The replacement cost is stored in whole pence with a currency code, never as a decimal.
- **Custom fields.** Active asset custom fields (settings) appear on the asset and are validated like any other.

The demo organisation uses a classification with the scheme `custom`, because codes from the standard schemes (Uniclass 2015, NRM 3, SFG20) belong to each organisation to add. Importing them is part of P1-11.

## Plan limit

The plan sets how many assets can be in use: 100 on Free, 2,500 on Starter, unlimited above. Decommissioned assets don't count, so decommissioning frees a place. Bringing one back needs a free place.

## API

Use the signed-in organisation's session. Assets need the `assets` feature. Reading needs `assets.read`, and creating or editing needs `assets.manage`.

| Request | Behaviour |
| --- | --- |
| `GET /api/assets` | Lists visible assets. Filters: `q` (a literal, case-insensitive search of name, reference, serial, make and model), `locationId` (that location and everything below it), `classId`, `group`, `status`, `criticality` and `condition`. Use `parent=root` for top-level assets or `parent=<id>` for an asset's components. Pass `nextCursor` back as `after`. `limit` defaults to 50 and goes up to 100. |
| `GET /api/assets/summary` | The counts above the register: total, maintainable, condition C or D, and a count per classification group. Decommissioned assets are left out. |
| `GET /api/assets/custom-fields` | The active asset field definitions. |
| `GET /api/assets/:id` | One visible asset, with its parent, site and component count. |
| `POST /api/assets` | Creates an asset from `name` and `locationId`, with optional `parentId`, `classId`, `status`, `make`, `model`, `serial`, `installedOn` (`YYYY-MM-DD`), `supplier`, `expectedLifeYears`, `replacementCost` (`{ "amountMinor": 1850000, "currency": "GBP" }`), `criticality`, `condition`, `attributes` and `custom`. The reference is issued by the server. |
| `PATCH /api/assets/:id` | Changes fields, using the `version` from the latest read. Reload after a `409`. Set an optional field to `null` to clear it. Changing the class starts the attributes afresh. |
| `GET /api/asset-classes` | The classes. Add `includeInactive=true` (managers only) to include retired ones. |
| `POST /api/asset-classes` | Adds a class from `scheme` (`uniclass`, `nrm`, `sfg20` or `custom`), `code`, `name`, `group` and an optional `attributes` template. |
| `PATCH /api/asset-classes/:id` | Changes a class's name, group, attributes or position, or retires it with `active: false`. Retiring stops new use but keeps assets that have it. |

A location, parent or class from another organisation, or a location or asset outside your assigned branches, returns `404`. Saving a record whose parent is hidden from you with `parentId: null` leaves the real link alone. Every change is recorded in the audit log, and class changes are also kept as configuration versions.
