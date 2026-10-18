import { initShell } from '../shell.js';
import { get, put, post, del, setCsrf } from '../api.js';
import { h, $, showErrors, clearErrors, withBusy, toast, confirmDialog } from '../ui.js';

const user = await initShell({ requireUser: true });
const profile = $('#profile-form');
profile.display_name.value = user.display_name;
profile.bio.value = user.bio || '';
$('#email').textContent = user.email;

function bindForm(form, handler, okMessage) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); clearErrors(form);
    try { await withBusy(e.submitter, async () => { await handler(Object.fromEntries(new FormData(form))); if (okMessage) toast(okMessage); }); } catch (err) { showErrors(form, err); }
  });
}
bindForm(profile, (body) => put('/api/account', body), 'Profile saved.');
bindForm($('#password-form'), async (body) => { const d = await post('/api/account/password', body); setCsrf(d.csrfToken); $('#password-form').reset(); }, 'Password changed. Your other devices were signed out.');

const leave = (to = '/') => { location.href = to; };
$('#logout').addEventListener('click', async () => { try { await post('/api/auth/logout'); } finally { leave(); } });
$('#logout-all').addEventListener('click', async () => {
  if (!(await confirmDialog({ title: 'Log out everywhere?', body: 'Every device, including this one, will be signed out.', confirmLabel: 'Log out everywhere' }))) return;
  try { await post('/api/account/sign-out-everywhere'); } finally { leave('/login'); }
});
$('#delete-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget; clearErrors(form);
  if (!(await confirmDialog({ title: 'Delete your account for good?', body: 'Every letter, mixtape and reply will be erased and all share links will stop working. This cannot be undone.', confirmLabel: 'Delete everything', danger: true }))) return;
  try { await withBusy(e.submitter, async () => { await del('/api/account', Object.fromEntries(new FormData(form))); leave('/'); }); } catch (err) { showErrors(form, err); }
});
