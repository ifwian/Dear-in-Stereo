const { HttpError, wrap } = require('../utils/errors');

// Loads the signed-in user from MySQL on every request. This means a deleted account or a
// "sign out everywhere" (session_version bump) takes effect immediately.
async function loadUser(pool, req) {
  const id = req.session && req.session.userId;
  if (!id) return null;
  const [rows] = await pool.query(
    'SELECT id, display_name, email, bio, session_version, created_at FROM users WHERE id = ?',
    [id]
  );
  const user = rows[0];
  if (!user || user.session_version !== req.session.sessionVersion) return null;
  return user;
}

function requireAuth(pool) {
  return wrap(async (req, res, next) => {
    const user = await loadUser(pool, req);
    if (!user) {
      if (req.session) await new Promise((r) => req.session.regenerate(() => r()));
      throw new HttpError(401, 'UNAUTHENTICATED', 'Please sign in to continue.');
    }
    req.user = user;
    next();
  });
}

// For HTML pages: redirect to the login page instead of returning JSON.
function pageGuard(pool) {
  return wrap(async (req, res, next) => {
    const user = await loadUser(pool, req);
    if (user) return next();
    res.redirect(`/login.html?next=${encodeURIComponent(req.originalUrl)}`);
  });
}

module.exports = { requireAuth, pageGuard, loadUser };
