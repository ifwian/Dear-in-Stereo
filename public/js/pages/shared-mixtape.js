import { initShell } from '../shell.js';
import { get } from '../api.js';
import { h, $, clear } from '../ui.js';
import { renderMixtape } from '../render.js';

initShell();
const stage = $('#stage');
const token = location.pathname.split('/')[2] || '';

async function load() {
  try {
    const { mixtape } = await get(`/api/public/mixtapes/${encodeURIComponent(token)}`, { redirectOn401: false });
    document.title = `${mixtape.title} — a mixtape`;
    clear(stage).append(renderMixtape(mixtape), h('p', { class: 'recipient__banner muted small' }, 'Made with ', h('a', { href: '/', text: 'Dear, in Stereo' }), '. ', h('a', { href: '/register', text: 'Make a mixtape of your own' }), '.'));
  } catch (err) {
    document.title = 'Not available — Dear, in Stereo';
    clear(stage).append(h('div', { class: 'message-page' }, h('div', { class: 'disc', 'aria-hidden': 'true' }),
      h('h1', { text: err.status === 404 ? 'This link is not available' : 'Could not load the mixtape' }),
      h('p', { class: 'muted', text: err.status === 404 ? 'It may be mistyped, or the sender may have closed it.' : err.message }),
      err.status === 404 ? null : h('button', { type: 'button', class: 'btn', text: 'Try again', onclick: load })));
  }
}
load();
