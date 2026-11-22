# Helpdesk and requester portal

Open **Helpdesk** to see open requests, assigned work, unassigned work and requests whose response targets are at risk. An operator can use **Log request** to capture a phone report or report on someone’s behalf. The form uses the same catalogue and triage rules as the requester portal. Operators can change the type, impact and urgency of an open request. SLA targets recalculate from the original report time.

Open **My requests** to report a fault or service request, follow its progress, add a comment or rate a completed request. A Locations QR label opens the report form with the location already selected. Scan links carry the location through sign-in and organisation selection. A report started from an asset record also has the asset and its location selected.

A Super User or administrator can open **Request catalogue** from the queue. Set the category, problem code, questions, initial impact and urgency for each request type. The priority matrix maps impact and urgency to response, attendance and fix targets. The site’s opening hours, time zone, bank holidays and closure dates determine business-time deadlines. If a site has no calendar, Helpdesk uses the default weekday hours. A calendar with no opening windows has no calculated due date for a business-hours target.

Duplicate candidates share a category and location within the request type’s time window. An operator can link a duplicate to the main request. The original reports retain their references and receive status updates from the main request. Each requester can rate their own report when the main request is completed. Internal notes are visible to authorised queue users.

## Email intake

Create an inbound mailbox with a recipient address, default reportable location and a request type. The trusted mail connector posts normalised JSON to `POST /api/helpdesk/inbound/{organisation-slug}/{mailbox-id}` with an `Authorization: Bearer …` header. Set the connector and CAFM to the same `HELPDESK_INBOUND_TOKEN` of at least 32 characters.

The connector passes `to`, `from`, `messageId`, optional `inReplyTo`, `subject` and plain `text`. Configure the connector to pass authenticated inbound sender identities. CAFM routes to the matching enabled mailbox, deduplicates delivery by mailbox, sender and message ID, and threads a matching sender’s reply while the request accepts comments. Incoming messages go to triage. Outbound email uses the existing SMTP settings and demo email is captured.

## Notifications

The bell opens the signed-in user’s inbox. Helpdesk administrators can configure titles, messages and email and browser-push delivery by event. A notification may use `{number}`, `{title}` and `{status}` to include request details. Demo email is captured, and demo inbox notifications can be viewed directly.

To offer browser push on a non-demo tenant, set `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` and `WEB_PUSH_SUBJECT` on the application and worker. Members can enable or turn off push for their membership on the current browser from the inbox. Push messages use generic lock-screen text and open the signed-in request view.

## API and integration

- `/api/helpdesk/catalogue` and `/api/helpdesk/locations` supply scoped request form options. The asset context endpoint returns only reportable asset and location labels.
- `POST /api/helpdesk/requests` accepts a client submission ID. A retry with the same data returns the same record.
- Use `/api/helpdesk/requests` for the queue and staff actions, or `/api/helpdesk/mine` for the requester’s own cases. Changes to status, assignment and duplicate links use record versions.
- Notifications are written with the request transaction. An outbox job attempts configured email and push independently and retries a failed channel without resending a channel already recorded as delivered. SMTP message IDs are stable on retries. A provider timeout can leave the delivery result uncertain.
- Request-to-work-order conversion and technician lifecycle events connect to the Reactive Work Orders PR. Asset label and attachment integration are tracked under the Asset Register dependency.
