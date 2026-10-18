const crypto = require('crypto');

// Share tokens are bearer capabilities: 256 bits of randomness, shown once, stored only as a SHA-256 hash.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

const newToken = () => crypto.randomBytes(32).toString('base64url');
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const isTokenShaped = (token) => typeof token === 'string' && TOKEN_PATTERN.test(token);
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

module.exports = { newToken, hashToken, isTokenShaped, safeEqual };
