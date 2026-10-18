const express = require('express');
const bcrypt = require('bcryptjs');
const { HttpError, ok, wrap } = require('../utils/errors');
const { validateRegistration, assertValid, line } = require('../utils/validate');
const { ensureCsrfToken } = require('../middleware/csrf');
const { loadUser } = require('../middleware/auth');

const ROUNDS = Math.max(process.env.NODE_ENV === 'production' ? 12 : 4, Number(process.env.BCRYPT_ROUNDS || 12));
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', ROUNDS); // equalizes timing for unknown emails

const regenerate = (req) => new Promise((resolve, reject) => req.session.regenerate((e) => (e ? reject(e) : resolve())));
const destroy = (req) => new Promise((resolve) => req.session.destroy(() => resolve()));
const publicUser = (u) => ({ id: u.id, display_name: u.display_name, email: u.email, bio: u.bio || '' });

// New session id on every login/registration (prevents session fixation).
async function startSession(req, user) {
  await regenerate(req);
  req.session.userId = user.id;
  req.session.sessionVersion = user.session_version;
  return ensureCsrfToken(req);
}

module.exports = function authRoutes({ pool, limiters }) {
  const r = express.Router();

  r.get('/csrf', (req, res) => ok(res, { csrfToken: ensureCsrfToken(req) }));

  r.get('/me', wrap(async (req, res) => {
    const user = await loadUser(pool, req);
    ok(res, { user: user ? publicUser(user) : null, csrfToken: ensureCsrfToken(req) });
  }));

  r.post('/register', limiters.register, wrap(async (req, res) => {
    const v = assertValid(validateRegistration(req.body));
    const hash = await bcrypt.hash(v.password, ROUNDS);
    let result;
    try {
      [result] = await pool.query('INSERT INTO users (display_name, email, password_hash) VALUES (?, ?, ?)', [v.display_name, v.email, hash]);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'EMAIL_TAKEN', 'Please fix the highlighted fields.', { fields: { email: 'An account with this email already exists.' } });
      throw err;
    }
    const csrfToken = await startSession(req, { id: result.insertId, session_version: 0 });
    ok(res, { user: { id: result.insertId, display_name: v.display_name, email: v.email, bio: '' }, csrfToken }, 201);
  }));

  r.post('/login', limiters.login, wrap(async (req, res) => {
    const email = line(req.body.email).toLowerCase();
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    const [rows] = await pool.query('SELECT id, display_name, email, bio, password_hash, session_version FROM users WHERE email = ?', [email]);
    const user = rows[0];
    const match = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !match) throw new HttpError(401, 'BAD_CREDENTIALS', 'Email or password is incorrect.');
    const csrfToken = await startSession(req, user);
    ok(res, { user: publicUser(user), csrfToken });
  }));

  r.post('/logout', wrap(async (req, res) => {
    await destroy(req);
    res.clearCookie('dis.sid');
    ok(res, {});
  }));

  return r;
};

module.exports.helpers = { ROUNDS, startSession, destroy, publicUser };
