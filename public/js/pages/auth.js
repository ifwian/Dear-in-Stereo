import { initShell } from '../shell.js';
import { post, setCsrf } from '../api.js';
import { $, showErrors, clearErrors, withBusy, safeNext, qs } from '../ui.js';

const user = await initShell();
if (user) location.replace('/dashboard');

const form = $('#auth-form');
const mode = form.dataset.mode;
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearErrors(form);
  const body = Object.fromEntries(new FormData(form));
  try {
    await withBusy(form.querySelector('[type=submit]'), async () => {
      const data = await post(mode === 'login' ? '/api/auth/login' : '/api/auth/register', body);
      setCsrf(data.csrfToken);
      location.href = safeNext(qs('next'));
    });
  } catch (err) {
    showErrors(form, err);
  }
});
