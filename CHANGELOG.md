# Changelog

What changed for people using CAFM, newest first. Each pull request that changes behaviour adds a line under "Unreleased".

## Unreleased

### Changed

- A labelled Sign out button appears next to your name and lets you retry if sign-out fails.

### Added

- Public CAFM homepage with a scroll-driven plant room walkthrough, an interactive sample job and links to sign in or choose a demo account where enabled.
- Railway deployment: one service runs the API and web app, with database setup, migrations and demo reseeding before each deploy.
- Sign-in page with email or username and password, "Keep me signed in" (30 days) and generic error messages.
- Demo accounts panel (demo environments only): click a role to fill in its details; six roles shown, all 16 on request.
- Choose an organisation, for people who belong to more than one.
- Home page with the organisation, your name and role, and sign out.
- Security: passwords hashed with Argon2id, accounts locked for 15 minutes after five failed attempts, a limit on failed sign-ins per network address, sessions that end on sign-out, expiry or organisation suspension.
- Each organisation's data is isolated in the database itself (row-level security).
