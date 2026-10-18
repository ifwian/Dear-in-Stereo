const path = require('path');
const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const helmet = require('helmet');
const { loadConfig } = require('./config/env');
const { createPool } = require('./config/db');
const { createLimiters } = require('./middleware/rateLimit');
const { ensureCsrfToken, csrfProtection } = require('./middleware/csrf');
const { pageGuard } = require('./middleware/auth');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PROTECTED_PAGES = /^\/(dashboard|responses|account|letters|mixtapes)(\/|\.html|$)/;

function createApp({ env = process.env, limits = {}, fetchImpl = fetch } = {}) {
  const config = loadConfig(env);
  const pool = createPool(config.db);
  const limiters = createLimiters(limits);
  const store = new MySQLStore({ clearExpired: true, checkExpirationInterval: 15 * 60 * 1000, createDatabaseTable: false, schema: { tableName: 'sessions' } }, pool);
  const deps = { pool, config, limiters, fetchImpl };

  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", 'https://fonts.googleapis.com'],
          fontSrc: ['https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'https:'],
          frameSrc: ['https://open.spotify.com', 'https://www.youtube-nocookie.com'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          ...(config.isProd ? { upgradeInsecureRequests: [] } : {}),
        },
      },
      // Origin-only referrers: share-link paths never leak to Spotify/YouTube, but YouTube embeds still work.
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-origin' },
      hsts: config.isProd,
    })
  );
  app.use(express.json({ limit: '50kb' }));
  app.use(
    session({
      name: 'dis.sid',
      secret: config.sessionSecret,
      store,
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, sameSite: 'lax', secure: config.isProd, maxAge: 7 * 24 * 60 * 60 * 1000 },
    })
  );

  // ---- API
  const api = express.Router();
  api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  api.use('/public', require('./routes/public')(deps)); // bearer-link routes: no session, no CSRF token
  api.use(csrfProtection); // everything below needs the CSRF header on state-changing requests
  api.use('/auth', require('./routes/auth')(deps));
  api.use('/account', require('./routes/account')(deps));
  api.use('/letters', require('./routes/letters')(deps));
  api.use('/mixtapes', require('./routes/mixtapes')(deps));
  api.use('/', require('./routes/dashboard')(deps));
  api.use((req, res) => res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: 'Unknown API route.' } }));
  app.use('/api', api);

  // ---- Pages
  const sendPage = (name, status = 200) => (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(status).sendFile(path.join(PUBLIC_DIR, name));
  };
  app.get('/l/:token', sendPage('shared-letter.html'));
  app.get('/m/:token', sendPage('shared-mixtape.html'));
  app.use((req, res, next) => (PROTECTED_PAGES.test(req.path) ? pageGuard(pool)(req, res, next) : next()));
  app.use(express.static(PUBLIC_DIR, { extensions: ['html'], index: 'index.html' }));
  app.use(sendPage('404.html', 404));

  // ---- Errors (never leak internals)
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    let { status = 500, code = 'SERVER_ERROR', message = 'Something went wrong on our side. Please try again.', extra = {} } = err;
    if (err.type === 'entity.parse.failed') [status, code, message] = [400, 'BAD_JSON', 'That request could not be read.'];
    else if (err.type === 'entity.too.large') [status, code, message] = [413, 'TOO_LARGE', 'That request is too large.'];
    else if (!err.status) console.error(`[error] ${req.method} ${req.baseUrl ? req.baseUrl : req.path.split('/')[1]}: ${err.message}`);
    if (!err.status && !['entity.parse.failed', 'entity.too.large'].includes(err.type)) { status = 500; code = 'SERVER_ERROR'; message = 'Something went wrong on our side. Please try again.'; extra = {}; }
    if (req.path.startsWith('/api')) return res.status(status).json({ ok: false, error: { code, message, ...extra } });
    res.status(status).sendFile(path.join(PUBLIC_DIR, 'error.html'));
  });

  const close = async () => { store.close(); await pool.end(); };
  return { app, pool, config, close };
}

module.exports = { createApp };
