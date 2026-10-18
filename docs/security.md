# Security and authorization rules

| Area | What the code does |
|---|---|
| Passwords | `bcryptjs`, 12 rounds (production minimum), 10–72 characters, letter and number required. Unknown emails are compared against a dummy hash so timing does not reveal accounts. |
| Sessions | Server-side in MySQL. Cookie `dis.sid` is HttpOnly, SameSite=Lax, `Secure` in production, 7 days. `regenerate()` on login, registration and password change; `destroy()` on logout. The user row is re-read on every request; `session_version` kills other devices. |
| CSRF | Synchronizer token stored in the session; required in `X-CSRF-Token` on every non-GET `/api` request outside `/api/public`. Compared in constant time. |
| Public POST | `/api/public/.../responses` needs no CSRF token because it has no session authority, but it only accepts `application/json`, which a cross-site HTML form cannot send. It is rate limited and capped at 200 replies per letter. |
| SQL | Parameterized `mysql2` queries everywhere. Dynamic parts (ORDER BY, WHERE fragments) come from fixed allow-lists. LIKE wildcards in searches are escaped. |
| Authorization | Every letter and mixtape query includes `user_id = ?` from the session. Another user's id behaves exactly like a missing one (404). Replies are joined through `song_letters.user_id`. A mixtape track can only reference the same owner's letter. |
| Share tokens | `crypto.randomBytes(32)` (256 bits), base64url, stored as SHA-256, unique index, shown once, never logged. Format-checked before any database lookup. |
| Public output | Whitelisted fields only. Mixtapes expose song details of letter-backed tracks, never the message. Public responses are `no-store` and `noindex`. |
| XSS | The API returns JSON. The frontend inserts all user text with `textContent`/text nodes (no `innerHTML`). CSP: `script-src 'self'` (no inline scripts, no eval), `frame-src` only Spotify and YouTube-nocookie, `object-src 'none'`, `frame-ancestors 'none'`. |
| Music links | https only, exact host allow-list, no credentials or ports, IDs matched by strict patterns. Embed URLs are built from the ID, and the browser re-checks them against an allow-list regex before creating an iframe (with `sandbox`). Artwork must be https. |
| Rate limiting | Login, registration, password change and account deletion, public replies, metadata lookups. Limits are configurable in `createApp({ limits })`. |
| Errors | Centralized handler. Unexpected errors return a generic 500; only the message (no SQL, stack or request path with tokens) is logged. |
| Secrets | `.env` only; startup fails with a readable message if variables are missing or `SESSION_SECRET` is short. No secret reaches `public/`. |
| Headers | `helmet`; `Referrer-Policy: strict-origin-when-cross-origin` (share paths never reach Spotify/YouTube, while YouTube embeds still work); HSTS in production. |
| Account deletion | Requires the password and the word DELETE; one `DELETE FROM users` cascades to all owned data. |

Not provided: email verification, password reset, multi-factor authentication, a shared rate-limit store, malware scanning of artwork URLs (they are just https image links loaded by the viewer's browser, so a sender could use one to learn that a recipient opened the letter).
