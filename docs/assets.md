# Assets

The asset register holds the equipment and fabric in each location, which work orders, planned maintenance and requests will point at. Open **Asset records** on a piece of equipment to see its tags, readings, warranties and documents.

## Using the register

Open **Assets** from the signed-in menu.

- **The register** lists the assets you can see, in reference order, with the location from the site down. The two tiles show how many assets there are and how many are in condition C or D. The **Classification** panel lists the groups and their counts, and selecting one filters the register. On a phone the register comes first and the classification follows it.
- **Search and filters.** Search matches name, reference, active tag codes, serial, make and model. Filter by site, condition, criticality and status, then choose **Apply filters**. **Next page** and **Back to the first page** move through long lists.
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

## Tags and labels

Open **Asset records → Tags** to issue an organisation-unique tag code. In **Print labels**, select individual tags or select all shown. The register’s **Print labels** page covers multiple assets and can be filtered by asset name, reference or tag code. The address shown on the print page comes from the deployment’s public app URL when configured.

- **QR.** Scan with your phone camera. The link stays the same if equipment is renamed or moved.
- **Barcode.** Focus **Scan or enter tag code** on the labels page and scan with a keyboard-wedge Code 128 reader, or type the code.
- **NFC.** Copy the scan link from the tag and write it to the chip as an NDEF URL with an NFC writer. The printed NFC label also includes a QR code.

A scan opens a prefilled [Helpdesk report](helpdesk.md) when the signed-in member can report against that asset. People with register access can view the asset, and technicians with the meter permission can jump to readings. Retiring a lost or replaced tag ends its scan link and reserves its code so a physical tag can never be reassigned by accident.

## Meters

Set the meter name, unit of measure and optional rollover limit. Enter `1000` for a counter that rolls from 999 to 0. Readings are chronological, support up to six decimal places and show both the display value and the cumulative total. Tick **Meter rolled over once since the previous reading** after a wrap. A decrease needs a configured rollover limit and a confirmed wrap. A reading can represent at most one wrap. The history is preserved for subsequent usage-based maintenance.

Recording readings needs `assets.record_readings`. The default technician role can record on assets in its assigned branches. Managers configure meters with `assets.manage`.

## Warranties and documents

Enter the provider, reference, start and expiry dates, then choose how many days in advance to alert. Add claim references, dates and outcomes under the warranty. Turn off **Track expiry** to archive a warranty. The background worker checks at 06:00 UK time and sends one expiry alert per date and eligible asset manager. Alerts appear in the bell inbox, with email and browser push where configured.

Upload JPEG, PNG, WebP or PDF files up to 8 MB each, with up to 20 files on an asset. Documents are downloadable by people who can read that asset. Uploads, tag changes, meter readings, warranties and claims appear in the audit log.

### Attachment storage

Development and demo tenants store file contents in tenant-scoped PostgreSQL records, so resets remove demo files with their parent records. Production uploads for customer organisations require `ATTACHMENT_S3_BUCKET` and `ATTACHMENT_CLAMD_HOST`. Set `ATTACHMENT_S3_REGION` for the bucket, `ATTACHMENT_S3_ENDPOINT` for a custom S3-compatible endpoint, and `ATTACHMENT_CLAMD_PORT` if it differs from 3310. The API uses the AWS SDK credential chain. Grant the workload access to objects under each tenant’s attachment prefix and keep the bucket and scanner private. Set the scanner’s INSTREAM limit to accept the application’s 8 MB limit. A scan error prevents publication. The API checks the parent record’s permissions on each download.

## Known limits

- **Moving a location branch to another site.** The Locations screens let a manager move a branch of floors and rooms to a different site. Assets inside it move with it, so a component or "serves" link could then span two sites. Assets don't check for this yet. It needs a decision on whether such a move should be refused or should carry the assets' links with it.
- **Currencies.** The form handles any currency's decimal places, but nothing yet sets an organisation's default currency, so new assets use pounds.

## Plan limit

The plan sets how many assets can be in use: 100 on Free, 2,500 on Starter, unlimited above. Decommissioned assets don't count, so decommissioning frees a place. Bringing one back needs a free place.

## API

Use the signed-in organisation's session. Assets need the `assets` feature. Reading needs `assets.read`, and creating or editing needs `assets.manage`.

| Request | Behaviour |
| --- | --- |
| `GET /api/assets` | Lists visible assets. Filters: `q` (a literal, case-insensitive search of name, reference, active tag codes, serial, make and model), `locationId` (that location and everything below it), `classId`, `group`, `status`, `criticality` and `condition`. Use `parent=root` for top-level assets or `parent=<id>` for an asset's components. Pass `nextCursor` back as `after`. `limit` defaults to 50 and goes up to 100. |
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

Related API paths use the same signed-in session and scope.

| Request | Behaviour |
| --- | --- |
| `GET /api/assets/:id/operations` | Tags, meters with recent readings, warranties and claims. |
| `POST /api/assets/:id/operations/tags` | Issues a `qr`, `barcode` or `nfc` tag from its `kind` and `code`. |
| `PATCH /api/assets/:id/operations/tags/:tagId/retire` | Disables scans for a tag and retains its code. |
| `GET /api/asset-tags/resolve?id=...` or `?code=...` | Resolves a visible active tag to its permitted destination. |
| `GET /api/asset-tags/labels` | Lists up to 100 active labels matching optional `asset` and `q` filters. |
| `POST /api/assets/:id/operations/meters` | Creates a meter with `name`, `unit` and nullable decimal string `rolloverAt`. |
| `GET /api/assets/:id/operations/meters/:meterId/readings` | Reading history, newest first. Pass the last ISO timestamp as `before` to page back. |
| `POST /api/assets/:id/operations/meters/:meterId/readings` | Takes decimal string `value`, boolean `rolledOver`, a UUID `submission` and an optional ISO timestamp `recordedAt`. Retry with the same submission ID. |
| `POST /api/assets/:id/operations/warranties` and `PATCH …/warranties/:warrantyId` | Saves a warranty. Updates take the last read version. |
| `POST …/warranties/:warrantyId/claims` and `PATCH …/claims/:claimId` | Saves a claim and its outcome. Updates take the last read version. |
| `GET/PUT /api/assets/:id/attachments` | Lists attachments or uploads a single multipart `file`. |
| `GET /api/assets/:id/attachments/:fileId` | Downloads the verified contents of an attachment. |

A location, parent or class from another organisation, or a location or asset outside your assigned branches, returns `404`. Saving a record whose parent is hidden from you with `parentId: null` leaves the real link alone. Every change is recorded in the audit log, and class changes are also kept as configuration versions.
