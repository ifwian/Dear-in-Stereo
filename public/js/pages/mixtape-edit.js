import { initShell } from '../shell.js';
import { get, post, put, del } from '../api.js';
import { h, $, clear, errorBox, confirmDialog, toast, copyText, qs, showErrors, clearErrors, withBusy, formatDate } from '../ui.js';
import { renderMixtape, coverEl } from '../render.js';
import { parseMusicUrl } from '../music.js';

await initShell({ requireUser: true });
const id = qs('id');
const root = $('#content');
let tape = null;
let freshUrl = null;
let letters = [];
let dragId = null;

const THEMES = ['paper', 'ink', 'rosewood', 'kraft', 'dusk'];
const run = async (fn, okMsg) => { try { const d = await fn(); if (okMsg) toast(okMsg); return d; } catch (err) { toast(err.message, 'error'); return null; } };

async function load() {
  try {
    tape = (await get(`/api/mixtapes/${id}`)).mixtape;
  } catch (err) {
    clear(root).append(err.status === 404
      ? h('div', { class: 'empty' }, h('h1', { text: 'Mixtape not found' }), h('p', { class: 'muted', text: 'It may have been deleted, or it belongs to another account.' }), h('a', { class: 'btn', href: '/mixtapes/', text: 'Back to mixtapes' }))
      : errorBox(err.message, load));
    return;
  }
  draw();
}

const apply = (data) => { if (data) { tape = data.mixtape; if (data.shareUrl) freshUrl = data.shareUrl; draw(); } };

function detailsForm() {
  const f = h('form', { novalidate: true, class: 'stack' },
    h('div', { class: 'field' }, h('label', { for: 'title', text: 'Title' }), h('input', { id: 'title', name: 'title', type: 'text', maxlength: 120, value: tape.title, required: true })),
    h('div', { class: 'field' }, h('label', { for: 'description', text: 'Dedication' }), h('textarea', { id: 'description', name: 'description', maxlength: 500, text: tape.description || '' })),
    h('fieldset', {}, h('legend', { text: 'Cover' }), h('div', { class: 'theme-picker' }, THEMES.map((t) =>
      h('label', {}, h('input', { type: 'radio', name: 'cover_theme', value: t, checked: t === tape.cover_theme }), h('span', { class: 'swatch', 'data-theme': t }), t[0].toUpperCase() + t.slice(1))))),
    h('button', { type: 'submit', class: 'btn btn--primary', text: 'Save details' }));
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); clearErrors(f);
    try { await withBusy(e.submitter, async () => { apply(await put(`/api/mixtapes/${id}`, Object.fromEntries(new FormData(f)))); toast('Details saved.'); }); } catch (err) { showErrors(f, err); }
  });
  return f;
}

async function reorder(order) { apply(await run(() => put(`/api/mixtapes/${id}/tracks/order`, { order }))); }
function move(idx, delta) {
  const ids = tape.tracks.map((t) => t.id);
  const to = idx + delta;
  if (to < 0 || to >= ids.length) return;
  [ids[idx], ids[to]] = [ids[to], ids[idx]];
  reorder(ids).then(() => { const btn = document.querySelector(`[data-track="${ids[to]}"] [data-move="${delta}"]`); if (btn) btn.focus(); });
}

function trackList() {
  if (!tape.tracks.length) return h('p', { class: 'muted', text: 'No tracks yet. Add a song below.' });
  return h('ol', { class: 'tracks' }, tape.tracks.map((t, i) => {
    const li = h('li', { class: 'track', draggable: 'true', 'data-track': t.id },
      h('div', {}, h('div', { class: 'track__title', text: t.track_title }), h('div', { class: 'track__artist', text: t.artist }),
        t.song_letter_id ? h('div', { class: 'small muted', text: 'From one of your letters' }) : null,
        t.track_note ? h('p', { class: 'track__note', text: t.track_note }) : null),
      h('div', { class: 'track__actions' },
        h('button', { type: 'button', class: 'btn btn--small', 'data-move': '-1', 'aria-label': `Move ${t.track_title} up`, disabled: i === 0, text: 'Up', onclick: () => move(i, -1) }),
        h('button', { type: 'button', class: 'btn btn--small', 'data-move': '1', 'aria-label': `Move ${t.track_title} down`, disabled: i === tape.tracks.length - 1, text: 'Down', onclick: () => move(i, 1) }),
        h('button', { type: 'button', class: 'btn btn--small', text: 'Note', 'aria-label': `Edit note for ${t.track_title}`, onclick: (e) => noteEditor(li, t, e.currentTarget) }),
        h('button', { type: 'button', class: 'btn btn--small btn--danger', 'aria-label': `Remove ${t.track_title}`, text: 'Remove', onclick: async () => {
          if (await confirmDialog({ title: 'Remove this track?', body: `“${t.track_title}” will be taken off the mixtape. The song itself is not deleted.`, confirmLabel: 'Remove', danger: true })) apply(await run(() => del(`/api/mixtapes/${id}/tracks/${t.id}`), 'Track removed.'));
        } })));
    // Drag and drop is an enhancement; the Up/Down buttons do the same job from the keyboard.
    li.addEventListener('dragstart', (e) => { dragId = t.id; li.classList.add('is-dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(t.id)); });
    li.addEventListener('dragend', () => { dragId = null; li.classList.remove('is-dragging'); document.querySelectorAll('.is-over').forEach((x) => x.classList.remove('is-over')); });
    li.addEventListener('dragover', (e) => { if (dragId && dragId !== t.id) { e.preventDefault(); li.classList.add('is-over'); } });
    li.addEventListener('dragleave', () => li.classList.remove('is-over'));
    li.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!dragId || dragId === t.id) return;
      const ids = tape.tracks.map((x) => x.id).filter((x) => x !== dragId);
      ids.splice(ids.indexOf(t.id), 0, dragId);
      reorder(ids);
    });
    return li;
  }));
}

function noteEditor(li, t, trigger) {
  if (li.querySelector('.track__editnote')) { li.querySelector('.track__editnote input').focus(); return; }
  const input = h('input', { type: 'text', maxlength: 280, value: t.track_note || '', 'aria-label': `Note for ${t.track_title}` });
  const f = h('form', { class: 'track__editnote input-group' }, input, h('button', { type: 'submit', class: 'btn btn--small btn--primary', text: 'Save note' }), h('button', { type: 'button', class: 'btn btn--small', text: 'Cancel', onclick: () => { f.remove(); trigger.focus(); } }));
  f.addEventListener('submit', async (e) => { e.preventDefault(); apply(await run(() => put(`/api/mixtapes/${id}/tracks/${t.id}`, { track_note: input.value }), 'Note saved.')); });
  li.append(f); input.focus();
}

function addPanel() {
  const wrap = h('section', { class: 'section', 'aria-labelledby': 'add-h' }, h('h2', { id: 'add-h', text: 'Add a track' }));
  const fromLetter = h('form', { class: 'stack', novalidate: true },
    h('div', { class: 'field' }, h('label', { for: 'pick-letter', text: 'One of your letters' }),
      h('select', { id: 'pick-letter', name: 'song_letter_id' }, h('option', { value: '', text: letters.length ? 'Choose a letter…' : 'No letters with a song yet' }),
        letters.map((l) => h('option', { value: l.id, text: `${l.song_title} by ${l.artist} (${l.title})` })))),
    h('div', { class: 'field' }, h('label', { for: 'pick-note', text: 'Note (optional)' }), h('input', { id: 'pick-note', name: 'track_note', type: 'text', maxlength: 280 })),
    h('button', { type: 'submit', class: 'btn', text: 'Add letter’s song' }));
  fromLetter.addEventListener('submit', async (e) => {
    e.preventDefault(); clearErrors(fromLetter);
    const body = Object.fromEntries(new FormData(fromLetter));
    if (!body.song_letter_id) { showErrors(fromLetter, { fields: { song_letter_id: 'Choose a letter first.' }, message: '' }); return; }
    try { await withBusy(e.submitter, async () => { apply(await post(`/api/mixtapes/${id}/tracks`, body)); toast('Track added.'); }); } catch (err) { showErrors(fromLetter, err); }
  });
  const standalone = h('form', { class: 'stack', novalidate: true },
    h('div', { class: 'field' }, h('label', { for: 'tr-url', text: 'Spotify or YouTube link' }), h('input', { id: 'tr-url', name: 'song_url', type: 'url', inputmode: 'url' })),
    h('div', { class: 'grid-2' },
      h('div', { class: 'field' }, h('label', { for: 'tr-title', text: 'Song title' }), h('input', { id: 'tr-title', name: 'track_title', type: 'text', maxlength: 200 })),
      h('div', { class: 'field' }, h('label', { for: 'tr-artist', text: 'Artist' }), h('input', { id: 'tr-artist', name: 'artist', type: 'text', maxlength: 200 }))),
    h('div', { class: 'field' }, h('label', { for: 'tr-note', text: 'Note (optional)' }), h('input', { id: 'tr-note', name: 'track_note', type: 'text', maxlength: 280 })),
    h('button', { type: 'submit', class: 'btn', text: 'Add song' }));
  standalone.song_url.addEventListener('blur', () => { const p = parseMusicUrl(standalone.song_url.value); if (p) standalone.song_url.value = p.url; });
  standalone.addEventListener('submit', async (e) => {
    e.preventDefault(); clearErrors(standalone);
    try { await withBusy(e.submitter, async () => { apply(await post(`/api/mixtapes/${id}/tracks`, Object.fromEntries(new FormData(standalone)))); toast('Track added.'); }); } catch (err) { showErrors(standalone, err); }
  });
  const tabs = [['From my letters', fromLetter], ['A new song', standalone]];
  const panels = tabs.map(([, el], i) => { el.hidden = i !== 0; return el; });
  const bar = h('div', { class: 'cluster', role: 'tablist', 'aria-label': 'Where the song comes from' }, tabs.map(([label], i) => h('button', {
    type: 'button', role: 'tab', class: 'btn btn--small', 'aria-selected': String(i === 0), text: label,
    onclick: (e) => { panels.forEach((p, j) => { p.hidden = j !== i; }); [...bar.children].forEach((b, j) => b.setAttribute('aria-selected', String(j === i))); e.currentTarget.blur(); e.currentTarget.focus(); },
  })));
  wrap.append(bar, h('div', { class: 'section' }, ...panels));
  return wrap;
}

function sharePanel() {
  const box = h('section', { class: 'notice stack', 'aria-labelledby': 'sh-h' }, h('h2', { id: 'sh-h', text: 'Sharing' }));
  if (tape.status !== 'published') box.append(h('p', { text: 'This mixtape is private. Publishing creates a link anyone can open to see the cover, notes and tracks.' }),
    h('button', { type: 'button', class: 'btn btn--accent', text: 'Publish and get link', disabled: !tape.tracks.length, onclick: async () => apply(await run(() => post(`/api/mixtapes/${id}/publish`), 'Mixtape published.')) }),
    tape.tracks.length ? null : h('p', { class: 'hint', text: 'Add at least one track first.' }));
  else {
    box.append(h('p', {}, h('span', { class: 'badge badge--live', text: 'Link live' }), ' Anyone with the link can open this mixtape. Letter messages are never shown, only song details.'));
    if (freshUrl) {
      const input = h('input', { type: 'text', readonly: true, value: freshUrl, 'aria-label': 'Share link', onfocus: (e) => e.target.select() });
      box.append(h('div', { class: 'link-box' }, input, h('button', { type: 'button', class: 'btn btn--primary', text: 'Copy link', onclick: async () => { input.select(); toast((await copyText(freshUrl)) ? 'Link copied.' : 'Press Ctrl+C to copy the selected link.'); } })),
        h('p', { class: 'hint', text: 'Shown only once. Create a new link if you need it again; the old one stops working.' }));
    }
    box.append(h('div', { class: 'cluster' },
      h('button', { type: 'button', class: 'btn', text: 'Create a new link', onclick: async () => { if (await confirmDialog({ title: 'Create a new link?', body: 'The current link stops working immediately.', confirmLabel: 'Create new link' })) apply(await run(() => post(`/api/mixtapes/${id}/share-link`), 'New link created.')); } }),
      h('button', { type: 'button', class: 'btn btn--danger', text: 'Revoke link', onclick: async () => { if (await confirmDialog({ title: 'Revoke the link?', body: 'People who have it will no longer be able to open this mixtape.', confirmLabel: 'Revoke link', danger: true })) { freshUrl = null; apply(await run(() => del(`/api/mixtapes/${id}/share-link`), 'Link revoked.')); } } })));
  }
  box.append(h('p', { class: 'small muted', text: `Last updated ${formatDate(tape.updated_at)}.` }));
  return box;
}

function draw() {
  document.title = `${tape.title} — Dear, in Stereo`;
  clear(root).append(
    h('div', { class: 'page__head' }, h('div', {}, h('h1', { text: tape.title }), h('p', { text: `${tape.tracks.length} ${tape.tracks.length === 1 ? 'track' : 'tracks'}` })),
      h('div', { class: 'cluster' }, h('a', { class: 'btn', href: '/mixtapes/', text: 'All mixtapes' }),
        h('button', { type: 'button', class: 'btn btn--danger', text: 'Delete mixtape', onclick: async () => {
          if (await confirmDialog({ title: `Delete “${tape.title}”?`, body: 'The mixtape and its share link are removed. Your letters are not affected.', confirmLabel: 'Delete mixtape', danger: true }) && await run(() => del(`/api/mixtapes/${id}`))) { location.href = '/mixtapes/'; }
        } }))),
    h('div', { class: 'two-col two-col--editor' },
      h('div', {}, h('section', { 'aria-labelledby': 'det-h' }, h('h2', { id: 'det-h', text: 'Details' }), detailsForm()),
        h('section', { class: 'section', 'aria-labelledby': 'trk-h' }, h('h2', { id: 'trk-h', text: 'Tracks' }), h('p', { class: 'hint', text: 'Drag a track, or use Up and Down, to change the order.' }), trackList()),
        addPanel()),
      h('aside', { class: 'stack', 'aria-labelledby': 'pv-h' }, sharePanel(), h('h2', { id: 'pv-h', class: 'small muted', text: 'How the recipient sees it' }),
        renderMixtape({ ...tape, tracks: tape.tracks.map((t) => ({ ...t, title: t.track_title, note: t.track_note })) }))));
}

try { letters = (await get('/api/letters?status=active&limit=50&sort=title')).items.filter((l) => l.song_title); } catch { letters = []; }
load();
