import { initShell } from '../shell.js';
import { get, post, del } from '../api.js';
import { h, $, clear, formatDate, errorBox, emptyState, confirmDialog, toast, debounce, showErrors, clearErrors, withBusy } from '../ui.js';
import { coverEl } from '../render.js';

await initShell({ requireUser: true });
const form = $('#filters');
const list = $('#list');
const pager = $('#pager');
let page = 1;

function themeRadios() {
  return h('div', { class: 'theme-picker' }, ['paper', 'ink', 'rosewood', 'kraft', 'dusk'].map((t) =>
    h('label', {}, h('input', { type: 'radio', name: 'cover_theme', value: t, checked: t === 'kraft' }), h('span', { class: 'swatch', 'data-theme': t }), t[0].toUpperCase() + t.slice(1))));
}

$('#new-tape').addEventListener('click', () => {
  const f = h('form', { novalidate: true },
    h('h2', { text: 'New mixtape' }),
    h('div', { class: 'field' }, h('label', { for: 'nt-title', text: 'Title' }), h('input', { id: 'nt-title', name: 'title', type: 'text', maxlength: 120, required: true })),
    h('div', { class: 'field' }, h('label', { for: 'nt-desc', text: 'Dedication (optional)' }), h('textarea', { id: 'nt-desc', name: 'description', maxlength: 500 })),
    h('fieldset', {}, h('legend', { text: 'Cover' }), themeRadios()),
    h('div', { class: 'cluster cluster--end' }, h('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: () => dlg.close() }), h('button', { type: 'submit', class: 'btn btn--primary', text: 'Create mixtape' })));
  const dlg = h('dialog', {}, f);
  dlg.addEventListener('close', () => dlg.remove());
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); clearErrors(f);
    try {
      await withBusy(e.submitter, async () => {
        const d = await post('/api/mixtapes', Object.fromEntries(new FormData(f)));
        location.href = `/mixtapes/edit?id=${d.mixtape.id}`;
      });
    } catch (err) { showErrors(f, err); }
  });
  document.body.append(dlg); dlg.showModal(); $('#nt-title', dlg).focus();
});

const params = new URLSearchParams(location.search);
for (const el of form.elements) if (el.name && params.has(el.name)) el.value = params.get(el.name);
page = Number(params.get('page')) || 1;

async function load() {
  const q = new URLSearchParams();
  for (const el of form.elements) if (el.name && el.value) q.set(el.name, el.value);
  q.set('page', page);
  history.replaceState(null, '', `?${q}`);
  clear(list).append(h('p', { class: 'loading', text: 'Loading mixtapes…' }));
  let data;
  try { data = await get(`/api/mixtapes?${q}`); } catch (err) { clear(list).append(errorBox(err.message, load)); return; }
  if (page > data.pages) { page = data.pages; return load(); }
  $('#result-count').textContent = data.total ? `${data.total} ${data.total === 1 ? 'mixtape' : 'mixtapes'}` : '';
  clear(list);
  if (!data.items.length) {
    list.append(q.get('q') || q.get('status')
      ? emptyState('No mixtapes match', 'Try a different search or clear the filters.', h('button', { type: 'button', class: 'btn', text: 'Clear filters', onclick: () => { form.reset(); page = 1; load(); } }))
      : emptyState('No mixtapes yet', 'Start a tape, add a few songs and put them in the order you want them heard.', h('button', { type: 'button', class: 'btn btn--accent', text: 'New mixtape', onclick: () => $('#new-tape').click() })));
  } else {
    list.append(h('ul', { class: 'rows' }, data.items.map((m) => h('li', { class: 'row' },
      h('div', { class: 'cluster' }, coverEl(m, true), h('div', {},
        h('h2', { class: 'row__title' }, h('a', { href: `/mixtapes/edit?id=${m.id}`, text: m.title })),
        h('div', { class: 'row__meta' }, h('span', { class: `badge badge--${m.status === 'published' ? 'live' : 'draft'}`, text: m.status === 'published' ? 'Shared' : 'Not shared' }),
          h('span', { text: `${m.track_count} ${m.track_count === 1 ? 'track' : 'tracks'}` }), h('span', { text: `Updated ${formatDate(m.updated_at)}` })))),
      h('div', { class: 'row__actions' },
        h('a', { class: 'btn btn--small', href: `/mixtapes/edit?id=${m.id}`, text: 'Open' }),
        h('button', { type: 'button', class: 'btn btn--small btn--danger', text: 'Delete', onclick: async () => {
          if (!(await confirmDialog({ title: `Delete “${m.title}”?`, body: 'The mixtape and its share link are removed. Your letters are not affected.', confirmLabel: 'Delete mixtape', danger: true }))) return;
          try { await del(`/api/mixtapes/${m.id}`); toast('Mixtape deleted.'); load(); } catch (err) { toast(err.message, 'error'); }
        } }))))));
  }
  clear(pager);
  if (data.pages > 1) pager.append(
    h('button', { type: 'button', class: 'btn btn--small', text: 'Previous', disabled: page <= 1, onclick: () => { page -= 1; load(); } }),
    h('span', { class: 'small muted', text: `Page ${data.page} of ${data.pages}` }),
    h('button', { type: 'button', class: 'btn btn--small', text: 'Next', disabled: page >= data.pages, onclick: () => { page += 1; load(); } }));
}
const reload = () => { page = 1; load(); };
form.addEventListener('submit', (e) => { e.preventDefault(); reload(); });
$('#q').addEventListener('input', debounce(reload, 300));
for (const el of form.querySelectorAll('select')) el.addEventListener('change', reload);
load();
