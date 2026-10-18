// Small DOM helpers. Text is ALWAYS inserted with textContent / createTextNode — never innerHTML —
// so user-provided content cannot become markup.
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

// ---- time: the server stores UTC; the browser shows (and asks for) the viewer's local time.
export const timeZoneName = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'your local time zone';
export function formatDate(iso, withTime = true) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(d);
}
export const localInputToIso = (value) => (value ? new Date(value).toISOString() : null);
export function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---- notifications
function toastHost() {
  let host = $('#toasts');
  if (!host) { host = h('div', { id: 'toasts', class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(host); }
  return host;
}
export function toast(message, kind = 'ok') {
  const el = h('div', { class: `toast${kind === 'error' ? ' toast--error' : ''}`, text: message });
  toastHost().append(el);
  setTimeout(() => el.remove(), kind === 'error' ? 7000 : 4000);
}

// Accessible confirmation built on <dialog> (focus is trapped and restored by the browser).
export function confirmDialog({ title, body, confirmLabel = 'Confirm', danger = false, cancelLabel = 'Cancel' }) {
  return new Promise((resolve) => {
    const dlg = h('dialog', { 'aria-labelledby': 'dlg-title' },
      h('h2', { id: 'dlg-title', text: title }),
      h('p', { text: body }),
      h('div', { class: 'cluster cluster--end' },
        h('button', { type: 'button', class: 'btn', text: cancelLabel, onclick: () => dlg.close('cancel') }),
        h('button', { type: 'button', class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`, text: confirmLabel, onclick: () => dlg.close('ok') })));
    dlg.addEventListener('close', () => { const ok = dlg.returnValue === 'ok'; dlg.remove(); resolve(ok); });
    document.body.append(dlg);
    dlg.showModal();
    $('button', dlg).focus();
  });
}

// ---- forms
export function clearErrors(form) {
  $$('.field.has-error', form).forEach((f) => f.classList.remove('has-error'));
  $$('.field-error', form).forEach((e) => e.remove());
  $$('.form-error', form).forEach((e) => e.remove());
  $$('[aria-invalid]', form).forEach((e) => { e.removeAttribute('aria-invalid'); });
}
export function showErrors(form, err) {
  clearErrors(form);
  let first = null;
  for (const [name, message] of Object.entries(err.fields || {})) {
    const input = form.elements[name];
    const field = input && input.closest ? input.closest('.field') : null;
    if (!field) continue;
    const id = `err-${name}`;
    field.classList.add('has-error');
    field.append(h('div', { class: 'field-error', id, text: message }));
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), id].filter(Boolean).join(' '));
    first = first || input;
  }
  if (!first || !Object.keys(err.fields || {}).length) {
    form.prepend(h('div', { class: 'form-error', role: 'alert', text: err.message }));
  } else first.focus();
}
export async function withBusy(button, fn) {
  button.setAttribute('aria-busy', 'true');
  try { return await fn(); } finally { button.removeAttribute('aria-busy'); }
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { 'aria-hidden': 'true', tabindex: '-1', readonly: true });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export const emptyState = (title, text, ...actions) =>
  h('div', { class: 'empty' }, h('h2', { text: title }), h('p', { class: 'muted', text }), actions.length ? h('div', { class: 'cluster' }, ...actions) : null);

export const errorBox = (message, retry) =>
  h('div', { class: 'notice notice--warn', role: 'alert' }, h('p', { text: message }), retry ? h('button', { type: 'button', class: 'btn btn--small', text: 'Try again', onclick: retry }) : null);

export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// Only same-site paths are accepted as post-login destinations (prevents open redirects).
export const safeNext = (value, fallback = '/dashboard') => (typeof value === 'string' && /^\/(?!\/|\\)/.test(value) ? value : fallback);
export const qs = (name) => new URLSearchParams(location.search).get(name);

export const REASONS = {
  reminded_me: 'This reminded me of you.',
  unsaid: 'Something I could not say.',
  late_night: 'For your late-night thoughts.',
  memory: 'A memory worth keeping.',
  comfort: 'For when you need a little comfort.',
  just_because: 'Just because.',
  future_day: 'A song for a future day.',
  custom: 'In my own words',
};
export const THEMES = { paper: 'Paper', ink: 'Ink', rosewood: 'Rosewood', kraft: 'Kraft', dusk: 'Dusk' };
export const AVAILABILITY = { draft: 'Draft', private: 'Private', live: 'Link live', scheduled: 'Scheduled', expired: 'Expired', archived: 'Archived' };
