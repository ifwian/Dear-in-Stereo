const express = require('express');
const { ok, wrap } = require('../utils/errors');
const { requireAuth } = require('../middleware/auth');
const { paging, ownerAvailability } = require('../utils/share');
const { parseMusicUrl, lookupMetadata } = require('../utils/music');
const { HttpError } = require('../utils/errors');

module.exports = function dashboardRoutes({ pool, limiters, fetchImpl }) {
  const r = express.Router();
  const auth = requireAuth(pool); // per route, so unknown paths fall through to the API 404

  // All numbers come straight from the database for the signed-in user.
  r.get('/dashboard', auth, wrap(async (req, res) => {
    const uid = req.user.id;
    const [[counts]] = await pool.query(
      `SELECT (SELECT COUNT(*) FROM song_letters WHERE user_id = ? AND status <> 'archived') AS letters,
              (SELECT COUNT(*) FROM song_letters WHERE user_id = ? AND status = 'draft') AS drafts,
              (SELECT COUNT(*) FROM mixtapes WHERE user_id = ?) AS mixtapes,
              (SELECT COUNT(*) FROM responses r JOIN song_letters l ON l.id = r.song_letter_id WHERE l.user_id = ?) AS responses`,
      [uid, uid, uid, uid]);
    const [letters] = await pool.query(
      `SELECT id, title, song_title, artist, recipient_name, theme, status, visibility, share_token_hash, scheduled_at, expires_at, updated_at
         FROM song_letters WHERE user_id = ? AND status <> 'archived' ORDER BY created_at DESC, id DESC LIMIT 5`, [uid]);
    const [mixtapes] = await pool.query(
      `SELECT m.id, m.title, m.cover_theme, m.status, m.updated_at, (SELECT COUNT(*) FROM mixtape_tracks t WHERE t.mixtape_id = m.id) AS track_count
         FROM mixtapes m WHERE m.user_id = ? ORDER BY m.updated_at DESC, m.id DESC LIMIT 5`, [uid]);
    ok(res, {
      counts,
      recentLetters: letters.map(({ share_token_hash, ...l }) => ({ ...l, availability: ownerAvailability({ ...l, share_token_hash }) })),
      recentMixtapes: mixtapes,
    });
  }));

  // Responses to the signed-in user's letters only (the join is scoped by l.user_id).
  r.get('/responses', auth, wrap(async (req, res) => {
    const { page, limit, offset } = paging(req.query, { defaultLimit: 20, maxLimit: 50 });
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM responses r JOIN song_letters l ON l.id = r.song_letter_id WHERE l.user_id = ?', [req.user.id]);
    const [rows] = await pool.query(
      `SELECT r.id, r.display_name, r.message, r.created_at, l.id AS letter_id, l.title AS letter_title, l.recipient_name
         FROM responses r JOIN song_letters l ON l.id = r.song_letter_id WHERE l.user_id = ?
        ORDER BY r.created_at DESC, r.id DESC LIMIT ? OFFSET ?`, [req.user.id, limit, offset]);
    ok(res, { items: rows, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
  }));

  r.post('/music/parse', auth, limiters.lookup, wrap(async (req, res) => {
    const parsed = parseMusicUrl(req.body.url);
    if (!parsed) throw new HttpError(422, 'UNSUPPORTED_LINK', 'Only https Spotify and YouTube links are supported.');
    const metadata = req.body.lookup ? await lookupMetadata(parsed, fetchImpl) : null;
    ok(res, { ...parsed, metadata });
  }));

  return r;
};
