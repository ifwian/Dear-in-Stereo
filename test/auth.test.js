const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Client } = require('./helpers');

let s;
test.before(async () => { s = await startServer(); });
test.after(async () => { await s.stop(); });

test('registers a user, logs them in, and stores a bcrypt hash', async () => {
  const c = new Client(s.base);
  const r = await c.signUp('Ada', 'Ada@Example.com');
  assert.equal(r.body.data.user.email, 'ada@example.com');
  const me = await c.get('/api/auth/me');
  assert.equal(me.body.data.user.display_name, 'Ada');
  const [[row]] = await s.pool.query('SELECT password_hash FROM users WHERE email = ?', ['ada@example.com']);
  assert.match(row.password_hash, /^\$2[aby]\$/);
  assert.ok(!row.password_hash.includes('correct horse'));
});

test('rejects duplicate emails and invalid registrations', async () => {
  const c = new Client(s.base);
  const dup = await c.post('/api/auth/register', { display_name: 'Ada 2', email: 'ada@example.com', password: 'correct horse 42' });
  assert.equal(dup.status, 409);
  assert.ok(dup.body.error.fields.email);
  const bad = await c.post('/api/auth/register', { display_name: 'A', email: 'nope', password: 'short' });
  assert.equal(bad.status, 422);
  assert.deepEqual(Object.keys(bad.body.error.fields).sort(), ['display_name', 'email', 'password']);
  const letters = await c.post('/api/auth/register', { display_name: 'Pat', email: 'pat@example.com', password: 'onlyletterspassword' });
  assert.equal(letters.status, 422);
});

test('login succeeds with correct credentials and fails generically otherwise', async () => {
  const c = new Client(s.base);
  const wrongPw = await c.post('/api/auth/login', { email: 'ada@example.com', password: 'wrong password 1' });
  const noUser = await c.post('/api/auth/login', { email: 'nobody@example.com', password: 'wrong password 1' });
  assert.equal(wrongPw.status, 401);
  assert.equal(noUser.status, 401);
  assert.equal(wrongPw.body.error.message, noUser.body.error.message);
  const ok = await c.post('/api/auth/login', { email: 'ADA@example.com', password: 'correct horse 42' });
  assert.equal(ok.status, 200);
});

test('login regenerates the session id (no session fixation)', async () => {
  const c = new Client(s.base);
  await c.syncCsrf();
  const before = c.cookie;
  await c.post('/api/auth/login', { email: 'ada@example.com', password: 'correct horse 42' });
  assert.notEqual(c.cookie, before);
});

test('logout destroys the session', async () => {
  const c = new Client(s.base);
  await c.post('/api/auth/login', { email: 'ada@example.com', password: 'correct horse 42' });
  const oldCookie = c.cookie;
  assert.equal((await c.post('/api/auth/logout')).status, 200);
  const replay = new Client(s.base);
  replay.cookie = oldCookie;
  assert.equal((await replay.get('/api/letters')).status, 401);
});

test('protected API and pages require authentication', async () => {
  const c = new Client(s.base);
  assert.equal((await c.get('/api/letters')).status, 401);
  assert.equal((await c.get('/api/mixtapes')).status, 401);
  assert.equal((await c.get('/api/dashboard')).status, 401);
  for (const page of ['/dashboard', '/dashboard.html', '/letters/', '/letters/edit.html', '/mixtapes/', '/responses', '/account']) {
    const r = await c.get(page, { raw: true });
    assert.equal(r.status, 302, page);
    assert.match(r.headers.get('location'), /^\/login\.html\?next=/);
  }
});

test('state-changing requests without a valid CSRF token are rejected', async () => {
  const c = new Client(s.base);
  await c.post('/api/auth/login', { email: 'ada@example.com', password: 'correct horse 42' });
  const noToken = await c.post('/api/letters', { title: 'x' }, { csrf: false });
  assert.equal(noToken.status, 403);
  assert.equal(noToken.body.error.code, 'CSRF');
  const wrong = await c.post('/api/letters', { title: 'x' }, { csrf: false, headers: { 'x-csrf-token': 'nope' } });
  assert.equal(wrong.status, 403);
});

test('password change requires the current password and signs out other devices', async () => {
  const a = new Client(s.base);
  const b = new Client(s.base);
  await a.post('/api/auth/login', { email: 'ada@example.com', password: 'correct horse 42' });
  await b.post('/api/auth/login', { email: 'ada@example.com', password: 'correct horse 42' });
  const bad = await a.post('/api/account/password', { current_password: 'nope', new_password: 'new password 99' });
  assert.equal(bad.status, 422);
  const good = await a.post('/api/account/password', { current_password: 'correct horse 42', new_password: 'new password 99' });
  assert.equal(good.status, 200);
  assert.equal((await a.get('/api/letters')).status, 200, 'this device stays signed in');
  assert.equal((await b.get('/api/letters')).status, 401, 'other device is signed out');
  assert.equal((await new Client(s.base).post('/api/auth/login', { email: 'ada@example.com', password: 'new password 99' })).status, 200);
});

test('account deletion needs password + confirmation and removes the data', async () => {
  const c = new Client(s.base);
  await c.signUp('Temp', 'temp@example.com');
  await c.post('/api/letters', { title: 'bye' });
  assert.equal((await c.del('/api/account', { password: 'correct horse 42', confirm: 'nope' })).status, 422);
  assert.equal((await c.del('/api/account', { password: 'wrong password 1', confirm: 'DELETE' })).status, 422);
  assert.equal((await c.del('/api/account', { password: 'correct horse 42', confirm: 'DELETE' })).status, 200);
  const [[{ n }]] = await s.pool.query("SELECT COUNT(*) AS n FROM users WHERE email = 'temp@example.com'");
  assert.equal(n, 0);
  const [[{ orphans }]] = await s.pool.query('SELECT COUNT(*) AS orphans FROM song_letters WHERE user_id NOT IN (SELECT id FROM users)');
  assert.equal(orphans, 0);
  assert.equal((await c.get('/api/letters')).status, 401);
});
