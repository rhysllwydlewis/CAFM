# Mobile app (technician PWA)

The technician, contractor and requester app is an offline-first PWA (ADR 0005). This page grows with each part of P1-06. Built so far: sign-in, the work pack and sync, the mutation queue and the app shell.

## Signing in a device

The app uses the OAuth 2.0 authorisation-code flow with PKCE (S256). There is one first-party public client, `fmstead-pwa`.

1. The app makes a random **code verifier** (43 to 128 URL-safe characters) and keeps it. It sends the base64url SHA-256 hash of it as the **code challenge**.
2. A person signed in at a browser (cookie session) calls `POST /api/oauth/authorize` with `client_id`, `code_challenge`, `code_challenge_method: "S256"` and a `device_name`. They get a **code** that works once for 60 seconds. A device token can't approve another device.
3. The app calls `POST /api/oauth/token` with `grant_type: "authorization_code"`, `client_id`, `code` and `code_verifier`. It gets an `access_token` (15 minutes) and a `refresh_token`.
4. The app sends `Authorization: Bearer <access_token>` on every API call. Every permission, entitlement and tenant rule is the same as for the browser: the access token is a session tied to the device and the membership it was approved for.
5. Before the access token ends, `POST /api/oauth/token` with `grant_type: "refresh_token"` swaps the refresh token for a new pair. **A refresh token works once.** It lasts 30 days from its last use.

Errors follow RFC 6749: `400 { "error": "invalid_grant" }`. A failed code or refresh counts towards the same per-IP limit as failed sign-ins.

### Stolen and lost devices

- **A lost answer is forgiven; a copied token is not.** If the previous refresh token is used again within 60 seconds of the change, the phone most likely never received the answer (poor signal). It is treated as a retry and answered with a fresh pair, and the device stays signed in (`mobile_refresh_retry`). If the previous token is used again after that, the device was copied: the whole device is signed out, and the person signs in again (`mobile_refresh_reuse`). This is deliberate. A token from two changes back is simply refused.
- **At most 10 phones per person.** Approving an eleventh signs out the one used least recently (`mobile_device_limit`).
- `GET /api/oauth/devices` lists your devices. `DELETE /api/oauth/devices/:id` signs one out at once. You can only see and remove your own.
- `POST /api/oauth/revoke` with a refresh token signs that device out. It always answers 200, so tokens can't be probed.
- A device is also signed out if the person's membership or the organisation is no longer active.
- Sign-ins, sign-outs and replays are recorded as sign-in events (`mobile_sign_in`, `mobile_device_signed_out`, `mobile_device_revoked`, `mobile_refresh_reuse`, `mobile_refresh_retry`, `mobile_device_limit`).

The tables (`mobile_device`, `oauth_code`) are global like sessions (ADR 0004). They name a membership and hold only hashes of tokens.

## Work pack and sync

A signed-in device (a bearer token, or a browser session) keeps its jobs for offline work with two calls. Both need the `mobile` feature and `work_orders.read`, and show only the jobs the person's data scope allows: a technician sees the jobs assigned to them, at sites they can access.

- `GET /api/mobile/work-pack` returns the open jobs (not closed or cancelled, at most 200), each with its location and access notes, asset details, checklists with their answers, and a `syncToken`.
- `GET /api/mobile/changes?since=<syncToken>` returns the jobs that changed since the token (the job itself, a checklist added or an answer given), a new `syncToken`, and `jobIds`, every open job the person still holds. The phone removes any job missing from `jobIds` (closed, cancelled or reassigned).

The token is the server's clock when the data was read. A bad or future token gets a 400 `invalid_sync_token`, and the phone fetches the whole pack again. Known limit: clearing a checklist answer does not by itself mark the job as changed, so the next full pack picks it up.

## Mutation queue

`POST /api/mobile/mutations` takes up to 50 changes made offline, `{ "mutations": [{ "key", "kind", ... , "payload" }] }`, and applies them in order. Each change has a `key` (a UUID made on the phone, the same on every retry) and a `kind`:

| kind | Also needs | `payload` is what this takes |
| --- | --- | --- |
| `status` | `workOrderId` | `POST /api/work-orders/:id/status` (with the job's `version`) |
| `note` | `workOrderId` | `POST /api/work-orders/:id/comments` |
| `checklist_answer` | `workOrderId`, `checklistId`, `itemId` | `PUT /api/work-orders/:id/checklists/:checklistId/items/:itemId` |
| `time` | `workOrderId` | `POST /api/work-orders/:id/time` (with a `submission` id) |
| `meter_reading` | `assetId`, `meterId` | `POST /api/assets/:assetId/operations/meters/:meterId/readings` |

Each change runs through the same code as the website, so permissions, data scope, versions, checklist gates and audit events are the same. The response is `{ results: [{ key, status, code?, message?, replayed? }] }`, in the same order. `status` is `applied` or `rejected`. A rejection (`conflict` when the job changed and needs refreshing, `invalid`, `forbidden`, `not_found`, `key_reused`) affects only that change, and the rest carry on. The outcome is kept against the key (table `mobile_mutation`), so a retry after a dropped connection returns the first outcome with `replayed: true` and nothing is applied twice. The key is claimed (outcome `pending`) before the change runs, so the same key arriving twice at the same moment is run once: the second request waits briefly for the first one's outcome and returns it with `replayed: true`. If the first request is still running after about ten seconds, the second answers `503` and the phone keeps the change and tries again. A claim left behind by a request that died (older than two minutes) is taken over by the next retry, and a change that fails with a server error gives its key back. The same key with different content is rejected as `key_reused`.

Time is recorded without the technician seeing any rate or cost. See [Work orders](work-orders.md#time-and-labour-rates).

## The app shell

The technician app lives at `/m` (My jobs), `/m/job?id=<job id>` (a job) and `/m/me` (sign out). It matches `mobile-01-technician-jobs`. It is a web app you can add to the home screen (`manifest.webmanifest`, scope `/m`).

- **Signed in with the browser session.** The app uses the same cookie session as the website, in the same site, so nothing extra is stored on the phone. The bearer-token sign-in above is for native and third-party clients. Someone who is not signed in is sent to the sign-in page.
- **Offline.** A service worker (`/sw.js`) keeps the app's pages and static files, so the app opens without signal. Pages come from the network first and fall back to the saved copy. It never keeps API responses.
- **Jobs on the phone.** Jobs are in the browser's IndexedDB store `cafm-mobile` (`jobs` and `meta`). Opening the app shows the saved jobs at once, then asks the server for what changed since the last sync token (or the whole work pack the first time, or when the token is rejected). `applyMobileChanges` in `packages/shared` merges the changes.
- **Sign out.** The Me tab signs out and deletes the saved jobs. Sign out needs signal. If it fails the jobs stay, because the person is still signed in.
- **Not yet built:** parts used on the complete screen (recording costs needs `costs.read`, which technicians do not hold, so it waits for an owner decision).

## Working offline

Everything a technician does on a job is saved on the phone first, in the IndexedDB store `outbox`, in the order it was done. It is sent when there is signal (when the app opens, when the phone comes back online, or from **Try sync now** on the Sync tab).

- **Checklists.** Each step is answered on the job screen (tick, pass or fail with a note, a reading, or a comment). The answer shows at once and goes through the mutation queue as `checklist_answer`.
- **Status.** Start work and Complete job queue a `status` change. Each queued status change expects the job's version one higher than the last, so a chain (on site, then completed) is applied in order.
- **Photos.** Taken with the phone's camera or chosen from the gallery (JPEG, PNG or WebP, up to 8 MB). Each is sent with `PUT /api/work-orders/:id/photos`. The server recognises a photo it already has, so sending twice stores one.
- **Signatures.** The complete screen takes the customer's name and signature, then queues the sign-off and the move to Completed, in that order. Sent with `POST /api/work-orders/:id/signatures`. If the job already has that sign-off the server answers 409 and the change stays on the Sync tab as refused, because the stored one may not be this drawing.
- **Order and failures.** A change the server accepts leaves the queue. One it refuses (the job changed, you no longer have the job, an answer that is not valid) stays, marked as refused with the reason, on the Sync tab. **Try again** sends it again under a new key, and **Discard** removes it. Nothing is dropped quietly.
- **Signing out** deletes the queue with the saved jobs, so the Me tab warns first and needs a second tap.

## Scan, accept and readings

- **Work pack meters.** Each job's `assetDetail.meters` lists the asset's meters (`id`, `name`, `unit`, `rolloverAt`), only for people with `assets.record_readings`. Meters are refreshed when the job changes.
- **Scan** (`/m/scan`) matches a label link (`/asset-qr/<id>`), an asset number or a job number against the jobs held on the phone, so it works offline. The camera uses the browser's `BarcodeDetector` where it exists. Elsewhere the person types the number.
- **Meter reading** queues a `meter_reading` mutation with a fresh `submission` id, so a retry never records it twice.
- **Accept** queues a `status` change to Accepted. **Decline** queues an internal note, "Declined by the technician: <reason>", because there is no declined status. The job stays assigned until the helpdesk reassigns it.

## Quick jobs, recent scans, time and root cause

- **Raise a job from a scan.** After scanning an asset, **Raise a job** takes a title, what was found and how urgent it is, and saves it on the phone as a `quick_job` change. It is sent through the mutation queue to the same endpoint as the website's New job (`POST /api/work-orders`), so it needs `work_orders.edit`, respects the person's location scope and is audited. Technicians do not hold `work_orders.edit` by default, so for them the change is refused and stays on the Sync tab with the reason. The job is raised unassigned, at the asset's location, with the asset attached.
- **Recent scans.** The last 20 things scanned that found a match are kept in the `meta` store, so they go when the jobs go (sign out or another person signing in). Tap one to open it again.
- **Time and root cause.** The complete screen takes minutes and the kind of time (on site, travel or overtime), queued as a `time` change before the sign-off. A root cause is queued as an internal note beginning "Root cause:".

