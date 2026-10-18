const rateLimit = require('express-rate-limit');

// Limits are overridable (tests use small values). Keyed by client IP.
function makeLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).json({ ok: false, error: { code: 'RATE_LIMITED', message } }),
  });
}

function createLimiters(overrides = {}) {
  return {
    login: makeLimiter({ windowMs: 15 * 60 * 1000, max: overrides.login ?? 10, message: 'Too many sign-in attempts. Wait a few minutes and try again.' }),
    register: makeLimiter({ windowMs: 60 * 60 * 1000, max: overrides.register ?? 10, message: 'Too many accounts created from this network. Try again later.' }),
    response: makeLimiter({ windowMs: 10 * 60 * 1000, max: overrides.response ?? 5, message: 'You have sent several responses already. Please wait a little before sending another.' }),
    lookup: makeLimiter({ windowMs: 60 * 1000, max: overrides.lookup ?? 30, message: 'Too many lookups. Slow down for a minute.' }),
  };
}

module.exports = { createLimiters };
