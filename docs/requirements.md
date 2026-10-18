# Functional requirements

Status reflects what is implemented and covered by the tests described in `testing.md`.

| ID | Requirement | Status |
|---|---|---|
| A1 | Register with display name, email, password (10+ chars, letter and number); duplicate emails rejected | Implemented, tested |
| A2 | Log in / log out with server-side sessions; session id regenerated on login | Implemented, tested |
| A3 | Change password (current password required); other devices signed out | Implemented, tested |
| A4 | Edit display name and bio; "log out everywhere"; delete account with password and typed confirmation | Implemented, tested |
| L1 | Create, view, edit, duplicate, archive, restore, delete song letters (owner only) | Implemented, tested |
| L2 | Drafts may be incomplete; publishing needs title, song, recipient, message | Implemented, tested |
| L3 | Spotify/YouTube link parsing, normalisation, embed built from validated IDs | Implemented, unit tested |
| L4 | Share link: random token, hashed at rest, shown once, regenerate, revoke | Implemented, tested |
| L5 | Scheduled opening and optional expiry, enforced on the server in UTC | Implemented, tested |
| L6 | Sender display options (account name, custom name, anonymous) | Implemented, tested |
| L7 | Library with search, filters (status, sharing, reason), sort, pagination | Implemented, tested |
| M1 | Create, edit, delete mixtapes with cover theme and dedication | Implemented, tested |
| M2 | Tracks from own letters or standalone songs; notes; add, remove, reorder (transaction) | Implemented, tested |
| M3 | Publish / revoke mixtape link; empty mixtapes cannot be shared | Implemented, tested |
| R1 | Recipients reply without an account when enabled; length limits; rate limit | Implemented, tested |
| R2 | Only the letter's owner can read replies | Implemented, tested |
| D1 | Dashboard counts and recent items computed from the database | Implemented, tested |
| P1 | Branded 404, error, expired, not-yet-open and unavailable pages | Implemented; 404/error and API errors tested |
| UX | Responsive layout, keyboard focus, labels, reduced-motion support, confirmation dialogs, toasts | Implemented; browser-checked (see testing.md) |
