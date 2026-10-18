import { initShell } from '../shell.js';
import { get } from '../api.js';
import { h, $, clear, formatDate, errorBox, emptyState, AVAILABILITY } from '../ui.js';
import { coverEl } from '../render.js';

const user = await initShell({ requireUser: true });
const root = $('#content');

async function load() {
  clear(root).append(h('p', { class: 'loading', text: 'Loading your desk…' }));
  let d;
  try { d = await get('/api/dashboard'); } catch (err) { clear(root).append(errorBox(err.message, load)); return; }
  const { counts, recentLetters, recentMixtapes } = d;
  clear(root).append(
    h('p', { class: 'hero__lede', text: `Welcome back, ${user.display_name}.` }),
    h('div', { class: 'stats section' },
      stat(counts.letters, 'letters', counts.drafts ? `${counts.drafts} still in draft` : ''),
      stat(counts.mixtapes, 'mixtapes'),
      stat(counts.responses, 'responses received')),
    h('section', { class: 'section', 'aria-labelledby': 'rl' },
      h('div', { class: 'cluster cluster--between' }, h('h2', { id: 'rl', text: 'Recent letters' }), h('a', { href: '/letters/', text: 'All letters' })),
      recentLetters.length
        ? h('ul', { class: 'rows' }, recentLetters.map((l) => h('li', { class: 'row' },
          h('div', {}, h('h3', { class: 'row__title' }, h('a', { href: `/letters/view?id=${l.id}`, text: l.title })),
            h('div', { class: 'row__meta' }, h('span', { text: `${l.song_title || 'No song yet'}${l.artist ? ` by ${l.artist}` : ''}` }), l.recipient_name ? h('span', { text: `For ${l.recipient_name}` }) : null, h('span', { text: `Updated ${formatDate(l.updated_at)}` }))),
          h('span', { class: `badge badge--${l.availability}`, text: AVAILABILITY[l.availability] }))))
        : emptyState('No letters yet', 'Pick a song you keep coming back to and write the first one.', h('a', { class: 'btn btn--accent', href: '/letters/edit', text: 'Write a letter' }))),
    h('section', { class: 'section', 'aria-labelledby': 'rm' },
      h('div', { class: 'cluster cluster--between' }, h('h2', { id: 'rm', text: 'Recent mixtapes' }), h('a', { href: '/mixtapes/', text: 'All mixtapes' })),
      recentMixtapes.length
        ? h('ul', { class: 'rows' }, recentMixtapes.map((m) => h('li', { class: 'row' },
          h('div', { class: 'cluster' }, coverEl(m, true), h('div', {}, h('h3', { class: 'row__title' }, h('a', { href: `/mixtapes/edit?id=${m.id}`, text: m.title })),
            h('div', { class: 'row__meta' }, h('span', { text: `${m.track_count} ${m.track_count === 1 ? 'track' : 'tracks'}` }), h('span', { text: `Updated ${formatDate(m.updated_at)}` })))),
          h('span', { class: `badge badge--${m.status === 'published' ? 'live' : 'draft'}`, text: m.status === 'published' ? 'Shared' : 'Not shared' }))))
        : emptyState('No mixtapes yet', 'Collect songs into a tape and send the whole thing.', h('a', { class: 'btn', href: '/mixtapes/', text: 'Make a mixtape' }))));
}
const stat = (n, label, extra) => h('div', { class: 'stat' }, h('div', { class: 'stat__n', text: String(n) }), h('div', { class: 'stat__label', text: label }), extra ? h('div', { class: 'stat__label', text: extra }) : null);
load();
