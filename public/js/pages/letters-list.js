import { initShell } from '../shell.js';
import { get, post, del } from '../api.js';
import { h, $, clear, formatDate, errorBox, emptyState, confirmDialog, toast, debounce, REASONS, AVAILABILITY } from '../ui.js';

await initShell({ requireUser: true });
const form = $('#filters');
const list = $('#list');
const pager = $('#pager');
let page = 1;

for (const [value, label] of Object.entries(REASONS)) $('#reason').append(h('option', { value, text: label }));
// Restore filters from the address bar so a refresh or shared URL keeps the same view.
const params = new URLSearchParams(location.search);
for (const el of form.elements) if (el.name && params.has(el.name)) el.value = params.get(el.name);
page = Number(params.get('page')) || 1;

function query() {
  const q = new URLSearchParams();
  for (const el of form.elements) if (el.name && el.value) q.set(el.name, el.value);
  q.set('page', page);
  return q;
}

async function load() {
  const q = query();
  history.replaceState(null, '', `?${q}`);
  clear(list).append(h('p', { class: 'loading', text: 'Loading letters…' }));
  let data;
  try { data = await get(`/api/letters?${q}`); } catch (err) { clear(list).append(errorBox(err.message, load)); return; }
  if (page > data.pages) { page = data.pages; return load(); }
  $('#result-count').textContent = data.total ? `${data.total} ${data.total === 1 ? 'letter' : 'letters'}` : '';
  clear(list);
  if (!data.items.length) {
    const filtered = [...q.keys()].some((k) => !['page', 'sort'].includes(k) && !(k === 'status' && q.get(k) === 'active'));
    list.append(filtered
      ? emptyState('No letters match', 'Try a different search or clear the filters.', h('button', { type: 'button', class: 'btn', text: 'Clear filters', onclick: () => { form.reset(); page = 1; load(); } }))
      : emptyState('Nothing here yet', 'Your letters will be kept here, with drafts and archived ones set apart.', h('a', { class: 'btn btn--accent', href: '/letters/edit', text: 'Write your first letter' })));
  } else {
    list.append(h('ul', { class: 'rows' }, data.items.map(row)));
  }
  clear(pager);
  if (data.pages > 1) {
    pager.append(
      h('button', { type: 'button', class: 'btn btn--small', text: 'Previous', disabled: page <= 1, onclick: () => { page -= 1; load(); } }),
      h('span', { class: 'small muted', text: `Page ${data.page} of ${data.pages}` }),
      h('button', { type: 'button', class: 'btn btn--small', text: 'Next', disabled: page >= data.pages, onclick: () => { page += 1; load(); } }));
  }
}

function row(l) {
  const act = (label, fn, cls = '') => h('button', { type: 'button', class: `btn btn--small ${cls}`, text: label, onclick: fn });
  const run = async (fn, okMsg) => { try { await fn(); toast(okMsg); load(); } catch (err) { toast(err.message, 'error'); } };
  const archived = l.status === 'archived';
  return h('li', { class: 'row' },
    h('div', {},
      h('h2', { class: 'row__title' }, h('a', { href: `/letters/view?id=${l.id}`, text: l.title })),
      h('div', { class: 'row__meta' },
        h('span', { class: `badge badge--${l.availability}`, text: AVAILABILITY[l.availability] }),
        h('span', { text: l.song_title ? `${l.song_title}${l.artist ? ` by ${l.artist}` : ''}` : 'No song yet' }),
        l.recipient_name ? h('span', { text: `For ${l.recipient_name}` }) : null,
        l.response_count ? h('span', { text: `${l.response_count} ${l.response_count === 1 ? 'response' : 'responses'}` }) : null,
        l.scheduled_at ? h('span', { text: `Opens ${formatDate(l.scheduled_at)}` }) : null,
        h('span', { text: `Updated ${formatDate(l.updated_at)}` }))),
    h('div', { class: 'row__actions' },
      h('a', { class: 'btn btn--small', href: `/letters/view?id=${l.id}`, text: 'View' }),
      archived ? null : h('a', { class: 'btn btn--small', href: `/letters/edit?id=${l.id}`, text: 'Edit' }),
      act('Duplicate', () => run(() => post(`/api/letters/${l.id}/duplicate`), 'Duplicated as a draft')),
      archived ? act('Restore', () => run(() => post(`/api/letters/${l.id}/restore`), 'Restored as a draft'))
        : act('Archive', async () => { if (await confirmDialog({ title: 'Archive this letter?', body: 'Its share link stops working right away. You can restore it later as a private draft.', confirmLabel: 'Archive' })) run(() => post(`/api/letters/${l.id}/archive`), 'Archived'); }),
      act('Delete', async () => { if (await confirmDialog({ title: `Delete “${l.title}”?`, body: 'This removes the letter, its replies, and its place in any mixtape. It cannot be undone.', confirmLabel: 'Delete letter', danger: true })) run(() => del(`/api/letters/${l.id}`), 'Letter deleted'); }, 'btn--danger')));
}

const reload = () => { page = 1; load(); };
form.addEventListener('submit', (e) => { e.preventDefault(); reload(); });
$('#q').addEventListener('input', debounce(reload, 300));
for (const el of form.querySelectorAll('select')) el.addEventListener('change', reload);
load();
