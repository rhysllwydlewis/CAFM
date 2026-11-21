# ADR 0005: PWA first, native mobile later

- **Status:** Accepted (planning baseline) · 21 Nov 2026
- **Revisit:** if the context below changes

## Context

Technicians need offline work from Phase 1. Native app-store releases slow early iteration.

## Decision

Ship the technician, contractor and requester experiences as an offline-first PWA (IndexedDB, service worker, mutation queue with idempotency keys, delta sync). Build the native Expo app in Phase 5, sharing TypeScript packages and the sync protocol.

## Consequences

- Faster delivery and one codebase early on.
- iOS PWA limits (background sync, NFC) are accepted until Phase 5; QR scanning works in the PWA.
- The sync protocol is designed once and reused by the native app.
