# Changelog

What changed for people using CAFM, newest first. Each pull request that changes behaviour adds a line under "Unreleased".

## Unreleased

### Changed

- Menu section labels are lighter, so they meet WCAG AA contrast on the dark menu.
- The homepage uses sharper device and plant room media and gives each scroll scene more time on screen.
- A labelled Sign out button appears next to your name and lets you retry if sign-out fails.

### Added

- The full app shell: a menu of every module your role can use (locked modules say which plan includes them; modules still to come say which phase), a command palette (Ctrl K) to jump to any page, a notifications drawer, light, dark or system theme, and a menu drawer on phones.
- Switch organisation from the user menu, for people who belong to more than one.
- Demo guard rails: the demo personas and built-in roles can't be changed, and the demo resets every night at 03:00 UK time, with a warning banner 10 minutes before.
- Password reset by email: a single-use link that works for 30 minutes and signs you out everywhere. The demo accounts can't be reset.
- Invitations: invite someone into the organisation with a role; they set a password, accept the terms and land in the app. People who already have an account sign in to accept.
- Emails are queued and sent by the background worker. Email from demo organisations, or when no mail server is set up, is captured instead of sent.
- Tenant command-line tool for the platform team: create an organisation (with its first Super User invite), change its plan, suspend or reactivate it.
- Roles and permissions: 15 built-in roles per organisation (doc 03) plus custom roles, with data scopes (all or own). Super Users can create and edit roles; nobody can grant a permission they don't hold, change their own role or remove the last Super User.
- Change someone's role or deactivate them; deactivated people are signed out straight away.
- Audit log of role and people changes, append-only.
- Plans and add-ons decide which features an organisation has (Free, Starter, Professional, Enterprise); locked features say which plan unlocks them.
- Background worker for emails and scheduled jobs, fed by a transactional outbox.
- Public CAFM homepage with a scroll-driven plant room walkthrough, an interactive sample job and links to sign in or choose a demo account where enabled.
- Railway deployment: one service runs the API and web app, with database setup, migrations and demo reseeding before each deploy.
- Sign-in page with email or username and password, "Keep me signed in" (30 days) and generic error messages.
- Demo accounts panel (demo environments only): click a role to fill in its details; six roles shown, all 16 on request.
- Choose an organisation, for people who belong to more than one.
- Home page with the organisation, your name and role, and sign out.
- Security: passwords hashed with Argon2id, accounts locked for 15 minutes after five failed attempts, a limit on failed sign-ins per network address, sessions that end on sign-out, expiry or organisation suspension.
- Each organisation's data is isolated in the database itself (row-level security).
