// Thin fetch wrapper: JSON in/out, CSRF header on writes, one consistent error type.
export class ApiError extends Error {
  constructor(status, error = {}) {
    super(error.message || 'Something went wrong. Please try again.');
    this.status = status;
    this.code = error.code || 'ERROR';
    this.fields = error.fields || {};
    this.details = error;
  }
}

let csrfToken = null;
export const setCsrf = (t) => { if (t) csrfToken = t; };

async function send(method, url, body, { redirectOn401 = true } = {}) {
  const isPublic = url.startsWith('/api/public/');
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && !isPublic) {
    if (!csrfToken) await send('GET', '/api/auth/me');
    headers['X-CSRF-Token'] = csrfToken;
  }
  let res;
  try {
    res = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, { code: 'NETWORK', message: 'Could not reach the server. Check your connection and try again.' });
  }
  let json = null;
  try { json = await res.json(); } catch { /* empty or non-JSON body */ }
  if (json && json.data && json.data.csrfToken) csrfToken = json.data.csrfToken;
  if (res.ok && json && json.ok) return json.data;
  const err = new ApiError(res.status, (json && json.error) || {});
  if (err.code === 'CSRF' && method !== 'GET' && !send.retrying) { // session rotated: fetch a fresh token and retry once
    csrfToken = null; send.retrying = true;
    try { return await send(method, url, body, { redirectOn401 }); } finally { send.retrying = false; }
  }
  if (res.status === 401 && redirectOn401 && err.code === 'UNAUTHENTICATED') {
    location.href = `/login.html?next=${encodeURIComponent(location.pathname + location.search)}`;
  }
  throw err;
}

export const get = (url, opts) => send('GET', url, undefined, opts);
export const post = (url, body = {}, opts) => send('POST', url, body, opts);
export const put = (url, body = {}, opts) => send('PUT', url, body, opts);
export const del = (url, body, opts) => send('DELETE', url, body, opts);
