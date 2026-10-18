// Parses and normalizes Spotify and YouTube links. Embed URLs are BUILT from validated IDs —
// user-supplied embed HTML or arbitrary URLs are never trusted.
const SPOTIFY_HOSTS = new Set(['open.spotify.com']);
const YOUTUBE_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com', 'music.youtube.com']);
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const SPOTIFY_KINDS = new Set(['track', 'album', 'playlist', 'episode']);

function parseMusicUrl(input) {
  if (typeof input !== 'string') return null;
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  // https only; no credentials, no custom ports.
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);

  if (SPOTIFY_HOSTS.has(host)) {
    if (parts[0] && parts[0].startsWith('intl-')) parts.shift(); // e.g. /intl-de/track/ID
    const [kind, id] = parts;
    if (!SPOTIFY_KINDS.has(kind) || !SPOTIFY_ID.test(id || '')) return null;
    return {
      provider: 'spotify',
      kind,
      id,
      url: `https://open.spotify.com/${kind}/${id}`,
      embedUrl: `https://open.spotify.com/embed/${kind}/${id}`,
    };
  }

  let videoId = null;
  if (host === 'youtu.be') videoId = parts[0];
  else if (YOUTUBE_HOSTS.has(host)) {
    if (url.pathname === '/watch') videoId = url.searchParams.get('v');
    else if (['shorts', 'embed', 'live'].includes(parts[0])) videoId = parts[1];
  }
  if (videoId && YOUTUBE_ID.test(videoId)) {
    return {
      provider: 'youtube',
      kind: 'video',
      id: videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
    };
  }
  return null;
}

// Validates an optional artwork URL: https only, no credentials.
function parseArtworkUrl(input) {
  try {
    const url = new URL(String(input).trim());
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url.toString();
  } catch {
    return null;
  }
}

// Official oEmbed endpoints (no API key). Only called with an already-normalized URL on fixed hosts.
async function lookupMetadata(parsed, fetchImpl = fetch) {
  const endpoint =
    parsed.provider === 'spotify'
      ? 'https://open.spotify.com/oembed'
      : 'https://www.youtube.com/oembed';
  try {
    const res = await fetchImpl(`${endpoint}?url=${encodeURIComponent(parsed.url)}`, {
      signal: AbortSignal.timeout(4000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const body = await res.json();
    const thumb = typeof body.thumbnail_url === 'string' ? parseArtworkUrl(body.thumbnail_url) : null;
    return {
      title: typeof body.title === 'string' ? body.title.slice(0, 200) : null,
      artist: parsed.provider === 'youtube' && typeof body.author_name === 'string' ? body.author_name.slice(0, 200) : null,
      artworkUrl: thumb,
    };
  } catch {
    return null; // offline, blocked, or provider error: the user simply types the details
  }
}

module.exports = { parseMusicUrl, parseArtworkUrl, lookupMetadata };
