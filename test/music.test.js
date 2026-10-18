const test = require('node:test');
const assert = require('node:assert/strict');
const { parseMusicUrl, parseArtworkUrl } = require('../server/utils/music');

test('accepts and normalizes Spotify links', () => {
  const p = parseMusicUrl('https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC?si=abc');
  assert.equal(p.provider, 'spotify');
  assert.equal(p.url, 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC');
  assert.equal(p.embedUrl, 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC');
});

test('accepts and normalizes YouTube link variants', () => {
  for (const u of ['https://youtu.be/dQw4w9WgXcQ?t=5', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x', 'https://music.youtube.com/watch?v=dQw4w9WgXcQ', 'https://www.youtube.com/shorts/dQw4w9WgXcQ']) {
    const p = parseMusicUrl(u);
    assert.equal(p.provider, 'youtube', u);
    assert.equal(p.embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  }
});

test('rejects unsafe, unsupported and malformed links', () => {
  for (const u of [
    'javascript:alert(1)', 'http://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC', 'https://evil.com/track/4uLU6hMCjMI75M1A2tKUQC',
    'https://open.spotify.com.evil.com/track/4uLU6hMCjMI75M1A2tKUQC', 'https://user:pw@open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC',
    'https://open.spotify.com/track/short', 'https://www.youtube.com/watch?v=<script>', '<iframe src="https://open.spotify.com/embed/track/x">',
    'https://soundcloud.com/a/b', '', null, 42, 'https://open.spotify.com:8443/track/4uLU6hMCjMI75M1A2tKUQC',
  ]) assert.equal(parseMusicUrl(u), null, String(u));
});

test('artwork URLs must be https', () => {
  assert.ok(parseArtworkUrl('https://i.scdn.co/image/abc'));
  assert.equal(parseArtworkUrl('javascript:alert(1)'), null);
  assert.equal(parseArtworkUrl('http://example.com/a.jpg'), null);
});
