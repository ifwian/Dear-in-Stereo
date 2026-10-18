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

const song = (n) => ({ track_title: `Song ${n}`, artist: `Artist ${n}`, song_url: n % 2 ? SPOTIFY : YOUTUBE });
async function newTape(c = alice, title = 'Night drive') {
  const r = await c.post('/api/mixtapes', { title, description: 'for the road', cover_theme: 'dusk' });
  assert.equal(r.status, 201);
  return r.body.data.mixtape;
}

test('create, edit, list and delete a mixtape', async () => {
  const m = await newTape();
  assert.deepEqual(m.tracks, []);
  const edit = await alice.put(`/api/mixtapes/${m.id}`, { title: 'Renamed', description: '', cover_theme: 'ink' });
  assert.equal(edit.body.data.mixtape.title, 'Renamed');
  assert.equal((await alice.post('/api/mixtapes', { title: '' })).status, 422);
  assert.equal((await alice.get('/api/mixtapes')).body.data.items[0].track_count, 0);
  assert.equal((await alice.del(`/api/mixtapes/${m.id}`)).status, 200);
  assert.equal((await alice.get(`/api/mixtapes/${m.id}`)).status, 404);
});

test('tracks: add standalone + letter-backed, numbering, removal closes gaps', async () => {
  const m = await newTape();
  const letter = (await alice.post('/api/letters', letterBody({ action: 'publish' }))).body.data.letter;
  for (let n = 1; n <= 2; n += 1) assert.equal((await alice.post(`/api/mixtapes/${m.id}/tracks`, { ...song(n), track_note: `note ${n}` })).status, 201);
  const withLetter = await alice.post(`/api/mixtapes/${m.id}/tracks`, { song_letter_id: letter.id });
  const tracks = withLetter.body.data.mixtape.tracks;
  assert.deepEqual(tracks.map((t) => t.position), [1, 2, 3]);
  assert.equal(tracks[2].track_title, 'Dreams');
  assert.equal(tracks[2].song_letter_id, letter.id);
  const removed = await alice.del(`/api/mixtapes/${m.id}/tracks/${tracks[0].id}`);
  assert.deepEqual(removed.body.data.mixtape.tracks.map((t) => t.position), [1, 2]);
});

test('track validation: bad links, both-or-neither shapes, foreign or incomplete letters, unknown ids', async () => {
  const m = await newTape();
  assert.equal((await alice.post(`/api/mixtapes/${m.id}/tracks`, { ...song(1), song_url: 'https://evil.example/x' })).status, 422);
  assert.equal((await alice.post(`/api/mixtapes/${m.id}/tracks`, { track_title: 'x' })).status, 422);
  const bobsLetter = (await bob.post('/api/letters', letterBody({ action: 'publish' }))).body.data.letter;
  assert.equal((await alice.post(`/api/mixtapes/${m.id}/tracks`, { song_letter_id: bobsLetter.id })).status, 422);
  const emptyDraft = (await alice.post('/api/letters', { title: 'no song yet', action: 'draft' })).body.data.letter;
  assert.equal((await alice.post(`/api/mixtapes/${m.id}/tracks`, { song_letter_id: emptyDraft.id })).status, 422);
  assert.equal((await alice.post(`/api/mixtapes/${m.id}/tracks`, { song_letter_id: 999999 })).status, 422);
  assert.equal((await alice.post(`/api/mixtapes/${m.id}/tracks`, { song_letter_id: 1, ...song(1) })).status, 422);
  assert.equal((await alice.del(`/api/mixtapes/${m.id}/tracks/999999`)).status, 404);
});

test('reordering persists, is atomic, and rejects bad orders', async () => {
  const m = await newTape();
  let tape;
  for (let n = 1; n <= 3; n += 1) tape = (await alice.post(`/api/mixtapes/${m.id}/tracks`, song(n))).body.data.mixtape;
  const [a, b, c] = tape.tracks.map((t) => t.id);
  const re = await alice.put(`/api/mixtapes/${m.id}/tracks/order`, { order: [c, a, b] });
  assert.deepEqual(re.body.data.mixtape.tracks.map((t) => t.id), [c, a, b]);
  assert.deepEqual((await alice.get(`/api/mixtapes/${m.id}`)).body.data.mixtape.tracks.map((t) => t.id), [c, a, b], 'persisted');
  for (const order of [[a, b], [a, a, b], [a, b, c, 999], 'x', [a, b, '3']]) {
    assert.equal((await alice.put(`/api/mixtapes/${m.id}/tracks/order`, { order })).status, 422, JSON.stringify(order));
  }
  assert.deepEqual((await alice.get(`/api/mixtapes/${m.id}`)).body.data.mixtape.tracks.map((t) => t.id), [c, a, b], 'unchanged after rejected orders');
  const other = await newTape(alice, 'Other');
  assert.equal((await alice.put(`/api/mixtapes/${other.id}/tracks/order`, { order: [c, a, b] })).status, 422, 'cannot reorder with another mixtape\'s tracks');
});

test('sharing: empty mixtapes cannot be shared; publish, view anonymously, revoke', async () => {
  const m = await newTape();
  assert.equal((await alice.post(`/api/mixtapes/${m.id}/publish`)).status, 409);
  const letter = (await alice.post('/api/letters', letterBody({ action: 'publish', message: 'PRIVATE LETTER TEXT' }))).body.data.letter;
  await alice.post(`/api/mixtapes/${m.id}/tracks`, { ...song(1), track_note: 'a note' });
  await alice.post(`/api/mixtapes/${m.id}/tracks`, { song_letter_id: letter.id });
  const pub = await alice.post(`/api/mixtapes/${m.id}/publish`);
  const token = tokenFromUrl(pub.body.data.shareUrl);
  assert.match(pub.body.data.shareUrl, /\/m\//);
  const anon = new Client(s.base);
  const view = await anon.get(`/api/public/mixtapes/${token}`);
  assert.equal(view.status, 200);
  assert.equal(view.body.data.mixtape.tracks.length, 2);
  assert.equal(view.body.data.mixtape.tracks[0].note, 'a note');
  assert.equal(view.body.data.mixtape.author, 'Alice');
  assert.ok(!view.text.includes('PRIVATE LETTER TEXT'), 'letter messages never leak through mixtapes');
  assert.ok(!view.text.includes('alice@example.com'));
  assert.equal((await anon.get(`/api/public/letters/${token}`)).status, 404, 'mixtape tokens do not open letters');
  await alice.del(`/api/mixtapes/${m.id}/share-link`);
  assert.equal((await anon.get(`/api/public/mixtapes/${token}`)).status, 404);
});

test('deleting a letter removes it from mixtapes without breaking them', async () => {
  const m = await newTape();
  const letter = (await alice.post('/api/letters', letterBody({ action: 'publish' }))).body.data.letter;
  await alice.post(`/api/mixtapes/${m.id}/tracks`, song(1));
  await alice.post(`/api/mixtapes/${m.id}/tracks`, { song_letter_id: letter.id });
  await alice.del(`/api/letters/${letter.id}`);
  const after = (await alice.get(`/api/mixtapes/${m.id}`)).body.data.mixtape;
  assert.equal(after.tracks.length, 1);
});

test('ownership: another user cannot touch my mixtape or its tracks', async () => {
  const m = await newTape();
  const t = (await alice.post(`/api/mixtapes/${m.id}/tracks`, song(1))).body.data.mixtape.tracks[0];
  const attempts = [
    bob.get(`/api/mixtapes/${m.id}`), bob.put(`/api/mixtapes/${m.id}`, { title: 'x' }), bob.del(`/api/mixtapes/${m.id}`),
    bob.post(`/api/mixtapes/${m.id}/tracks`, song(2)), bob.del(`/api/mixtapes/${m.id}/tracks/${t.id}`),
    bob.put(`/api/mixtapes/${m.id}/tracks/${t.id}`, { track_note: 'x' }), bob.put(`/api/mixtapes/${m.id}/tracks/order`, { order: [t.id] }),
    bob.post(`/api/mixtapes/${m.id}/publish`), bob.del(`/api/mixtapes/${m.id}/share-link`),
  ];
  for (const r of await Promise.all(attempts)) assert.equal(r.status, 404);
  assert.equal((await alice.get(`/api/mixtapes/${m.id}`)).body.data.mixtape.tracks.length, 1);
  assert.equal((await bob.get('/api/mixtapes')).body.data.total, 0);
});
