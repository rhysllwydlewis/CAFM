# ADR 0010: Bounded attachment transport for Asset Register and Helpdesk

- **Status** Proposed in the Phase 1 Asset Register batch

## Context

The architecture describes S3-compatible storage, short-lived URLs and malware scanning. Asset documents and requester photos use the signed-in app and inherit the access rules of their parent record. The first release accepts a small set of file types and limits each upload to 8 MB.

## Decision

The API accepts multipart uploads and streams authorised downloads as attachments. It validates the file signature and length, scans customer files with private ClamAV, and keeps file bytes in a private S3-compatible bucket in production. Stored keys use the tenant ID and an opaque file ID. Before a download the API checks the parent record’s current permissions and verifies the stored bytes against their digest. Responses force a download and set a sandbox policy. Local development and demo records can use row-protected PostgreSQL storage to make offline development and demo resets self-contained.

## Consequences

A customer deployment needs a configured bucket and scanner to accept uploads. Requests consume API bandwidth and up to 8 MB of memory per file, so this transport suits small photos and documents. Future large, resumable or previewable files can use quarantined object uploads, isolated serving and short-lived URLs as outlined in the architecture.
