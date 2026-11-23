# Mobile app (technician PWA)

The technician, contractor and requester app is an offline-first PWA (ADR 0005). This page grows with each part of P1-06. Built so far: sign-in.

## Signing in a device

The app uses the OAuth 2.0 authorisation-code flow with PKCE (S256). There is one first-party public client, `cafm-pwa`.

1. The app makes a random **code verifier** (43 to 128 URL-safe characters) and keeps it. It sends the base64url SHA-256 hash of it as the **code challenge**.
2. A person signed in at a browser (cookie session) calls `POST /api/oauth/authorize` with `client_id`, `code_challenge`, `code_challenge_method: "S256"` and a `device_name`. They get a **code** that works once for 60 seconds. A device token can't approve another device.
3. The app calls `POST /api/oauth/token` with `grant_type: "authorization_code"`, `client_id`, `code` and `code_verifier`. It gets an `access_token` (15 minutes) and a `refresh_token`.
4. The app sends `Authorization: Bearer <access_token>` on every API call. Every permission, entitlement and tenant rule is the same as for the browser: the access token is a session tied to the device and the membership it was approved for.
5. Before the access token ends, `POST /api/oauth/token` with `grant_type: "refresh_token"` swaps the refresh token for a new pair. **A refresh token works once.** It lasts 30 days from its last use.

Errors follow RFC 6749: `400 { "error": "invalid_grant" }`. A failed code or refresh counts towards the same per-IP limit as failed sign-ins.

### Stolen and lost devices

- If an old refresh token is used again, the device was copied or a response was lost. The whole device is signed out, and the person signs in again. This is deliberate.
- `GET /api/oauth/devices` lists your devices. `DELETE /api/oauth/devices/:id` signs one out at once. You can only see and remove your own.
- `POST /api/oauth/revoke` with a refresh token signs that device out. It always answers 200, so tokens can't be probed.
- A device is also signed out if the person's membership or the organisation is no longer active.
- Sign-ins, sign-outs and replays are recorded as sign-in events (`mobile_sign_in`, `mobile_device_signed_out`, `mobile_device_revoked`, `mobile_refresh_reuse`).

The tables (`mobile_device`, `oauth_code`) are global like sessions (ADR 0004). They name a membership and hold only hashes of tokens.
