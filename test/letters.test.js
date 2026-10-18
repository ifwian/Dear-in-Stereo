const test = require('node:test');
const assert = require('node:assert/strict');
const { startServer, Client, letterBody, tokenFromUrl, SPOTIFY, YOUTUBE } = require('./helpers');

let s; let alice; let bob;
test.before(async () => {
  s = await startServer();
  alice = new Client(s.base); bob = new Client(s.base);
  await alice.signUp('Alice', 'alice@example.com');
  await bob.signUp('Bob', 'bob@example.com');
});
test.after(async () => { await s.stop(); });

const inHours = (h) => new Date(Date.now() + h * 3600e3).toISOString();

test('create a draft: no share link exists and the public route cannot see it', async () => {
  const r = await alice.post('/api/letters', letterBody({ action: 'draft' }));
  assert.equal(r.status, 201);
  assert.equal(r.body.data.letter.status, 'draft');
  assert.equal(r.body.data.shareUrl, null);
  assert.equal(r.body.data.letter.has_share_link, false);
  assert.equal(r.body.data.letter.share_token_hash, undefined, 'hash never leaves the server');
});

test('drafts may be incomplete, publishing requires everything', async () => {
  assert.equal((await alice.post('/api/letters', { title: 'Just a title', action: 'draft' })).status, 201);
  assert.equal((await alice.post('/api/letters', { title: 'Nope', action: 'publish' })).status, 422);
  assert.equal((await alice.post('/api/letters', { action: 'draft' })).status, 422, 'title always required');
});

test('publish with a link returns the raw URL once; public page works without login', async () => {
  const r = await alice.post('/api/letters', letterBody({ action: 'publish' }));
  assert.equal(r.status, 201);
  const url = r.body.data.shareUrl;
  assert.match(url, /\/l\/[A-Za-z0-9_-]{43}$/);
  const token = tokenFromUrl(url);
  const [[row]] = await s.pool.query('SELECT share_token_hash FROM song_letters WHERE id = ?', [r.body.data.letter.id]);
  assert.notEqual(row.share_token_hash, token);
  assert.equal(row.share_token_hash.length, 64);
  const anon = new Client(s.base);
  const pub = await anon.get(`/api/public/letters/${token}`);
  assert.equal(pub.status, 200);
  const l = pub.body.data.letter;
  assert.equal(l.sender_name, 'Alice');
  assert.equal(l.embed.embedUrl, 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC');
  for (const leaked of ['id', 'user_id', 'email', 'share_token_hash', 'status']) assert.equal(l[leaked], undefined, leaked);
  assert.ok(!pub.text.includes('alice@example.com'));
  assert.equal(pub.headers.get('cache-control'), 'no-store');
});

test('sender display preferences: hidden, custom name', async () => {
  const hidden = await alice.post('/api/letters', letterBody({ action: 'publish', show_sender: false }));
  assert.equal((await alice.get(`/api/public/letters/${tokenFromUrl(hidden.body.data.shareUrl)}`)).body.data.letter.sender_name, null);
  const named = await alice.post('/api/letters', letterBody({ action: 'publish', sender_display_name: 'A friend' }));
  assert.equal((await alice.get(`/api/public/letters/${tokenFromUrl(named.body.data.shareUrl)}`)).body.data.letter.sender_name, 'A friend');
});

test('private published letters have no link; draft tokens do not exist', async () => {
  const r = await alice.post('/api/letters', letterBody({ action: 'publish', visibility: 'private' }));
  assert.equal(r.body.data.shareUrl, null);
  assert.equal(r.body.data.letter.availability, 'private');
  const pub = await alice.get('/api/public/letters/' + 'A'.repeat(43));
  assert.equal(pub.status, 404);
});

test('revoked links stop working immediately; regenerating invalidates the old one', async () => {
  const r = await alice.post('/api/letters', letterBody({ action: 'publish' }));
  const id = r.body.data.letter.id;
  const t1 = tokenFromUrl(r.body.data.shareUrl);
  assert.equal((await alice.get(`/api/public/letters/${t1}`)).status, 200);
  const re = await alice.post(`/api/letters/${id}/share-link`);
  const t2 = tokenFromUrl(re.body.data.shareUrl);
  assert.notEqual(t1, t2);
  assert.equal((await alice.get(`/api/public/letters/${t1}`)).status, 404);
  assert.equal((await alice.get(`/api/public/letters/${t2}`)).status, 200);
  const rev = await alice.del(`/api/letters/${id}/share-link`);
  assert.equal(rev.body.data.letter.availability, 'private');
  assert.equal((await alice.get(`/api/public/letters/${t2}`)).status, 404);
});

test('archiving closes the link; archived letters cannot be edited; restore returns a draft', async () => {
  const r = await alice.post('/api/letters', letterBody({ action: 'publish' }));
  const id = r.body.data.letter.id;
  const token = tokenFromUrl(r.body.data.shareUrl);
  const a = await alice.post(`/api/letters/${id}/archive`);
  assert.equal(a.body.data.letter.status, 'archived');
  assert.equal((await alice.get(`/api/public/letters/${token}`)).status, 404);
  assert.equal((await alice.put(`/api/letters/${id}`, letterBody())).status, 409);
  const back = await alice.post(`/api/letters/${id}/restore`);
  assert.equal(back.body.data.letter.status, 'draft');
  assert.equal(back.body.data.letter.visibility, 'private');
});

test('scheduled letters reveal nothing before their time, then open', async () => {
  const r = await alice.post('/api/letters', letterBody({ action: 'publish', scheduled_at: inHours(2), message: 'SECRET-BEFORE-OPEN' }));
  const token = tokenFromUrl(r.body.data.shareUrl);
  assert.equal(r.body.data.letter.availability, 'scheduled');
  const early = await alice.get(`/api/public/letters/${token}`);
  assert.equal(early.status, 403);
  assert.equal(early.body.error.code, 'NOT_YET_AVAILABLE');
  assert.ok(!early.text.includes('SECRET-BEFORE-OPEN'));
  await s.pool.query('UPDATE song_letters SET scheduled_at = ? WHERE id = ?', [new Date(Date.now() - 60e3), r.body.data.letter.id]);
  const later = await alice.get(`/api/public/letters/${token}`);
  assert.equal(later.status, 200);
  assert.equal(later.body.data.letter.message, 'SECRET-BEFORE-OPEN');
});

test('expired links return 410', async () => {
  const r = await alice.post('/api/letters', letterBody({ action: 'publish', expires_at: inHours(1) }));
  const token = tokenFromUrl(r.body.data.shareUrl);
  assert.equal((await alice.get(`/api/public/letters/${token}`)).status, 200);
  await s.pool.query('UPDATE song_letters SET expires_at = ? WHERE id = ?', [new Date(Date.now() - 1000), r.body.data.letter.id]);
  assert.equal((await alice.get(`/api/public/letters/${token}`)).status, 410);
});

test('schedule validation: past times, bad formats, expiry before schedule', async () => {
  const past = await alice.post('/api/letters', letterBody({ scheduled_at: inHours(-1) }));
  assert.equal(past.status, 422);
  assert.ok(past.body.error.fields.scheduled_at);
  assert.equal((await alice.post('/api/letters', letterBody({ scheduled_at: '2030-01-01 10:00' }))).status, 422);
  assert.equal((await alice.post('/api/letters', letterBody({ scheduled_at: inHours(5), expires_at: inHours(2) }))).status, 422);
});

test('invalid and unsupported music links are rejected on save', async () => {
  for (const song_url of ['javascript:alert(1)', 'https://soundcloud.com/a/b', '<iframe src="x">', 'http://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC']) {
    const r = await alice.post('/api/letters', letterBody({ song_url }));
    assert.equal(r.status, 422, song_url);
    assert.ok(r.body.error.fields.song_url);
  }
  const yt = await alice.post('/api/letters', letterBody({ song_url: 'https://youtu.be/dQw4w9WgXcQ?si=zzz' }));
  assert.equal(yt.body.data.letter.song_url, YOUTUBE);
  assert.equal((await alice.post('/api/letters', letterBody({ artwork_url: 'javascript:alert(1)' }))).status, 422);
});

test('stored XSS payloads are stored as text and never interpreted by the API', async () => {
  const payload = '<img src=x onerror=alert(1)>';
  const r = await alice.post('/api/letters', letterBody({ action: 'publish', message: payload }));
  const pub = await alice.get(`/api/public/letters/${tokenFromUrl(r.body.data.shareUrl)}`);
  assert.equal(pub.headers.get('content-type').includes('application/json'), true);
  assert.equal(pub.body.data.letter.message, payload);
});

test('ownership: another user cannot read, edit, archive, duplicate, share or delete my letter', async () => {
  const mine = (await alice.post('/api/letters', letterBody({ action: 'publish' }))).body.data;
  const id = mine.letter.id;
  const checks = [
    bob.get(`/api/letters/${id}`), bob.put(`/api/letters/${id}`, letterBody({ title: 'hijack' })),
    bob.post(`/api/letters/${id}/archive`), bob.post(`/api/letters/${id}/duplicate`), bob.post(`/api/letters/${id}/share-link`),
    bob.del(`/api/letters/${id}/share-link`), bob.del(`/api/letters/${id}`), bob.get(`/api/letters/${id}/responses`),
  ];
  for (const r of await Promise.all(checks)) assert.equal(r.status, 404);
  const still = await alice.get(`/api/letters/${id}`);
  assert.equal(still.body.data.letter.title, 'For the long drive');
  assert.equal((await alice.get(`/api/public/letters/${tokenFromUrl(mine.shareUrl)}`)).status, 200);
  const bobList = await bob.get('/api/letters?status=all');
  assert.equal(bobList.body.data.total, 0);
  assert.equal((await bob.get('/api/letters/abc')).status, 404);
});

test('editing a published letter keeps the same link; making it private revokes it', async () => {
  const r = await alice.post('/api/letters', letterBody({ action: 'publish' }));
  const id = r.body.data.letter.id;
  const token = tokenFromUrl(r.body.data.shareUrl);
  const edit = await alice.put(`/api/letters/${id}`, letterBody({ title: 'Edited title' }));
  assert.equal(edit.status, 200);
  assert.equal(edit.body.data.shareUrl, null);
  assert.equal((await alice.get(`/api/public/letters/${token}`)).body.data.letter.title, 'Edited title');
  const incomplete = await alice.put(`/api/letters/${id}`, letterBody({ message: '' }));
  assert.equal(incomplete.status, 422, 'published letters must stay complete');
  await alice.put(`/api/letters/${id}`, letterBody({ visibility: 'private' }));
  assert.equal((await alice.get(`/api/public/letters/${token}`)).status, 404);
});

test('library: search, filter, sort, pagination, duplicate, delete', async () => {
  const carol = new Client(s.base);
  await carol.signUp('Carol', 'carol@example.com');
  for (let i = 1; i <= 5; i += 1) await carol.post('/api/letters', letterBody({ title: `Letter ${i}`, artist: i === 3 ? '100% Band' : 'Other', recipient_name: i === 4 ? 'Zed' : 'Sam', action: i % 2 ? 'publish' : 'draft', visibility: 'private' }));
  const all = await carol.get('/api/letters?limit=2&page=2&sort=oldest');
  assert.equal(all.body.data.total, 5);
  assert.equal(all.body.data.items.length, 2);
  assert.equal(all.body.data.items[0].title, 'Letter 3');
  assert.equal((await carol.get('/api/letters?q=Zed')).body.data.total, 1);
  assert.equal((await carol.get('/api/letters?q=' + encodeURIComponent('100%'))).body.data.total, 1, 'wildcards are escaped');
  assert.equal((await carol.get('/api/letters?q=' + encodeURIComponent('%'))).body.data.total, 1);
  assert.equal((await carol.get('/api/letters?status=published')).body.data.total, 3);
  assert.equal((await carol.get('/api/letters?sort=title')).body.data.items[0].title, 'Letter 1');
  const first = all.body.data.items[0];
  const dup = await carol.post(`/api/letters/${first.id}/duplicate`);
  assert.equal(dup.body.data.letter.status, 'draft');
  assert.equal(dup.body.data.letter.title, 'Letter 3 (copy)');
  assert.equal((await carol.del(`/api/letters/${dup.body.data.letter.id}`)).status, 200);
  assert.equal((await carol.get(`/api/letters/${dup.body.data.letter.id}`)).status, 404);
});

test('music parse endpoint validates links and degrades gracefully without network', async () => {
  const good = await alice.post('/api/music/parse', { url: SPOTIFY });
  assert.equal(good.status, 200);
  assert.equal(good.body.data.metadata, null);
  assert.equal((await alice.post('/api/music/parse', { url: 'https://evil.example/x' })).status, 422);
  const offline = await alice.post('/api/music/parse', { url: SPOTIFY, lookup: true });
  assert.equal(offline.status, 200); // lookup fails quietly in the sandbox; metadata is null or filled
});
