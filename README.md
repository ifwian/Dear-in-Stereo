# Dear, in Stereo

> Some things are easier to say through a song.

Dear, in Stereo is a personal music-sharing web app. You turn a song into a letter, gather songs into mixtapes, share them with a private link, read the replies, and keep an archive of everything you have sent.

Recipients do not need an account. Only you can see your archive and the replies.

## 1. Main features

- **Song letters**: Spotify or YouTube link, title, message, reason, paper theme, sender name choice, live preview, drafts, publish, archive, duplicate, delete.
- **Private share links**: random 256-bit tokens, shown once, stored only as a SHA-256 hash, revocable instantly.
- **Scheduled letters**: a letter can open at a future time and close at an optional expiry. Before opening, the link reveals nothing.
- **Mixtapes**: ordered tracks (drag-and-drop or Up/Down buttons), a note per track, tracks from your own letters or standalone songs, preview, publish and revoke.
- **Responses**: recipients can write back without an account. Replies are visible only to the letter's owner.
- **Archive**: search, filters, sorting and pagination done in MySQL, not in the browser.
- **Accounts**: registration, login, change password, "log out everywhere", account deletion.

## 2. Technologies

| Part | Choice | Why |
|---|---|---|
| Frontend | HTML5, CSS3, vanilla JavaScript (ES modules) | No build step, easy to read and explain |
| Backend | Node.js + Express 4 | Small, popular, easy to debug |
| Database | MySQL 8 with `mysql2` (parameterized queries) | Works with MySQL Workbench |
| Auth | `express-session` stored in MySQL, `bcryptjs` hashes | Server-side sessions, no tokens in the browser |
| Safety | `helmet`, `express-rate-limit`, custom CSRF token | Standard headers, abuse limits, CSRF protection |

No React, Vue, Angular, TypeScript, Tailwind, Bootstrap, Firebase, MongoDB or ORM is used.

## 3. Prerequisites (Windows)

1. **Node.js 18 or newer (LTS)**: https://nodejs.org (the project was developed and tested on Node 22).
2. **MySQL Community Server 8.0.16 or newer** and **MySQL Workbench**: https://dev.mysql.com/downloads/ (remember the `root` password you set during installation).
3. **VS Code**: https://code.visualstudio.com

Check Node in a terminal: `node -v` and `npm -v`.

## 4. Setup, step by step

**Step 1. Open the project.** Unzip `Dear_in_Stereo_Complete.zip`, then in VS Code choose *File > Open Folder* and pick the unzipped folder. Open a terminal with *Terminal > New Terminal*.

**Step 2. Create the database.** Choose one way:

- *MySQL Workbench*: connect to your local server, choose *File > Open SQL Script…*, select `database.sql`, then click the lightning-bolt button (Execute). Refresh the schemas panel and you should see `dear_in_stereo_db`.
- *Terminal* (after step 3): `npm run db:setup`

**Step 3. Create your `.env` file.** In the VS Code terminal:

```powershell
copy .env.example .env
```

Open `.env` and set `DB_PASSWORD` to your MySQL password. Create a session secret and paste it as `SESSION_SECRET`:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Never commit `.env` and never share it. `.gitignore` already excludes it.

**Step 4. Install dependencies.**

```powershell
npm install
```

**Step 5. Start the app.**

```powershell
npm start
```

You should see `Dear, in Stereo is running at http://localhost:3000`. For auto-restart while editing, use `npm run dev`.

**Step 6. Open** http://localhost:3000

### Reset the database

`npm run db:setup -- --reset` drops `dear_in_stereo_db`, recreates it from `database.sql`, and **deletes all data**. In Workbench you can run `DROP DATABASE dear_in_stereo_db;` and import the script again.

## 5. Try the main features

1. **Register** (Start a letter). You land on your dashboard, which shows real counts (all zero at first).
2. **Write a letter**: paste a link such as `https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC` or a YouTube watch link. The link is recognised and normalised. Fill in title and artist (or press *Look up details*, which asks Spotify/YouTube's public oEmbed service and falls back to manual entry if that is unavailable). Write the message and watch the preview change.
3. **Save draft** keeps it private. **Publish letter** creates the share link and shows it once on the letter page. Press *Copy link*.
4. **Open the link in a private window** (no login). Press *Open the letter*, read it, and send a reply.
5. Back in your account, open **Responses** to read the reply.
6. **Mixtapes**: create one, add a track from your letter and a new song, reorder with the buttons or by dragging, then *Publish and get link*.
7. **Revoke** a link on the letter or mixtape page, then reload the private window. The link now shows "not available".

## 6. How share links work

- A published letter with "Anyone with the link" gets a random token in its URL: `/l/<token>` (mixtapes use `/m/<token>`).
- The database stores only the SHA-256 hash. The full link is displayed once when created. If you lose it, create a new link; the old one stops working immediately.
- **A link is a bearer capability.** Anyone who has it can open the content. It does not prove who the reader is, and the letter is not end-to-end encrypted.
- Drafts, archived letters, private letters and revoked links all answer with the same generic "not available" response, so a stranger cannot tell whether a letter exists.
- Mixtapes that include one of your letters show only that letter's song title, artist and link, never its message.

## 7. Scheduling, expiry and time zones

- You pick dates in your browser's local time. The browser converts them to **UTC** before sending, MySQL stores them in UTC (every connection is pinned to `+00:00`), and the browser converts back for display. The editor shows your detected time zone.
- The server decides availability on every request using the current UTC time. Hiding something in the browser is never relied on.
- Before the opening time the public API answers `403 NOT_YET_AVAILABLE` with only the opening time, not the content. After the expiry it answers `410 EXPIRED`.
- No email or notification is sent. Scheduling only controls when the link starts working.
- **To test:** schedule a letter 2 minutes ahead, open its link (it says "not open yet"), wait, then reload.

## 8. Tests

```powershell
npm test
```

This runs 44 automated tests against a separate database called `dear_in_stereo_test`. **The test runner drops and recreates that database**, so the MySQL user in `.env` needs permission to create databases (the `root` user has it). Your real data in `dear_in_stereo_db` is never touched.

Optional browser checks (Python + Playwright, not required): `test/e2e-smoke.py` and `test/e2e-responsive.py`. See `docs/testing.md` for exactly what was run and what was not.

## 9. Project structure

```
database.sql           MySQL schema (creates dear_in_stereo_db)
.env.example           Copy to .env and fill in
package.json
server/
  index.js             Starts the server, checks the database first
  app.js               Builds the Express app (middleware, routes, pages, errors)
  config/              env.js (validates .env), db.js (MySQL pool, UTC)
  middleware/          auth.js, csrf.js, rateLimit.js
  routes/              auth, account, letters, mixtapes, public, dashboard (+responses, music)
  utils/               validate.js, music.js, tokens.js, share.js, errors.js
public/
  *.html               Pages (home, how-it-works, login, register, dashboard, responses, account, shared pages, 404, error)
  letters/ mixtapes/   Library, editor and detail pages
  css/styles.css       Design system
  js/                  api.js, ui.js, render.js, music.js, shell.js, pages/*.js
scripts/               setup-db.js, run-tests.js
test/                  Automated tests (+ optional browser scripts)
docs/                  Requirements, database, architecture, security, business logic, testing
```

## 10. How the pieces talk to each other

1. The browser loads a static HTML page from Express (`public/`). Protected pages (`/dashboard`, `/letters/*`, `/mixtapes/*`, `/responses`, `/account`) first check the session on the server and redirect to the login page if you are not signed in.
2. The page's JavaScript calls JSON endpoints under `/api/...` with `fetch`. State-changing calls carry an `X-CSRF-Token` header.
3. Your **session** is a random id in an HttpOnly cookie. The session data lives in the MySQL `sessions` table, and the user row is re-read on every request.
4. Routes validate input, run parameterized SQL through the `mysql2` pool, and return `{ ok, data }` or `{ ok: false, error }`.
5. Recipient pages (`/l/<token>`, `/m/<token>`) are the same static shell; their script calls `/api/public/...`, which needs no login.

More detail: `docs/architecture.md`.

## 11. Troubleshooting

| Message or symptom | What to do |
|---|---|
| `Missing environment variable(s)` | Create `.env` from `.env.example` (step 3). |
| `MySQL rejected the username/password` | Fix `DB_USER` / `DB_PASSWORD` in `.env`. |
| `The database or tables are missing` | Import `database.sql` (step 2). |
| `MySQL is not running or DB_HOST/DB_PORT are wrong` | Start the MySQL service (Windows *Services* app) and check `DB_PORT` (default 3306). |
| `EADDRINUSE` | Another program uses port 3000. Change `PORT` and `BASE_URL` in `.env`. |
| `Cannot find module …` | Run `npm install` in the project folder. |
| Redirected to the login page | Your session expired or you logged out. Sign in again. |
| "Your session expired. Refresh the page" | The CSRF token no longer matches. Refresh and retry. |
| Fonts look plain | Fonts load from Google Fonts. Offline, the page falls back to system serif and sans fonts. |
| Player is blank | The Spotify/YouTube player needs internet access. Use the "Open on …" link under it. |
| Tests fail to connect | `npm test` needs MySQL running and permission to create `dear_in_stereo_test`. |

## 12. Known limitations

- No email features: no email verification, no password reset, no notifications. Do not rely on a forgotten password being recoverable.
- Registration reveals whether an email is already registered (it reports "already exists").
- Rate limits are kept in memory per server process, so they reset on restart and would need a shared store if you run several instances.
- Share links cannot be displayed again after creation (by design: only a hash is stored).
- Metadata lookup uses the providers' public oEmbed endpoints. It is best effort: Spotify returns a title but no artist, and the lookup needs internet access. Manual entry always works.
- Deleting a letter also removes it from any mixtape that referenced it.
- For production, serve over HTTPS and set `NODE_ENV=production`, `TRUST_PROXY=1` and a long `SESSION_SECRET` (cookies become `Secure`, HSTS and `upgrade-insecure-requests` turn on).
