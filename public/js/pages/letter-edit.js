import { initShell } from '../shell.js';
import { get, post, put } from '../api.js';
import { h, $, showErrors, clearErrors, withBusy, toast, debounce, qs, timeZoneName, localInputToIso, isoToLocalInput, REASONS } from '../ui.js';
import { parseMusicUrl } from '../music.js';
import { renderLetter } from '../render.js';

const user = await initShell({ requireUser: true });
const form = $('#letter-form');
const id = qs('id');
let existing = null;

for (const [value, label] of Object.entries(REASONS)) form.reason_category.append(h('option', { value, text: label }));
$('#tz').textContent = timeZoneName();

const val = (name) => (form.elements[name].type === 'checkbox' ? form.elements[name].checked : form.elements[name].value);
const checkedTheme = () => form.elements.theme.value;

function formData(action) {
  const d = {};
  for (const name of ['title', 'song_title', 'artist', 'song_url', 'artwork_url', 'recipient_name', 'message', 'reason_category', 'custom_reason', 'sender_display_name', 'visibility']) d[name] = val(name);
  d.theme = checkedTheme();
  d.show_sender = val('show_sender');
  d.allow_responses = val('allow_responses');
  d.scheduled_at = localInputToIso(val('scheduled_at'));
  d.expires_at = localInputToIso(val('expires_at'));
  if (action) d.action = action;
  return d;
}

function renderPreview() {
  const d = formData();
  const sender = d.show_sender ? d.sender_display_name || user.display_name : null;
  const parsed = parseMusicUrl(d.song_url);
  $('#preview').replaceChildren(renderLetter({ ...d, sender_name: sender, song_url: parsed ? parsed.url : '', embed: parsed }, { preview: true, withPlayer: !!parsed }));
  $('#msg-count').textContent = `${d.message.length} / 5000`;
  $('#custom-wrap').hidden = d.reason_category !== 'custom';
}
const livePreview = debounce(renderPreview, 120);
form.addEventListener('input', livePreview);
form.addEventListener('change', renderPreview);

// ---- song link feedback (instant, local) and optional official lookup
const verdict = $('#url-verdict');
function checkUrl() {
  const value = form.song_url.value.trim();
  verdict.className = 'verdict';
  if (!value) { verdict.textContent = ''; return null; }
  const p = parseMusicUrl(value);
  if (!p) { verdict.textContent = 'Only https links from Spotify or YouTube work here.'; verdict.classList.add('verdict--bad'); return null; }
  verdict.textContent = `${p.provider === 'spotify' ? 'Spotify' : 'YouTube'} link recognised. It will be saved as ${p.url}`;
  verdict.classList.add('verdict--ok');
  return p;
}
form.song_url.addEventListener('input', debounce(checkUrl, 200));
form.song_url.addEventListener('blur', () => { const p = parseMusicUrl(form.song_url.value); if (p) form.song_url.value = p.url; checkUrl(); renderPreview(); });

$('#lookup').addEventListener('click', async (e) => {
  const p = checkUrl();
  if (!p) { form.song_url.focus(); return; }
  await withBusy(e.currentTarget, async () => {
    try {
      const data = await post('/api/music/parse', { url: p.url, lookup: true });
      const m = data.metadata;
      if (!m || (!m.title && !m.artist)) { verdict.textContent = 'Could not fetch details right now. Please type the song title and artist yourself.'; verdict.className = 'verdict verdict--bad'; return; }
      if (m.title && !form.song_title.value) form.song_title.value = m.title;
      if (m.artist && !form.artist.value) form.artist.value = m.artist;
      if (m.artworkUrl && !form.artwork_url.value) form.artwork_url.value = m.artworkUrl;
      verdict.textContent = 'Details filled in from the provider. Check them and fix anything that looks off.';
      verdict.className = 'verdict verdict--ok';
      renderPreview();
    } catch (err) { toast(err.message, 'error'); }
  });
});

// ---- load existing letter
function fill(l) {
  for (const name of ['title', 'song_title', 'artist', 'song_url', 'artwork_url', 'recipient_name', 'message', 'reason_category', 'custom_reason', 'sender_display_name', 'visibility']) form.elements[name].value = l[name] || (name === 'reason_category' ? 'just_because' : name === 'visibility' ? 'private' : '');
  form.elements.theme.value = l.theme;
  form.show_sender.checked = !!l.show_sender;
  form.allow_responses.checked = !!l.allow_responses;
  form.scheduled_at.value = isoToLocalInput(l.scheduled_at);
  form.expires_at.value = isoToLocalInput(l.expires_at);
}

if (id) {
  try {
    existing = (await get(`/api/letters/${id}`)).letter;
  } catch (err) {
    $('#status').append(h('div', { class: 'notice notice--warn', role: 'alert' }, h('p', { text: err.status === 404 ? 'That letter could not be found.' : err.message }), h('a', { class: 'btn btn--small', href: '/letters/', text: 'Back to letters' })));
    form.hidden = true;
  }
  if (existing) {
    if (existing.status === 'archived') {
      $('#status').append(h('div', { class: 'notice notice--warn' }, h('p', { text: 'This letter is archived. Restore it before editing.' }), h('a', { class: 'btn btn--small', href: `/letters/view?id=${existing.id}`, text: 'Go to the letter' })));
      form.hidden = true;
    } else {
      document.title = 'Edit letter — Dear, in Stereo';
      $('h1').textContent = 'Edit your letter';
      fill(existing);
      if (existing.status === 'published') {
        $('#btn-draft').remove();
        $('#btn-publish').textContent = 'Save changes';
        $('#btn-publish').dataset.action = '';
        $('#status').append(h('div', { class: 'notice' }, h('p', { class: 'small', text: 'This letter is published. Changes appear on the same link as soon as you save. The title, song, recipient and message must stay filled in.' })));
      }
    }
  }
} else {
  form.reason_category.value = 'just_because';
  form.visibility.value = 'link';
  form.allow_responses.checked = true;
}
checkUrl();
renderPreview();

// ---- save
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const button = e.submitter || $('#btn-publish');
  const action = button.dataset.action || undefined;
  clearErrors(form);
  try {
    await withBusy(button, async () => {
      const body = formData(action);
      const data = id ? await put(`/api/letters/${id}`, body) : await post('/api/letters', body);
      const letter = data.letter;
      if (data.shareUrl) sessionStorage.setItem(`dis.share.${letter.id}`, data.shareUrl); // one-time reveal on the next page
      sessionStorage.setItem('dis.flash', action === 'publish' ? 'Letter published.' : id ? 'Changes saved.' : 'Draft saved.');
      location.href = `/letters/view?id=${letter.id}`;
    });
  } catch (err) {
    showErrors(form, err);
    toast(err.fields && Object.keys(err.fields).length ? 'Some fields need attention.' : err.message, 'error');
  }
});
