import { initShell } from '../shell.js';
import { get } from '../api.js';
import { h, $, clear, formatDate, errorBox, emptyState } from '../ui.js';

await initShell({ requireUser: true });
let page = Number(new URLSearchParams(location.search).get('page')) || 1;
const list = $('#list');
const pager = $('#pager');

async function load() {
  clear(list).append(h('p', { class: 'loading', text: 'Loading responses…' }));
  let data;
  try { data = await get(`/api/responses?page=${page}`); } catch (err) { clear(list).append(errorBox(err.message, load)); return; }
  if (page > data.pages) { page = data.pages; return load(); }
  history.replaceState(null, '', `?page=${page}`);
  clear(list);
  if (!data.items.length) list.append(emptyState('No responses yet', 'When a recipient writes back on a letter that allows replies, it will show up here.', h('a', { class: 'btn', href: '/letters/', text: 'Go to your letters' })));
  else list.append(h('ul', { class: 'rows' }, data.items.map((r) => h('li', { class: 'row' },
    h('div', {}, h('div', { class: 'response-card' }, h('p', { text: r.message }), h('p', { class: 'small muted', text: `${r.display_name || 'Anonymous'} · ${formatDate(r.created_at)}` })),
      h('div', { class: 'row__meta' }, h('span', { text: `In reply to “${r.letter_title}”${r.recipient_name ? ` (for ${r.recipient_name})` : ''}` }))),
    h('a', { class: 'btn btn--small', href: `/letters/view?id=${r.letter_id}`, text: 'Open letter' })))));
  clear(pager);
  if (data.pages > 1) pager.append(
    h('button', { type: 'button', class: 'btn btn--small', text: 'Previous', disabled: page <= 1, onclick: () => { page -= 1; load(); } }),
    h('span', { class: 'small muted', text: `Page ${data.page} of ${data.pages}` }),
    h('button', { type: 'button', class: 'btn btn--small', text: 'Next', disabled: page >= data.pages, onclick: () => { page += 1; load(); } }));
}
load();
