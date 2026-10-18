# Testing checklist and actual results

Environment used for the runs below: Ubuntu 24 sandbox, Node.js 22.22, MySQL 8.0.46, Chromium via Playwright (Python). **Not run on Windows**, and the sandbox had **no internet access**.

## 1. Automated tests: `npm test`

Result of the final run: **44 tests, 44 passed, 0 failed** (about 6 seconds). They start the real Express app on a random port against a real MySQL test database (`dear_in_stereo_test`, recreated from `database.sql`) and use real HTTP requests with a cookie-aware client.

| File | Tests | Covers |
|---|---|---|
| `auth.test.js` | 9 | Registration, bcrypt hash stored, duplicate email, invalid input, generic login errors, session id regeneration, logout invalidating a replayed cookie, protected API and page redirects, CSRF rejection, password change signing out other devices, account deletion and cascade |
| `letters.test.js` | 16 | Draft vs publish, incomplete drafts, hashed share token shown once, public access without login and field whitelist, sender display modes, private/revoked/regenerated/archived links, restore, scheduled letter hidden then opened, expiry (410), schedule validation, unsupported links, XSS payload stored as text, ownership attacks (8 operations by another user), editing published letters, search/filter/sort/pagination/LIKE escaping, duplicate, delete, music parse endpoint |
| `mixtapes.test.js` | 7 | CRUD, standalone and letter-backed tracks, renumbering after removal, invalid track references (bad link, foreign letter, letter without a song, unknown ids, both shapes), reorder persistence and rejected orders, empty-mixtape sharing refusal, anonymous viewing without leaking letter messages, revocation, cascade when a letter is deleted, ownership attacks (9 operations) |
| `responses.test.js` | 3 | Reply without an account, owner-only visibility, disabled/invalid/oversized/wrong-content-type/revoked/not-yet-open rejections, dashboard counts from real rows and empty account |
| `ratelimit.test.js` | 3 | Login, registration and public reply rate limits (429) |
| `music.test.js` | 4 | Spotify/YouTube parsing and normalisation; rejection of `javascript:`, http, look-alike hosts, credentials, ports, iframe markup, bad IDs |
| `health.test.js` | 2 | Missing `.env` values and short secrets, unknown routes (HTML and API 404), malformed JSON (400), oversized body (413), generic 500 when the database connection is closed (no internals leaked) |

## 2. Browser checks (Chromium, Playwright)

`test/e2e-smoke.py` passed in the final run. It drives the real UI with the strict Content-Security-Policy active: landing sample letter, registration, writing a letter with live preview and a custom reason, publishing and copying the one-time link, opening the link in a separate browser context (390 px wide), revealing the letter, sending a reply containing `<b>` markup, reading it as the owner (shown as literal text), library search, creating a mixtape, adding a letter track and a standalone track, reordering with the Up/Down buttons, publishing and viewing the mixtape publicly, dashboard and account pages, and an invalid share link. **The only console message was the expected 404 for the invalid link; no CSP violations or script errors.**

`test/e2e-responsive.py` loaded 10 pages at 360, 768 and 1280 px wide: **30 of 30 had no horizontal overflow**. Screenshots were reviewed by eye and several layout bugs found that way were fixed (always-visible menu button on desktop, unstyled nav button, link colour on dark letters).

Both scripts are optional extras. They need `pip install playwright` and a browser, and a running server with an empty database.

## 3. Other checks run manually

- `database.sql` imported cleanly into MySQL 8.0.46 with the `mysql` client and through `npm run db:setup` (including `--reset`).
- Startup failures print readable messages: missing `.env` values, wrong password, missing database, MySQL not running.
- `npm audit --omit=dev`: 0 vulnerabilities (an `overrides` entry in `package.json` forces the patched `mysql2` for `express-mysql-session`).

## 4. Not verified

- Running on Windows, MySQL Workbench import by mouse, and Node 18/20 (only Node 22 was used).
- Spotify and YouTube players actually playing: there was no internet access, so iframes stayed blank. The iframe URLs and the "Open on …" fallback link are covered by unit and browser checks only.
- The oEmbed "Look up details" button against the live providers. Its failure path (quiet fallback to manual entry) was exercised; a successful lookup was not.
- Google Fonts rendering (fallback system fonts were what the screenshots showed).
- Production mode over HTTPS (`Secure` cookies, HSTS, `TRUST_PROXY`).
- Drag-and-drop reordering with a mouse. The Up/Down buttons were tested in the browser; the drop handler uses the same server endpoint, which is covered by API tests.
- Screen-reader behaviour. Labels, focus styles, `aria-live` regions and dialogs follow standard patterns, but no assistive technology was used.
- Concurrency under real load.

## 5. Manual checklist for you

- [ ] Register, log out, log in, wrong password shows a generic error
- [ ] Visit `/dashboard` while logged out: redirected to login
- [ ] Draft a letter, then publish; copy the link; open it in a private window
- [ ] Revoke the link; reload the private window: "not available"
- [ ] Schedule a letter for two minutes ahead; the link says "not open yet", then opens
- [ ] Turn replies off; the reply form disappears and the API refuses replies
- [ ] Build a mixtape, reorder it, publish it, delete a letter that was in it
- [ ] Change password, then confirm another browser was signed out
- [ ] Delete the account and confirm the data is gone in Workbench
