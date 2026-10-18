// Renders letters and mixtapes from plain data. Shared by the live preview, the owner's view,
// and the recipient pages, so what you preview is what the recipient sees.
import { h, REASONS } from './ui.js';
import { parseMusicUrl, isAllowedEmbed } from './music.js';

export function playerEl(songUrl, embed) {
  const parsed = embed ? { embedUrl: embed.embedUrl, provider: embed.provider } : parseMusicUrl(songUrl);
  const box = h('div', { class: 'player' });
  if (parsed && isAllowedEmbed(parsed.embedUrl)) {
    box.append(h('iframe', {
      src: parsed.embedUrl, 'data-provider': parsed.provider, title: `${parsed.provider === 'spotify' ? 'Spotify' : 'YouTube'} player`,
      loading: 'lazy', allow: 'encrypted-media; picture-in-picture', referrerpolicy: 'strict-origin-when-cross-origin',
      sandbox: 'allow-scripts allow-same-origin allow-presentation allow-popups', allowfullscreen: parsed.provider === 'youtube',
    }));
  }
  const external = parsed && parseMusicUrl(songUrl);
  if (external) {
    box.append(h('p', { class: 'player__fallback' }, 'Player not loading? ', h('a', { href: external.url, target: '_blank', rel: 'noopener noreferrer', text: `Open on ${external.provider === 'spotify' ? 'Spotify' : 'YouTube'}` })));
  }
  return box;
}

const reasonText = (l) => (l.reason_category === 'custom' ? l.custom_reason : REASONS[l.reason_category]) || '';

// letter: { title, song_title, artist, song_url, artwork_url, embed?, recipient_name, message,
//           reason_category, custom_reason, theme, sender_name }
export function renderLetter(l, { preview = false, withPlayer = true } = {}) {
  const ph = (value, fallback) => (value ? value : h('span', { class: 'placeholder-text', text: fallback }));
  const artwork = l.artwork_url
    ? h('div', { class: 'songcard__art' }, h('img', { src: l.artwork_url, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }))
    : h('div', { class: 'songcard__art disc', 'aria-hidden': 'true' });
  const external = parseMusicUrl(l.song_url || '');
  const sender = l.sender_name;
  return h('article', { class: `letter${preview ? ' letter--preview' : ''}`, 'data-theme': l.theme || 'paper' },
    reasonText(l) ? h('div', { class: 'letter__postmark', text: reasonText(l) }) : null,
    h('p', { class: 'letter__salute' }, 'Dear ', ph(l.recipient_name, 'someone'), ','),
    h('h2', { class: 'letter__title' }, ph(l.title, 'Your title')),
    h('div', { class: 'letter__body' }, ph(l.message, 'Your message will appear here as you write it.')),
    h('div', { class: 'songcard' }, artwork,
      h('div', {},
        h('div', { class: 'songcard__title' }, ph(l.song_title, 'Song title')),
        h('div', { class: 'songcard__artist' }, ph(l.artist, 'Artist')),
        external && !withPlayer ? h('a', { href: external.url, target: '_blank', rel: 'noopener noreferrer', text: 'Listen' }) : null)),
    withPlayer && (external || l.embed) ? playerEl(l.song_url, l.embed) : null,
    h('p', { class: 'letter__sign' }, sender ? `— ${sender}` : '— someone who is thinking of you'));
}

export const coverEl = (m, small = false) =>
  h('div', { class: `tape${small ? ' tape--small' : ''}`, 'data-theme': m.cover_theme || 'kraft', role: 'img', 'aria-label': `Mixtape cover: ${m.title || 'Untitled'}` },
    h('div', { class: 'tape__label' }, h('span', { class: 'tape__title', text: m.title || 'Untitled mixtape' })),
    h('div', { class: 'tape__window', 'aria-hidden': 'true' }, h('span', { class: 'tape__reel' }), h('span', { class: 'tape__reel' })));

// m: { title, description, cover_theme, author?, tracks: [{ title|track_title, artist, song_url, note|track_note, embed? }] }
export function renderMixtape(m, { editable = false } = {}) {
  const items = (m.tracks || []).map((t) => {
    const title = t.title || t.track_title;
    const note = t.note || t.track_note;
    const li = h('li', { class: 'track' },
      h('div', {}, h('div', { class: 'track__title', text: title }), h('div', { class: 'track__artist', text: t.artist }), note ? h('p', { class: 'track__note', text: note }) : null),
      h('div', { class: 'track__actions' }));
    const actions = li.querySelector('.track__actions');
    const holder = h('div');
    let open = false;
    actions.append(h('button', { type: 'button', class: 'btn btn--small', 'aria-expanded': 'false', text: 'Play', onclick: (e) => {
      open = !open;
      e.currentTarget.setAttribute('aria-expanded', String(open));
      e.currentTarget.textContent = open ? 'Hide player' : 'Play';
      holder.replaceChildren(...(open ? [playerEl(t.song_url, t.embed)] : []));
    } }));
    li.append(holder);
    return li;
  });
  return h('section', { class: 'tape-sheet' },
    h('div', { class: 'tape-sheet__head' }, coverEl(m),
      h('div', {}, h('h2', { text: m.title || 'Untitled mixtape' }),
        m.description ? h('p', { class: 'letter__body', text: m.description }) : null,
        m.author ? h('p', { class: 'small muted', text: `Made by ${m.author}` }) : null)),
    items.length ? h('ol', { class: 'tracks' }, items) : h('p', { class: 'muted', text: 'No tracks yet.' }));
}
