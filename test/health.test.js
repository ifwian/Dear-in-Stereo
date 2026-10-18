const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../server/config/env');
const { startServer, Client } = require('./helpers');

test('missing environment variables fail early with a readable message', () => {
  assert.throws(() => loadConfig({}), /Missing environment variable\(s\): DB_HOST, DB_USER, DB_NAME, SESSION_SECRET, DB_PASSWORD/);
  assert.throws(() => loadConfig({ DB_HOST: 'h', DB_USER: 'u', DB_NAME: 'd', DB_PASSWORD: '', SESSION_SECRET: 'short' }), /SESSION_SECRET is too short/);
  assert.doesNotThrow(() => loadConfig({ DB_HOST: 'h', DB_USER: 'u', DB_NAME: 'd', DB_PASSWORD: '', SESSION_SECRET: 'x'.repeat(32) }));
});

test('unknown routes, malformed JSON, oversized bodies and DB failures are handled safely', async () => {
  const s = await startServer();
  try {
    const c = new Client(s.base);
    const page = await c.get('/definitely-missing', { raw: true });
    assert.equal(page.status, 404);
    assert.match(await page.text(), /<html/i);
    const api = await c.get('/api/nope');
    assert.equal(api.status, 404);
    assert.equal(api.body.error.code, 'NOT_FOUND');
    const bad = await c.post('/api/auth/login', '{not json', { csrf: false, headers: { 'content-type': 'application/json' } });
    assert.equal(bad.status, 400);
    const big = await c.post('/api/auth/login', { email: 'a'.repeat(80000) }, { csrf: false });
    assert.equal(big.status, 413);
    const shared = await c.get('/l/whatever', { raw: true });
    assert.equal(shared.status, 200, 'share page shell always loads; the API decides what is visible');
    assert.equal(shared.headers.get('cache-control'), 'no-store');
    // Simulate the database going away: a generic 500, no internals leaked.
    await s.pool.end();
    const down = await c.get('/api/public/letters/' + 'A'.repeat(43));
    assert.equal(down.status, 500);
    assert.equal(down.body.error.code, 'SERVER_ERROR');
    assert.ok(!/mysql|pool|closed|sql/i.test(down.text));
  } finally {
    await new Promise((r) => s.stop().then(r, r));
  }
});
