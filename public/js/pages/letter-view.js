import { initShell } from '../shell.js';
import { get, post, put, del } from '../api.js';
import { h, $, clear, formatDate, errorBox, confirmDialog, toast, copyText, qs, AVAILABILITY, timeZoneName } from '../ui.js';
import { renderLetter } from '../render.js';

const user = await initShell({ requireUser: true });
const id = qs('id');
const root = $('#content');
let letter;
let freshUrl = null;

const flash = sessionStorage.getItem('dis.flash');
if (flash) { toast(flash); sessionStorage.removeItem('dis.flash'); }
// The raw link exists only in this response; show it once, then forget it.
freshUrl = sessionStorage.getItem(`dis.share.${id}`);
sessionStorage.removeItem(`dis.share.${id}`);

async function load() {
  try {
    const [{ letter: l }, { responses }] = await Promise.all([get(`/api/letters/${id}`), get(`/api/letters/${id}/responses`)]);
    letter = l;
    draw(responses);
  } catch (err) {
    clear(root).append(err.status === 404
      ? h('div', { class: 'empty' }, h('h1', { text: 'Letter not found' }), h('p', { class: 'muted', text: 'It may have been deleted, or it belongs to another account.' }), h('a', { class: 'btn', href: '/letters/', text: 'Back to letters' }))
      : errorBox(err.message, load));
  }
}

async function run(fn, okMsg) { try { const data = await fn(); if (okMsg) toast(okMsg); return data; } catch (err) { toast(err.message, 'error'); return null; } }

function sharePanel() {
  const box = h('section', { class: 'notice stack', 'aria-labelledby': 'share-h' }, h('h2', { id: 'share-h', text: 'Sharing' }));
  const l = letter;
  if (l.status === 'draft') box.append(h('p', { text: 'This letter is a draft. Nothing is shared until you publish it.' }),
    h('button', { type: 'button', class: 'btn btn--accent', text: 'Publish letter', onclick: publish }));
  else if (l.status === 'archived') box.append(h('p', { text: 'Archived letters have no share link. Restore it to work on it again.' }));
  else {
    box.append(h('p', {}, h('span', { class: `badge badge--${l.availability}`, text: AVAILABILITY[l.availability] }), ' ',
      l.availability === 'live' ? 'Anyone with the link can read this letter.' : l.availability === 'scheduled' ? `The link opens ${formatDate(l.scheduled_at)}.` : l.availability === 'expired' ? 'The link has expired. Create a new link and change the expiry to reopen it.' : 'Only you can see this letter.'));
    if (freshUrl) {
      const input = h('input', { type: 'text', readonly: true, value: freshUrl, 'aria-label': 'Share link', onfocus: (e) => e.target.select() });
      box.append(h('div', { class: 'link-box' }, input, h('button', { type: 'button', class: 'btn btn--primary', text: 'Copy link', onclick: async () => { input.select(); toast((await copyText(freshUrl)) ? 'Link copied.' : 'Press Ctrl+C to copy the selected link.'); } })),
        h('p', { class: 'hint', text: 'Copy it now: for your safety this link is shown only once. Anyone who has it can read the letter, and it cannot prove who they are.' }));
    } else if (l.has_share_link) box.append(h('p', { class: 'hint', text: 'A link is active. We only keep a fingerprint of it, so it cannot be shown again. Create a new link to copy one; the old link stops working.' }));
    box.append(h('div', { class: 'cluster' },
      h('button', { type: 'button', class: 'btn', text: l.has_share_link ? 'Create a new link' : 'Create share link', onclick: newLink }),
      l.has_share_link ? h('button', { type: 'button', class: 'btn btn--danger', text: 'Revoke link', onclick: revoke }) : null));
  }
  return box;
}

async function publish() {
  const data = await run(() => put(`/api/letters/${id}`, { ...letter, action: 'publish', scheduled_at: letter.scheduled_at, expires_at: letter.expires_at }), 'Letter published.');
  if (data) { freshUrl = data.shareUrl; await load(); }
}
async function newLink() {
  if (letter.has_share_link && !(await confirmDialog({ title: 'Create a new link?', body: 'The current link stops working immediately.', confirmLabel: 'Create new link' }))) return;
  const data = await run(() => post(`/api/letters/${id}/share-link`), 'New link created.');
  if (data) { freshUrl = data.shareUrl; await load(); }
}
async function revoke() {
  if (!(await confirmDialog({ title: 'Revoke the link?', body: 'People who already have it will no longer be able to open the letter.', confirmLabel: 'Revoke link', danger: true }))) return;
  freshUrl = null;
  if (await run(() => del(`/api/letters/${id}/share-link`), 'Link revoked.')) await load();
}

function draw(responses) {
  const l = letter;
  document.title = `${l.title} — Dear, in Stereo`;
  const sender = l.show_sender ? l.sender_display_name || user.display_name : null;
  clear(root).append(
    h('div', { class: 'page__head' },
      h('div', {}, h('h1', { text: l.title }), h('p', {}, h('span', { class: `badge badge--${l.availability}`, text: AVAILABILITY[l.availability] }), ` For ${l.recipient_name || 'someone'}`)),
      h('div', { class: 'cluster' },
        l.status === 'archived' ? h('button', { type: 'button', class: 'btn', text: 'Restore', onclick: async () => { if (await run(() => post(`/api/letters/${id}/restore`), 'Restored as a draft.')) load(); } })
          : h('a', { class: 'btn', href: `/letters/edit?id=${l.id}`, text: 'Edit' }),
        h('button', { type: 'button', class: 'btn', text: 'Duplicate', onclick: async () => { const d = await run(() => post(`/api/letters/${id}/duplicate`)); if (d) location.href = `/letters/view?id=${d.letter.id}`; } }),
        l.status === 'archived' ? null : h('button', { type: 'button', class: 'btn', text: 'Archive', onclick: async () => { if (await confirmDialog({ title: 'Archive this letter?', body: 'Its share link stops working right away. You can restore it later.', confirmLabel: 'Archive' }) && await run(() => post(`/api/letters/${id}/archive`), 'Archived.')) { freshUrl = null; load(); } } }),
        h('button', { type: 'button', class: 'btn btn--danger', text: 'Delete', onclick: async () => { if (await confirmDialog({ title: `Delete “${l.title}”?`, body: 'This removes the letter, its replies and its place in any mixtape. It cannot be undone.', confirmLabel: 'Delete letter', danger: true }) && await run(() => del(`/api/letters/${id}`))) { sessionStorage.setItem('dis.flash', 'Letter deleted.'); location.href = '/letters/'; } } }))),
    h('div', { class: 'two-col' },
      h('div', { class: 'stack' },
        sharePanel(),
        h('dl', { class: 'kv' },
          h('dt', { text: 'Created' }), h('dd', { text: formatDate(l.created_at) }), h('dt', { text: 'Last updated' }), h('dd', { text: formatDate(l.updated_at) }),
          l.published_at ? [h('dt', { text: 'Published' }), h('dd', { text: formatDate(l.published_at) })] : null,
          l.scheduled_at ? [h('dt', { text: 'Opens' }), h('dd', { text: formatDate(l.scheduled_at) })] : null,
          l.expires_at ? [h('dt', { text: 'Expires' }), h('dd', { text: formatDate(l.expires_at) })] : null,
          h('dt', { text: 'Replies' }), h('dd', { text: l.allow_responses ? 'Allowed' : 'Turned off' })),
        h('p', { class: 'hint', text: `Times are shown in ${timeZoneName()}.` })),
      h('div', {}, h('h2', { class: 'small muted', text: 'How the recipient sees it' }), renderLetter({ ...l, sender_name: sender }))),
    h('section', { class: 'section', 'aria-labelledby': 'resp-h' }, h('h2', { id: 'resp-h', text: 'Responses' }),
      responses.length ? responses.map((r) => h('div', { class: 'response-card' }, h('p', { text: r.message }), h('p', { class: 'small muted', text: `${r.display_name || 'Anonymous'} · ${formatDate(r.created_at)}` })))
        : h('p', { class: 'muted', text: l.allow_responses ? 'No replies yet.' : 'Replies are turned off for this letter. You can change that in Edit.' })));
}
load();
