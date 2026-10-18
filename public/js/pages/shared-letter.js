import { initShell } from '../shell.js';
import { get, post } from '../api.js';
import { h, $, clear, formatDate, showErrors, clearErrors, withBusy, timeZoneName } from '../ui.js';
import { renderLetter } from '../render.js';

initShell();
const stage = $('#stage');
const token = location.pathname.split('/')[2] || '';

function notice(title, text, extra) {
  document.title = `${title} — Dear, in Stereo`;
  clear(stage).append(h('div', { class: 'message-page' }, h('div', { class: 'disc', 'aria-hidden': 'true' }), h('h1', { text: title }), h('p', { class: 'muted', text }), extra || null));
}

async function load() {
  let letter;
  try {
    ({ letter } = await get(`/api/public/letters/${encodeURIComponent(token)}`, { redirectOn401: false }));
  } catch (err) {
    if (err.code === 'NOT_YET_AVAILABLE') notice('This letter is not open yet', err.details.availableAt ? `It opens ${formatDate(err.details.availableAt)} (${timeZoneName()}). Come back then.` : 'Come back a little later.');
    else if (err.code === 'EXPIRED') notice('This link has expired', 'The sender set it to close after a certain time. You can ask them to send a new one.');
    else if (err.status === 404) notice('This link is not available', 'It may be mistyped, or the sender may have closed it.');
    else notice('Could not load the letter', err.message, h('button', { type: 'button', class: 'btn', text: 'Try again', onclick: load }));
    return;
  }
  document.title = `${letter.title} — a song letter`;
  const open = h('button', { type: 'button', class: 'btn btn--primary', text: 'Open the letter' });
  const envelope = h('div', { class: 'reveal__envelope message-page' },
    h('div', { class: 'disc', 'aria-hidden': 'true' }), h('p', { text: `For ${letter.recipient_name}` }),
    h('p', { class: 'small muted', text: letter.sender_name ? `From ${letter.sender_name}` : 'From someone who is thinking of you' }), open);
  clear(stage).append(envelope);
  open.focus();
  open.addEventListener('click', () => {
    const el = renderLetter(letter);
    el.classList.add('reveal__letter');
    el.setAttribute('tabindex', '-1');
    clear(stage).append(el);
    if (letter.allow_responses) stage.append(responseForm());
    stage.append(h('p', { class: 'recipient__banner muted small' }, 'Made with ', h('a', { href: '/', text: 'Dear, in Stereo' }), '. ', h('a', { href: '/register', text: 'Write one of your own' }), '.'));
    el.focus({ preventScroll: true });
  });
}

function responseForm() {
  const f = h('form', { class: 'response-form', novalidate: true, 'aria-labelledby': 'rf-h' },
    h('h2', { id: 'rf-h', text: 'Write back' }),
    h('p', { class: 'hint', text: 'Only the sender will see your reply.' }),
    h('div', { class: 'field' }, h('label', { for: 'rf-name', text: 'Your name (optional)' }), h('input', { id: 'rf-name', name: 'display_name', type: 'text', maxlength: 60, autocomplete: 'given-name' })),
    h('div', { class: 'field' }, h('label', { for: 'rf-msg', text: 'Your reply' }), h('textarea', { id: 'rf-msg', name: 'message', maxlength: 1000 })),
    h('button', { type: 'submit', class: 'btn btn--primary', text: 'Send reply' }));
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); clearErrors(f);
    try {
      await withBusy(e.submitter, async () => {
        await post(`/api/public/letters/${encodeURIComponent(token)}/responses`, Object.fromEntries(new FormData(f)));
        f.replaceChildren(h('h2', { text: 'Sent' }), h('p', { role: 'status', text: 'Your reply is on its way to the sender. Thank you for writing back.' }));
      });
    } catch (err) {
      if (err.code === 'RESPONSES_DISABLED' || err.status === 404 || err.status === 403 || err.status === 410) f.replaceChildren(h('p', { role: 'alert', text: err.message }));
      else showErrors(f, err);
    }
  });
  return f;
}
load();
