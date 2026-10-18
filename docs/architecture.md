# Architecture and request flow

```
Browser (HTML + CSS + vanilla JS modules)
   │  fetch JSON, cookie dis.sid, X-CSRF-Token header on writes
   ▼
Express (server/app.js)
   helmet (CSP, headers) → express.json (50 kb limit) → express-session (MySQL store)
   ├─ /api/public/*   no session needed; token in the URL; no-store; noindex
   ├─ csrfProtection  (everything below)
   ├─ /api/auth       register, login, logout, me, csrf
   ├─ /api/account    profile, password, sign-out-everywhere, delete
   ├─ /api/letters    CRUD, archive/restore, duplicate, share-link, responses
   ├─ /api/mixtapes   CRUD, tracks, order, publish, share-link
   ├─ /api/dashboard, /api/responses, /api/music/parse
   ├─ /l/:token, /m/:token   static recipient page shells
   ├─ page guard for protected HTML (redirects to /login.html?next=…)
   └─ static files (public/), 404 page, central error handler
   ▼
mysql2 pool (UTC session) → MySQL dear_in_stereo_db
```

## Example: opening a shared letter

1. Recipient visits `/l/<token>`. Express returns the static `shared-letter.html` (no secrets in it).
2. The script calls `GET /api/public/letters/<token>`.
3. The server checks the token shape, hashes it with SHA-256, and looks up `share_token_hash`.
4. `accessState()` decides: `live`, `not_yet`, `expired` or `hidden`. Hidden covers missing, draft, archived, private and revoked, and all answer with the same 404.
5. Only recipient-safe fields are returned (no ids, email or owner details). The browser builds the page with `textContent` and an iframe whose URL it rebuilds from an allow-list pattern.

## Example: publishing a letter

`POST /api/letters {…, action: "publish"}` → CSRF check → `requireAuth` loads the user → strict validation → insert with `status = published` and, if `visibility = link`, a new random token whose hash is stored → response contains the raw link once.

## Frontend modules

`api.js` (fetch + CSRF + errors), `ui.js` (DOM helper `h()`, toasts, dialogs, form errors, dates), `music.js` (instant link feedback, mirrors the server), `render.js` (letter and mixtape rendering shared by preview and recipient pages), `shell.js` (header, footer, menu, password toggles), and one script per page in `js/pages/`.

## Conventions

- Success: `{ "ok": true, "data": … }`. Failure: `{ "ok": false, "error": { "code", "message", "fields"? } }`.
- Statuses: 401 signed out, 403 CSRF or not-yet-open, 404 not found or not yours, 409 state conflict, 410 expired, 415 wrong content type, 422 validation, 429 rate limited.
