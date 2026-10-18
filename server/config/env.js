// Loads and validates environment variables. Fails early with a readable message.
require('dotenv').config();

function loadConfig(env = process.env) {
  const missing = [];
  for (const key of ['DB_HOST', 'DB_USER', 'DB_NAME', 'SESSION_SECRET']) {
    if (!env[key]) missing.push(key);
  }
  if (env.DB_PASSWORD === undefined) missing.push('DB_PASSWORD');
  if (missing.length) {
    throw new Error(
      `Missing environment variable(s): ${missing.join(', ')}.\n` +
        'Copy .env.example to .env and fill in the values (see README, step "Create your .env file").'
    );
  }
  const isProd = env.NODE_ENV === 'production';
  if (env.SESSION_SECRET.length < 16 || (isProd && env.SESSION_SECRET.length < 32)) {
    throw new Error('SESSION_SECRET is too short. Use a long random string (see .env.example).');
  }
  const port = Number(env.PORT || 3000);
  return {
    isProd,
    port,
    baseUrl: (env.BASE_URL || `http://localhost:${port}`).replace(/\/+$/, ''),
    trustProxy: env.TRUST_PROXY === '1',
    sessionSecret: env.SESSION_SECRET,
    db: {
      host: env.DB_HOST,
      port: Number(env.DB_PORT || 3306),
      user: env.DB_USER,
      password: env.DB_PASSWORD,
      database: env.DB_NAME,
    },
  };
}

module.exports = { loadConfig };
