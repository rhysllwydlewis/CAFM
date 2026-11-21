# 05 · Data Model (Core Entities)

The conceptual model. Physical schema lives in `packages/db/prisma/schema.prisma`. Conventions:

- Every tenant-owned table has `id` (UUID v7), `tenant_id`, `created_at/by`, `updated_at/by`, `deleted_at` (soft delete), `version` (optimistic locking), and `custom` (JSONB custom fields) where configurable.
- Money is stored as integer minor units + currency code. Times are stored in UTC; site time zone is applied for SLA calculations.
- Human-friendly references (`WO-000123`) come from per-tenant sequences.

## Platform & identity

| Entity | Key fields / notes |
|--------|--------------------|
| `tenant` | name, slug, status (trial/active/suspended), plan, region, branding, settings |
| `plan`, `entitlement`, `tenant_entitlement_override`, `addon_subscription` | feature keys and limits |
| `usage_meter` | tenant, meter key, period, quantity |
| `user` | email (unique per tenant), name, status, licence_type, locale, time zone, MFA settings |
| `credential`, `session`, `mfa_factor`, `password_reset`, `sso_connection` | auth |
| `role`, `permission`, `role_permission`, `user_role` (with scope) | RBAC + scope |
| `team`, `team_member` | groups for assignment and scoping |
| `organisation` | contractor companies, suppliers, clients (type flag) |
| `api_key`, `oauth_client`, `webhook_endpoint`, `webhook_delivery` | integration |
| `audit_event` | actor, action, entity, before/after diff, ip, user agent (append-only, partitioned by month) |

## Configuration

| Entity | Notes |
|--------|-------|
| `field_definition` | entity type, key, type, options, validation, visibility rules |
| `form_layout` | entity type, sub-type, role, JSON layout |
| `workflow_definition`, `workflow_state`, `workflow_transition` | per entity type |
| `automation_rule`, `automation_run` | trigger/conditions/actions JSON, logs |
| `sla_policy`, `sla_target`, `business_calendar`, `holiday` | |
| `priority`, `category`, `problem_code` | request catalogue |
| `numbering_sequence`, `picklist`, `term_override`, `notification_template` | |
| `config_version` | snapshot/diff of any config object |

## Estate & assets

| Entity | Notes |
|--------|-------|
| `location` | tree (ltree path or closure table), level type, address, geo (PostGIS), area, calendar |
| `floor_plan`, `space` | plan file, SVG, space polygons, room type, capacity, department |
| `asset_class` | classification code (Uniclass/NRM/SFG20/custom), attribute template |
| `asset` | class, location, parent asset, make/model/serial, install date, criticality, condition, status, warranty, tags |
| `asset_tag` | QR/barcode/NFC values |
| `meter`, `meter_reading` | asset or location meters |
| `condition_survey`, `survey_item`, `defect` | |
| `document`, `document_version`, `document_link` | linked to any entity |

## Work management

| Entity | Notes |
|--------|-------|
| `request` | requester, channel, category, location, asset, description, priority, status |
| `work_order` | type (reactive/PPM/project/inspection), status, priority, location, asset, assignee(s), contractor org, SLA due dates, NTE, costs, client/contract |
| `work_order_task`, `checklist_response` | steps and form answers |
| `labour_entry`, `parts_usage`, `expense` | costs |
| `ppm_task_template`, `ppm_schedule`, `ppm_schedule_asset` | frequency, rules, next due |
| `quote`, `quote_line` | |
| `comment`, `attachment`, `signature`, `activity` | polymorphic link to any entity |
| `sla_clock` | per record: target type, due, paused intervals, breached_at |

## Compliance & safety

| Entity | Notes |
|--------|-------|
| `compliance_type` | template (legislation ref, frequency, evidence required) |
| `compliance_requirement` | type × location/asset, responsible, contractor, next due |
| `certificate` | file, issue/expiry, result, extracted data |
| `remedial_action` | from certificate/inspection/audit, severity, linked work order |
| `inspection_template`, `inspection`, `inspection_answer` | audits |
| `incident`, `investigation`, `capa_action`, `risk`, `risk_assessment`, `rams`, `permit` | |

## Commercial

| Entity | Notes |
|--------|-------|
| `contract`, `contract_sla`, `kpi`, `kpi_result`, `deduction` | |
| `accreditation`, `insurance_policy` | for organisations |
| `part`, `store`, `stock_level`, `stock_movement`, `kit` | inventory |
| `requisition`, `purchase_order`, `po_line`, `goods_receipt`, `supplier_invoice` | procurement |
| `cost_centre`, `budget`, `budget_line`, `rate_card`, `sor_item` | finance |
| `client_invoice`, `client_invoice_line` | billing (FM providers) |

## Workplace, energy, real estate, other

`booking`, `bookable_resource`, `visitor`, `visit`, `move_request`, `utility_meter`, `consumption`, `utility_bill`, `emission_factor`, `carbon_record`, `waste_record`, `property`, `lease`, `lease_event`, `rent_schedule`, `service_charge`, `project`, `project_task`, `capital_request`, `vehicle`, `key`, `key_issue`, `device`, `telemetry` (time-series), `alert_rule`, `alert`, `survey`, `survey_response`, `ai_interaction`.

## Relationship overview

```mermaid
erDiagram
  TENANT ||--o{ USER : has
  TENANT ||--o{ LOCATION : owns
  LOCATION ||--o{ LOCATION : contains
  LOCATION ||--o{ ASSET : houses
  ASSET ||--o{ ASSET : "parent of"
  ASSET_CLASS ||--o{ ASSET : classifies
  USER ||--o{ REQUEST : raises
  REQUEST ||--o{ WORK_ORDER : "converted to"
  PPM_SCHEDULE ||--o{ WORK_ORDER : generates
  WORK_ORDER }o--|| LOCATION : at
  WORK_ORDER }o--o| ASSET : on
  WORK_ORDER }o--o| ORGANISATION : "assigned contractor"
  WORK_ORDER ||--o{ LABOUR_ENTRY : records
  WORK_ORDER ||--o{ PARTS_USAGE : consumes
  WORK_ORDER ||--o{ SLA_CLOCK : tracked_by
  COMPLIANCE_REQUIREMENT }o--|| COMPLIANCE_TYPE : instance_of
  COMPLIANCE_REQUIREMENT ||--o{ CERTIFICATE : evidenced_by
  CERTIFICATE ||--o{ REMEDIAL_ACTION : raises
  REMEDIAL_ACTION ||--o| WORK_ORDER : fixed_by
  CONTRACT ||--o{ WORK_ORDER : governs
  PURCHASE_ORDER ||--o{ PO_LINE : contains
  WORK_ORDER ||--o{ PURCHASE_ORDER : "funded by"
  USER }o--o{ ROLE : "assigned (scoped)"
```
