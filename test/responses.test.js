const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Client, letterBody, tokenFromUrl } = require('./helpers');

let s; let alice; let bob; let anon;
test.before(async () => {
  s = await startServer();
  alice = new Client(s.base); bob = new Client(s.base); anon = new Client(s.base);
  await alice.signUp('Alice', 'alice@example.com');
  await bob.signUp('Bob', 'bob@example.com');
});
test.after(async () => { await s.stop(); });

async function publish(over = {}) {
  const r = await alice.post('/api/letters', letterBody({ action: 'publish', ...over }));
  return { id: r.body.data.letter.id, token: tokenFromUrl(r.body.data.shareUrl) };
}
const reply = (token, body, opts) => anon.post(`/api/public/letters/${token}/responses`, body, { csrf: false, ...opts });

test('recipients can respond without an account; only the owner sees it', async () => {
  const { id, token } = await publish();
  const r = await reply(token, { display_name: 'Sam', message: '<b>Thank you</b> so much' });
  assert.equal(r.status, 201);
  const mine = await alice.get(`/api/letters/${id}/responses`);
  assert.equal(mine.body.data.responses.length, 1);
  assert.equal(mine.body.data.responses[0].message, '<b>Thank you</b> so much', 'stored as text; escaped when rendered');
  assert.equal((await bob.get(`/api/letters/${id}/responses`)).status, 404);
  assert.equal((await bob.get('/api/responses')).body.data.total, 0);
  assert.equal((await alice.get('/api/responses')).body.data.total, 1);
  assert.equal((await anon.get(`/api/letters/${id}/responses`)).status, 401);
  assert.equal((await anon.get(`/api/public/letters/${token}`)).body.data.responses, undefined);
});

test('responses are rejected when disabled, invalid, or the link is not usable', async () => {
  const off = await publish({ allow_responses: false });
  const disabled = await reply(off.token, { message: 'hello' });
  assert.equal(disabled.status, 403);
  assert.equal(disabled.body.error.code, 'RESPONSES_DISABLED');
  const { token, id } = await publish();
  assert.equal((await reply(token, { message: '' })).status, 422);
  assert.equal((await reply(token, { message: 'x'.repeat(1001) })).status, 422);
  assert.equal((await reply(token, { message: 'hi', display_name: 'n'.repeat(61) })).status, 422);
  assert.equal((await reply(token, 'message=hi', { headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status, 415);
  assert.equal((await reply('B'.repeat(43), { message: 'hi' })).status, 404);
  assert.equal((await reply('short', { message: 'hi' })).status, 404);
  await alice.del(`/api/letters/${id}/share-link`);
  assert.equal((await reply(token, { message: 'hi' })).status, 404, 'revoked');
  const scheduled = await publish({ scheduled_at: new Date(Date.now() + 3600e3).toISOString() });
  assert.equal((await reply(scheduled.token, { message: 'hi' })).status, 403, 'not yet open');
  const [[{ n }]] = await s.pool.query('SELECT COUNT(*) AS n FROM responses WHERE song_letter_id = ?', [scheduled.id]);
  assert.equal(n, 0);
});

test('dashboard counts come from real records', async () => {
  const d = (await alice.get('/api/dashboard')).body.data;
  const [[row]] = await s.pool.query("SELECT COUNT(*) AS n FROM song_letters WHERE user_id = (SELECT id FROM users WHERE email='alice@example.com') AND status <> 'archived'");
  assert.equal(d.counts.letters, row.n);
  assert.equal(d.counts.mixtapes, 0);
  assert.ok(d.recentLetters.length <= 5);
  const fresh = new Client(s.base);
  await fresh.signUp('New', 'new@example.com');
  const empty = (await fresh.get('/api/dashboard')).body.data;
  assert.deepEqual([empty.counts.letters, empty.counts.mixtapes, empty.counts.responses], [0, 0, 0]);
});
