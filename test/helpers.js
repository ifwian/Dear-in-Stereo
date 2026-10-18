// Test helpers: a throwaway test database, a real HTTP server on a random port, and a cookie-aware client.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { createApp } = require('../server/app');

const TEST_DB = 'dear_in_stereo_test';
const SPOTIFY = 'https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC';
const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

async function resetDatabase() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER, password: process.env.DB_PASSWORD, multipleStatements: true,
  });
  await conn.query(`DROP DATABASE IF EXISTS ${TEST_DB}`);
  const sql = fs.readFileSync(path.join(__dirname, '..', 'database.sql'), 'utf8').replace(/dear_in_stereo_db/g, TEST_DB);
  await conn.query(sql);
  await conn.end();
}

async function startServer(options = {}) {
  await resetDatabase();
  const env = { ...process.env, DB_NAME: TEST_DB, BCRYPT_ROUNDS: '4', NODE_ENV: 'test' };
  const limits = { login: 1000, register: 1000, response: 1000, lookup: 1000, ...(options.limits || {}) };
  const instance = createApp({ env, limits, fetchImpl: options.fetchImpl });
  const server = await new Promise((resolve) => { const s = instance.app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    ...instance, base,
    stop: async () => { await new Promise((r) => server.close(r)); await instance.close(); },
  };
}

class Client {
  constructor(base) { this.base = base; this.cookie = ''; this.csrf = null; }

  async request(method, url, body, { csrf = true, headers = {}, raw = false, redirect = 'manual' } = {}) {
    const h = { ...headers };
    if (this.cookie) h.cookie = this.cookie;
    if (body !== undefined && !h['content-type']) h['content-type'] = 'application/json';
    if (method !== 'GET' && csrf) {
      if (!this.csrf) await this.syncCsrf();
      h['x-csrf-token'] = this.csrf;
      if (this.cookie) h.cookie = this.cookie;
    }
    const res = await fetch(this.base + url, { method, headers: h, body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)), redirect });
    for (const line of res.headers.getSetCookie()) {
      const [pair] = line.split(';');
      const [name, ...rest] = pair.split('=');
      if (/expires=Thu, 01 Jan 1970/i.test(line)) this.cookie = '';
      else if (name === 'dis.sid') this.cookie = `${name}=${rest.join('=')}`;
    }
    if (raw) return res;
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* html */ }
    if (json && json.data && json.data.csrfToken) this.csrf = json.data.csrfToken;
    return { status: res.status, body: json, text, headers: res.headers };
  }
  get(url, opts) { return this.request('GET', url, undefined, opts); }
  post(url, body = {}, opts) { return this.request('POST', url, body, opts); }
  put(url, body = {}, opts) { return this.request('PUT', url, body, opts); }
  del(url, body, opts) { return this.request('DELETE', url, body, opts); }
  async syncCsrf() { const r = await this.request('GET', '/api/auth/me'); this.csrf = r.body.data.csrfToken; }
  async signUp(name, email, password = 'correct horse 42') {
    const r = await this.post('/api/auth/register', { display_name: name, email, password });
    if (r.status !== 201) throw new Error(`register failed: ${r.text}`);
    return r;
  }
}

const letterBody = (o = {}) => ({
  title: 'For the long drive', song_title: 'Dreams', artist: 'Fleetwood Mac', song_url: SPOTIFY,
  recipient_name: 'Sam', message: 'This one made me think of you.', reason_category: 'reminded_me',
  theme: 'paper', show_sender: true, allow_responses: true, visibility: 'link', ...o,
});

const tokenFromUrl = (url) => url.split('/').pop();

module.exports = { startServer, Client, letterBody, tokenFromUrl, SPOTIFY, YOUTUBE };
