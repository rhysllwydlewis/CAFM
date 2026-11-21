# Changelog

What changed for people using CAFM, newest first. Each pull request that changes behaviour adds a line under "Unreleased".

## Unreleased

### Changed

- A labelled Sign out button appears next to your name and lets you retry if sign-out fails.

### Added

- Roles and permissions: 15 built-in roles per organisation (doc 03) plus custom roles, with data scopes (all or own). Super Users can create and edit roles; nobody can grant a permission they don't hold, change their own role or remove the last Super User.
- Change someone's role or deactivate them; deactivated people are signed out straight away.
- Audit log of role and people changes, append-only.
- Plans and add-ons decide which features an organisation has (Free, Starter, Professional, Enterprise); locked features say which plan unlocks them.
- Background worker for emails and scheduled jobs, fed by a transactional outbox.
- Railway deployment: one service runs the API and web app, with database setup, migrations and demo reseeding before each deploy.
- Sign-in page with email or username and password, "Keep me signed in" (30 days) and generic error messages.
- Demo accounts panel (demo environments only): click a role to fill in its details; six roles shown, all 16 on request.
- Choose an organisation, for people who belong to more than one.
- Home page with the organisation, your name and role, and sign out.
- Security: passwords hashed with Argon2id, accounts locked for 15 minutes after five failed attempts, a limit on failed sign-ins per network address, sessions that end on sign-out, expiry or organisation suspension.
- Each organisation's data is isolated in the database itself (row-level security).
