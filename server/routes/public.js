// Recipient-facing API. No login: possession of the share token is the credential (a bearer link).
// Every failure for a missing/revoked/draft/archived link is the same generic 404.
const express = require('express');
const { HttpError, ok, wrap, notFound } = require('../utils/errors');
const { hashToken, isTokenShaped } = require('../utils/tokens');
const { accessState, assertOpen, embedFor } = require('../utils/share');
const { validateResponse, assertValid } = require('../utils/validate');

const MAX_RESPONSES_PER_LETTER = 200;

module.exports = function publicRoutes({ pool, limiters }) {
  const r = express.Router();
  r.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    next();
  });

  async function loadLetter(token) {
    if (!isTokenShaped(token)) throw notFound('This link is not available.');
    const [rows] = await pool.query(
      `SELECT l.*, u.display_name AS owner_name FROM song_letters l JOIN users u ON u.id = l.user_id WHERE l.share_token_hash = ?`,
      [hashToken(token)]
    );
    const letter = rows[0];
    if (!letter) throw notFound('This link is not available.');
    assertOpen(accessState(letter), letter);
    return letter;
  }

  r.get('/letters/:token', wrap(async (req, res) => {
    const l = await loadLetter(req.params.token);
    ok(res, {
      letter: {
        title: l.title, song_title: l.song_title, artist: l.artist, song_url: l.song_url, artwork_url: l.artwork_url,
        embed: embedFor(l.song_url), recipient_name: l.recipient_name, message: l.message,
        reason_category: l.reason_category, custom_reason: l.custom_reason, theme: l.theme,
        sender_name: l.show_sender ? l.sender_display_name || l.owner_name : null,
        allow_responses: !!l.allow_responses, published_at: l.published_at,
      },
    });
  }));

  r.post('/letters/:token/responses', limiters.response, wrap(async (req, res) => {
    // Cross-site forms cannot send JSON without a CORS preflight, which this server never approves.
    if (!req.is('application/json')) throw new HttpError(415, 'UNSUPPORTED', 'Send JSON.');
    const l = await loadLetter(req.params.token);
    if (!l.allow_responses) throw new HttpError(403, 'RESPONSES_DISABLED', 'The sender has turned off responses for this letter.');
    const v = assertValid(validateResponse(req.body));
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM responses WHERE song_letter_id = ?', [l.id]);
    if (total >= MAX_RESPONSES_PER_LETTER) throw new HttpError(429, 'RESPONSE_LIMIT', 'This letter has reached its limit of responses.');
    await pool.query('INSERT INTO responses (song_letter_id, display_name, message) VALUES (?, ?, ?)', [l.id, v.display_name || null, v.message]);
    ok(res, { sent: true }, 201);
  }));

  r.get('/mixtapes/:token', wrap(async (req, res) => {
    if (!isTokenShaped(req.params.token)) throw notFound('This link is not available.');
    const [rows] = await pool.query(
      `SELECT m.id, m.title, m.description, m.cover_theme, m.status, m.visibility, m.published_at, u.display_name AS owner_name
         FROM mixtapes m JOIN users u ON u.id = m.user_id WHERE m.share_token_hash = ?`,
      [hashToken(req.params.token)]
    );
    const m = rows[0];
    if (!m || m.status !== 'published' || m.visibility !== 'link') throw notFound('This link is not available.');
    // Only song details are exposed for letter-backed tracks — never the letter's private message.
    const [tracks] = await pool.query(
      `SELECT t.position, t.track_note,
              COALESCE(t.track_title, l.song_title) AS title, COALESCE(t.artist, l.artist) AS artist, COALESCE(t.song_url, l.song_url) AS song_url
         FROM mixtape_tracks t LEFT JOIN song_letters l ON l.id = t.song_letter_id
        WHERE t.mixtape_id = ? ORDER BY t.position, t.id`,
      [m.id]
    );
    ok(res, {
      mixtape: {
        title: m.title, description: m.description, cover_theme: m.cover_theme, author: m.owner_name, published_at: m.published_at,
        tracks: tracks.map((t) => ({ position: t.position, title: t.title, artist: t.artist, note: t.track_note, song_url: t.song_url, embed: embedFor(t.song_url) })),
      },
    });
  }));

  return r;
};
