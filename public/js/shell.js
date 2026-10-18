// Shared page chrome: skip link, header navigation (public vs signed-in), mobile menu, footer.
import { get, post, setCsrf } from './api.js';
import { h, $, toast } from './ui.js';

const APP_LINKS = [
  ['/dashboard', 'Dashboard'], ['/letters/', 'Letters'], ['/mixtapes/', 'Mixtapes'], ['/responses', 'Responses'], ['/account', 'Account'],
];

function isCurrent(href) {
  const here = location.pathname.replace(/\.html$/, '').replace(/index$/, '');
  const target = href.replace(/index$/, '');
  return target === '/' ? here === '/' : here === target || here.startsWith(target.replace(/\/$/, '') + '/') && target.endsWith('/');
}

export async function initShell({ requireUser = false } = {}) {
  let user = null;
  try {
    const data = await get('/api/auth/me', { redirectOn401: false });
    setCsrf(data.csrfToken);
    user = data.user;
  } catch { /* offline: render the public chrome */ }
  if (requireUser && !user) { location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`; return null; }

  const link = (href, label) => h('a', { href, text: label, 'aria-current': isCurrent(href) ? 'page' : null });
  const nav = h('nav', { class: 'nav', id: 'site-nav', 'aria-label': 'Main' });
  if (user) {
    APP_LINKS.forEach(([href, label]) => nav.append(link(href, label)));
    nav.append(h('button', { type: 'button', class: 'nav__link', text: 'Log out', onclick: async () => {
      try { await post('/api/auth/logout'); } finally { location.href = '/'; }
    } }));
  } else {
    nav.append(link('/how-it-works', 'How it works'), link('/login', 'Log in'), h('a', { class: 'btn btn--primary btn--small', href: '/register', text: 'Start a letter' }));
  }
  const toggle = h('button', { type: 'button', class: 'btn btn--small menu-toggle', 'aria-expanded': 'false', 'aria-controls': 'site-nav', text: 'Menu', onclick: (e) => {
    const open = nav.classList.toggle('is-open');
    e.currentTarget.setAttribute('aria-expanded', String(open));
  } });
  nav.addEventListener('keydown', (e) => { if (e.key === 'Escape') { nav.classList.remove('is-open'); toggle.setAttribute('aria-expanded', 'false'); toggle.focus(); } });

  document.body.prepend(h('a', { class: 'skip-link', href: '#main', text: 'Skip to content' }));
  const header = $('#site-header');
  if (header) {
    header.className = 'site-header';
    header.append(h('div', { class: 'wrap site-header__bar' },
      h('a', { class: 'brand', href: user ? '/dashboard' : '/' }, h('span', { class: 'brand__mark', 'aria-hidden': 'true' }), 'Dear, in Stereo'), toggle, nav));
  }
  const footer = $('#site-footer');
  if (footer) {
    footer.className = 'site-footer';
    footer.append(h('div', { class: 'wrap site-footer__row' },
      h('span', { class: 'tagline', text: 'Some things are easier to say through a song.' }),
      h('span', {}, h('a', { href: '/how-it-works', text: 'How it works' })),
      h('span', { text: 'A share link works for whoever holds it. Letters are not end-to-end encrypted.' })));
  }
  // Show/hide password buttons work on every page that has them.
  document.querySelectorAll('[data-toggle-password]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.togglePassword);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.textContent = show ? 'Hide' : 'Show';
      btn.setAttribute('aria-pressed', String(show));
    });
  });
  return user;
}
export { toast };
