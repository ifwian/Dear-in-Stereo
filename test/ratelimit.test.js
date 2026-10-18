const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Client } = require('./helpers');

let s;
test.before(async () => { s = await startServer({ limits: { login: 3, register: 2, response: 3 } }); });
test.after(async () => { await s.stop(); });

test('login attempts are rate limited per client', async () => {
  const c = new Client(s.base);
  const codes = [];
  for (let i = 0; i < 5; i += 1) codes.push((await c.post('/api/auth/login', { email: 'x@example.com', password: 'wrong password 1' })).status);
  assert.deepEqual(codes, [401, 401, 401, 429, 429]);
});

test('registration is rate limited', async () => {
  const c = new Client(s.base);
  const codes = [];
  for (let i = 0; i < 3; i += 1) codes.push((await c.post('/api/auth/register', { display_name: `U${i}`, email: `u${i}@example.com`, password: 'correct horse 42' })).status);
  assert.deepEqual(codes, [201, 201, 429]);
});

test('public response submission is rate limited', async () => {
  const owner = new Client(s.base);
  await owner.post('/api/auth/login', { email: 'u0@example.com', password: 'correct horse 42' }).catch(() => {});
  const c = new Client(s.base);
  // Use a fresh owner session that is not subject to the login budget already spent above.
  const [[u]] = await s.pool.query('SELECT id FROM users WHERE email = ?', ['u0@example.com']);
  assert.ok(u.id);
  const { newToken, hashToken } = require('../server/utils/tokens');
  const token = newToken();
  await s.pool.query(
    "INSERT INTO song_letters (user_id, title, song_title, artist, song_url, recipient_name, message, status, visibility, share_token_hash, allow_responses, published_at) VALUES (?, 't', 's', 'a', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'r', 'm', 'published', 'link', ?, 1, UTC_TIMESTAMP())",
    [u.id, hashToken(token)]
  );
  const codes = [];
  for (let i = 0; i < 5; i += 1) codes.push((await c.post(`/api/public/letters/${token}/responses`, { message: `hi ${i}` }, { csrf: false })).status);
  assert.deepEqual(codes, [201, 201, 201, 429, 429]);
});
