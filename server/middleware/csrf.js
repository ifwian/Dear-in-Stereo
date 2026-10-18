const { newToken, safeEqual } = require('../utils/tokens');
const { HttpError } = require('../utils/errors');

// Synchronizer-token CSRF protection. The token lives in the server-side session and must be
// echoed back in the `X-CSRF-Token` header on every state-changing request.
function ensureCsrfToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = newToken();
  return req.session.csrfToken;
}

function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = req.get('x-csrf-token');
  if (!req.session.csrfToken || !sent || !safeEqual(sent, req.session.csrfToken)) {
    return next(new HttpError(403, 'CSRF', 'Your session expired. Refresh the page and try again.'));
  }
  next();
}

module.exports = { ensureCsrfToken, csrfProtection };
