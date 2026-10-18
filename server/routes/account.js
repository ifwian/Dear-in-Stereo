const express = require('express');
const bcrypt = require('bcryptjs');
const { HttpError, ok, wrap } = require('../utils/errors');
const { passwordProblem, line, assertValid } = require('../utils/validate');
const { requireAuth } = require('../middleware/auth');
const { ensureCsrfToken } = require('../middleware/csrf');
const { ROUNDS, startSession, destroy, publicUser } = require('./auth').helpers;

module.exports = function accountRoutes({ pool, limiters }) {
  const r = express.Router();
  r.use(requireAuth(pool));

  const verifyPassword = async (userId, password) => {
    const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [userId]);
    return typeof password === 'string' && rows[0] && (await bcrypt.compare(password, rows[0].password_hash));
  };

  r.get('/', wrap(async (req, res) => {
    const [[stats]] = await pool.query(
      `SELECT (SELECT COUNT(*) FROM song_letters WHERE user_id = ?) AS letters,
              (SELECT COUNT(*) FROM mixtapes WHERE user_id = ?) AS mixtapes`, [req.user.id, req.user.id]);
    ok(res, { user: publicUser(req.user), created_at: req.user.created_at, stats });
  }));

  r.put('/', wrap(async (req, res) => {
    const display_name = line(req.body.display_name);
    const bio = line(req.body.bio);
    const fields = {};
    if (display_name.length < 2 || display_name.length > 60) fields.display_name = 'Display name must be 2–60 characters.';
    if (bio.length > 280) fields.bio = 'Bio must be 280 characters or fewer.';
    assertValid({ value: null, fields });
    await pool.query('UPDATE users SET display_name = ?, bio = ? WHERE id = ?', [display_name, bio || null, req.user.id]);
    ok(res, { user: { ...publicUser(req.user), display_name, bio } });
  }));

  r.post('/password', limiters.login, wrap(async (req, res) => {
    if (!(await verifyPassword(req.user.id, req.body.current_password))) {
      throw new HttpError(422, 'VALIDATION', 'Please fix the highlighted fields.', { fields: { current_password: 'Your current password is incorrect.' } });
    }
    const problem = passwordProblem(req.body.new_password);
    if (problem) throw new HttpError(422, 'VALIDATION', 'Please fix the highlighted fields.', { fields: { new_password: problem } });
    const hash = await bcrypt.hash(req.body.new_password, ROUNDS);
    // Bumping session_version signs out every other device; this device gets a fresh session.
    await pool.query('UPDATE users SET password_hash = ?, session_version = session_version + 1 WHERE id = ?', [hash, req.user.id]);
    const csrfToken = await startSession(req, { id: req.user.id, session_version: req.user.session_version + 1 });
    ok(res, { csrfToken });
  }));

  r.post('/sign-out-everywhere', wrap(async (req, res) => {
    await pool.query('UPDATE users SET session_version = session_version + 1 WHERE id = ?', [req.user.id]);
    await destroy(req);
    res.clearCookie('dis.sid');
    ok(res, {});
  }));

  r.delete('/', limiters.login, wrap(async (req, res) => {
    if (req.body.confirm !== 'DELETE') throw new HttpError(422, 'VALIDATION', 'Please fix the highlighted fields.', { fields: { confirm: 'Type DELETE to confirm.' } });
    if (!(await verifyPassword(req.user.id, req.body.password))) {
      throw new HttpError(422, 'VALIDATION', 'Please fix the highlighted fields.', { fields: { password: 'Your password is incorrect.' } });
    }
    await pool.query('DELETE FROM users WHERE id = ?', [req.user.id]); // letters, mixtapes, tracks, responses cascade
    await destroy(req);
    res.clearCookie('dis.sid');
    ok(res, { deleted: true });
  }));

  return r;
};
