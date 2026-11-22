# Assets

The asset register holds the equipment and fabric in each location, which work orders, planned maintenance and requests will point at. This page covers what exists so far: the classification, the asset hierarchy, the API and the register and asset screens. Tags and labels, meters, warranties and attachments follow in the next steps of P1-02.

## Using the register

Open **Assets** from the signed-in menu.

- **The register** lists the assets you can see, in reference order, with the location from the site down. The two tiles show how many assets there are and how many are in condition C or D. The **Classification** panel lists the groups and their counts, and selecting one filters the register. On a phone the register comes first and the classification follows it.
- **Search and filters.** Search matches name, reference, serial, make and model. Filter by site, condition, criticality and status, then choose **Apply filters**. **Next page** and **Back to the first page** move through long lists.
- **An asset** shows its status, condition and criticality, its details and the class's own attributes, where it is, what it is part of, its components and how much of its expected life is used. **Edit** and **Add component** are for people who can manage assets. A component starts from its parent and the parent's location.
- **Adding or editing** takes the name, location, class, status, criticality, condition and details. Choose the location and any parent by searching. The replacement cost is typed in the asset's currency (pounds unless it was saved in another) and stored as whole minor units, such as pence. **Part of** and **Clear** change or remove the parent, and **Change** keeps the current choice until you pick a new one. Choosing a class shows its attributes, and required ones must be filled in.
- **What it serves.** The **Serves** card lists the places and assets an asset supplies, and the assets that serve it. It also says what is affected if the asset goes out of service: the other assets that depend on it (following the links onwards) and the places they serve. People who can manage assets use **Edit what it serves** to search for places and assets, add or remove them, and save the whole set.
- A missing asset, and one in another organisation, show the same "Asset not found" page.

## How assets are organised

- **Location.** Every asset sits in a location inside a site, such as a plant room or the site itself. An asset is visible to anyone who can see its location, so a member limited to one building sees only that building's assets.
- **Hierarchy.** An asset can have a parent, so a system holds its assets and an asset holds its components. A component must be in the same site as its parent. An asset can't be placed under one of its own components. A system with live components can't be decommissioned. An asset that has components, or that serves or is served by others, can't move to another site until they are dealt with, because both stay within one site.
- **Reference.** Each asset gets a reference such as `AST-00214` when it is created. It is never reused or changed, and each organisation numbers from its own sequence. The format can be changed under the numbering settings, for example `AST-{SITE}-{00000}` to include the site code.
- **Class.** A class puts an asset in the classification, such as Boilers under "Heating & hot water". The group is the heading the register lists it under. A class can carry attributes, like Output in kW for a boiler, which every asset of that class then records.
- **Status, condition and criticality.** Status is in service, out of service, alarm, spare or decommissioned. Condition is graded A (as new) to D (poor). Criticality is low, medium, high or critical.
- **Money.** The replacement cost is stored in whole pence with a currency code, never as a decimal.
- **Custom fields.** Active asset custom fields (settings) appear on the asset and are validated like any other.

The demo organisation uses a classification with the scheme `custom`, because codes from the standard schemes (Uniclass 2015, NRM 3, SFG20) belong to each organisation to add. Importing them is part of P1-11.

## What an asset serves

An asset can serve places (a floor or room) and other assets: AHU-1 serves Floor 2, and the heating system serves AHU-1. Everything must be in the asset's own site, and an asset can't serve itself. Impact analysis follows the links from an asset to the assets that depend on it, however many steps away, and then to the places they serve. A loop of assets serving each other is allowed and won't hang it. People only see the places and assets inside their branches, and links to anything outside them are left untouched when they save.

## Known limits

- **Moving a location branch to another site.** The Locations screens let a manager move a branch of floors and rooms to a different site. Assets inside it move with it, so a component or "serves" link could then span two sites. Assets don't check for this yet. It needs a decision on whether such a move should be refused or should carry the assets' links with it.
- **Currencies.** The form handles any currency's decimal places, but nothing yet sets an organisation's default currency, so new assets use pounds.

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
| `GET /api/assets/:id/serves` | The places and assets this asset serves, and the assets that serve it, limited to what you can see. |
| `PUT /api/assets/:id/serves` | Replaces what the asset serves with `{ "locationIds": [...], "assetIds": [...] }`. Everything must be visible to you and in the asset's site (`422` otherwise, with `serves_self` or `serves_other_site`). Links to things outside your branches are kept. |
| `GET /api/assets/:id/impact` | Every asset that depends on this one, nearest first with its distance, and every place those assets serve. |
| `GET /api/asset-classes` | The classes. Add `includeInactive=true` (managers only) to include retired ones. |
| `POST /api/asset-classes` | Adds a class from `scheme` (`uniclass`, `nrm`, `sfg20` or `custom`), `code`, `name`, `group` and an optional `attributes` template. |
| `PATCH /api/asset-classes/:id` | Changes a class's name, group, attributes or position, or retires it with `active: false`. Retiring stops new use but keeps assets that have it. |

A location, parent or class from another organisation, or a location or asset outside your assigned branches, returns `404`. Saving a record whose parent is hidden from you with `parentId: null` leaves the real link alone. Every change is recorded in the audit log, and class changes are also kept as configuration versions.
