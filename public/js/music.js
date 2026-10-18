// Browser-side mirror of server/utils/music.js, used only for instant feedback and previews.
// The server re-validates everything; embed URLs are built from validated IDs, never from user markup.
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const SPOTIFY_KINDS = ['track', 'album', 'playlist', 'episode'];
const YT_HOSTS = ['www.youtube.com', 'youtube.com', 'm.youtube.com', 'music.youtube.com'];

export function parseMusicUrl(input) {
  let url;
  try { url = new URL(String(input).trim()); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  const parts = url.pathname.split('/').filter(Boolean);
  if (host === 'open.spotify.com') {
    if (parts[0] && parts[0].startsWith('intl-')) parts.shift();
    const [kind, id] = parts;
    if (!SPOTIFY_KINDS.includes(kind) || !SPOTIFY_ID.test(id || '')) return null;
    return { provider: 'spotify', kind, url: `https://open.spotify.com/${kind}/${id}`, embedUrl: `https://open.spotify.com/embed/${kind}/${id}` };
  }
  let id = null;
  if (host === 'youtu.be') id = parts[0];
  else if (YT_HOSTS.includes(host)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else if (['shorts', 'embed', 'live'].includes(parts[0])) id = parts[1];
  }
  if (id && YOUTUBE_ID.test(id)) return { provider: 'youtube', kind: 'video', url: `https://www.youtube.com/watch?v=${id}`, embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
  return null;
}

const ALLOWED_EMBED = /^https:\/\/(open\.spotify\.com\/embed\/(track|album|playlist|episode)\/[A-Za-z0-9]{22}|www\.youtube-nocookie\.com\/embed\/[A-Za-z0-9_-]{11})$/;
export const isAllowedEmbed = (u) => ALLOWED_EMBED.test(u || '');
