const express = require('express');
const { HttpError, ok, wrap, notFound } = require('../utils/errors');
const { validateMixtape, validateTrack, assertValid } = require('../utils/validate');
const { newToken, hashToken } = require('../utils/tokens');
const { parseId, likePattern, paging } = require('../utils/share');
const { requireAuth } = require('../middleware/auth');

const MAX_TRACKS = 100;
const SORTS = { newest: 'm.created_at DESC, m.id DESC', oldest: 'm.created_at ASC, m.id ASC', title: 'm.title ASC, m.id ASC', updated: 'm.updated_at DESC, m.id DESC' };

const serialize = (row) => {
  const { share_token_hash, user_id, ...rest } = row;
  return { ...rest, has_share_link: !!share_token_hash };
};

// A track's song comes from its own columns, or from the referenced letter (joined here).
const TRACKS_SQL = `
  SELECT t.id, t.position, t.track_note, t.song_letter_id,
         COALESCE(t.track_title, l.song_title) AS track_title,
         COALESCE(t.artist, l.artist) AS artist,
         COALESCE(t.song_url, l.song_url) AS song_url
    FROM mixtape_tracks t LEFT JOIN song_letters l ON l.id = t.song_letter_id
   WHERE t.mixtape_id = ? ORDER BY t.position ASC, t.id ASC`;

module.exports = function mixtapeRoutes({ pool, config }) {
  const r = express.Router();
  r.use(requireAuth(pool));
  const shareUrl = (token) => `${config.baseUrl}/m/${token}`;

  async function findOwned(idParam, userId, conn = pool, lock = false) {
    const id = parseId(idParam);
    const [rows] = await conn.query(`SELECT * FROM mixtapes WHERE id = ? AND user_id = ?${lock ? ' FOR UPDATE' : ''}`, [id, userId]);
    if (!rows[0]) throw notFound('That mixtape could not be found.');
    return rows[0];
  }
  const withTracks = async (row) => {
    const [tracks] = await pool.query(TRACKS_SQL, [row.id]);
    return { ...serialize(row), tracks };
  };

  // Runs fn(conn) inside a transaction with the mixtape row locked, so concurrent edits queue up.
  async function inTransaction(idParam, userId, fn) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const mixtape = await findOwned(idParam, userId, conn, true);
      const result = await fn(conn, mixtape);
      await conn.query('UPDATE mixtapes SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [mixtape.id]);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  }

  r.get('/', wrap(async (req, res) => {
    const { page, limit, offset } = paging(req.query);
    const where = ['m.user_id = ?'];
    const args = [req.user.id];
    if (['draft', 'published'].includes(req.query.status)) { where.push('m.status = ?'); args.push(req.query.status); }
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    if (q) { where.push('(m.title LIKE ? OR m.description LIKE ?)'); args.push(likePattern(q), likePattern(q)); }
    const clause = where.join(' AND ');
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM mixtapes m WHERE ${clause}`, args);
    const [rows] = await pool.query(
      `SELECT m.*, (SELECT COUNT(*) FROM mixtape_tracks t WHERE t.mixtape_id = m.id) AS track_count
         FROM mixtapes m WHERE ${clause} ORDER BY ${SORTS[req.query.sort] || SORTS.updated} LIMIT ? OFFSET ?`,
      [...args, limit, offset]
    );
    ok(res, { items: rows.map(serialize), total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
  }));

  r.post('/', wrap(async (req, res) => {
    const v = assertValid(validateMixtape(req.body));
    const [result] = await pool.query('INSERT INTO mixtapes (user_id, title, description, cover_theme) VALUES (?, ?, ?, ?)', [req.user.id, v.title, v.description || null, v.cover_theme]);
    ok(res, { mixtape: await withTracks(await findOwned(result.insertId, req.user.id)) }, 201);
  }));

  r.get('/:id', wrap(async (req, res) => ok(res, { mixtape: await withTracks(await findOwned(req.params.id, req.user.id)) })));

  r.put('/:id', wrap(async (req, res) => {
    const m = await findOwned(req.params.id, req.user.id);
    const v = assertValid(validateMixtape(req.body));
    await pool.query('UPDATE mixtapes SET title = ?, description = ?, cover_theme = ? WHERE id = ? AND user_id = ?', [v.title, v.description || null, v.cover_theme, m.id, req.user.id]);
    ok(res, { mixtape: await withTracks(await findOwned(m.id, req.user.id)) });
  }));

  r.delete('/:id', wrap(async (req, res) => {
    const m = await findOwned(req.params.id, req.user.id);
    await pool.query('DELETE FROM mixtapes WHERE id = ? AND user_id = ?', [m.id, req.user.id]);
    ok(res, { deleted: true });
  }));

  // ---- tracks
  r.post('/:id/tracks', wrap(async (req, res) => {
    const v = assertValid(validateTrack(req.body));
    await inTransaction(req.params.id, req.user.id, async (conn, mixtape) => {
      const [[{ count, last }]] = await conn.query('SELECT COUNT(*) AS count, COALESCE(MAX(position), 0) AS last FROM mixtape_tracks WHERE mixtape_id = ?', [mixtape.id]);
      if (count >= MAX_TRACKS) throw new HttpError(422, 'TRACK_LIMIT', `A mixtape can hold up to ${MAX_TRACKS} tracks.`);
      if (v.song_letter_id) {
        // The referenced letter must belong to the same owner and have complete song details.
        const [rows] = await conn.query('SELECT song_title, artist, song_url FROM song_letters WHERE id = ? AND user_id = ?', [v.song_letter_id, req.user.id]);
        if (!rows[0]) throw new HttpError(422, 'VALIDATION', 'Please fix the highlighted fields.', { fields: { song_letter_id: 'Choose one of your letters.' } });
        if (!rows[0].song_url || !rows[0].song_title || !rows[0].artist) throw new HttpError(422, 'VALIDATION', 'Please fix the highlighted fields.', { fields: { song_letter_id: 'That letter has no song details yet.' } });
      }
      await conn.query(
        'INSERT INTO mixtape_tracks (mixtape_id, song_letter_id, track_title, artist, song_url, track_note, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [mixtape.id, v.song_letter_id, v.track_title, v.artist, v.song_url, v.track_note || null, last + 1]
      );
    });
    ok(res, { mixtape: await withTracks(await findOwned(req.params.id, req.user.id)) }, 201);
  }));

  // Declared before /:id/tracks/:trackId so "order" is not read as a track id.
  r.put('/:id/tracks/order', wrap(async (req, res) => {
    const order = req.body.order;
    if (!Array.isArray(order) || order.some((n) => !Number.isSafeInteger(n))) throw new HttpError(422, 'VALIDATION', 'Send the track ids in the new order.');
    await inTransaction(req.params.id, req.user.id, async (conn, mixtape) => {
      const [rows] = await conn.query('SELECT id FROM mixtape_tracks WHERE mixtape_id = ?', [mixtape.id]);
      const existing = new Set(rows.map((x) => x.id));
      if (order.length !== existing.size || new Set(order).size !== order.length || !order.every((id) => existing.has(id))) {
        throw new HttpError(422, 'VALIDATION', 'The new order must list every track in this mixtape exactly once.');
      }
      for (let i = 0; i < order.length; i += 1) {
        await conn.query('UPDATE mixtape_tracks SET position = ? WHERE id = ? AND mixtape_id = ?', [i + 1, order[i], mixtape.id]);
      }
    });
    ok(res, { mixtape: await withTracks(await findOwned(req.params.id, req.user.id)) });
  }));

  r.put('/:id/tracks/:trackId', wrap(async (req, res) => {
    const trackId = parseId(req.params.trackId);
    const note = typeof req.body.track_note === 'string' ? req.body.track_note.replace(/\s+/g, ' ').trim() : '';
    if (note.length > 280) throw new HttpError(422, 'VALIDATION', 'Please fix the highlighted fields.', { fields: { track_note: 'Note must be 280 characters or fewer.' } });
    await inTransaction(req.params.id, req.user.id, async (conn, mixtape) => {
      const [result] = await conn.query('UPDATE mixtape_tracks SET track_note = ? WHERE id = ? AND mixtape_id = ?', [note || null, trackId, mixtape.id]);
      if (!result.affectedRows) throw notFound('That track could not be found.');
    });
    ok(res, { mixtape: await withTracks(await findOwned(req.params.id, req.user.id)) });
  }));

  r.delete('/:id/tracks/:trackId', wrap(async (req, res) => {
    const trackId = parseId(req.params.trackId);
    await inTransaction(req.params.id, req.user.id, async (conn, mixtape) => {
      const [result] = await conn.query('DELETE FROM mixtape_tracks WHERE id = ? AND mixtape_id = ?', [trackId, mixtape.id]);
      if (!result.affectedRows) throw notFound('That track could not be found.');
      const [rows] = await conn.query('SELECT id FROM mixtape_tracks WHERE mixtape_id = ? ORDER BY position, id', [mixtape.id]);
      for (let i = 0; i < rows.length; i += 1) await conn.query('UPDATE mixtape_tracks SET position = ? WHERE id = ?', [i + 1, rows[i].id]); // close the gap
    });
    ok(res, { mixtape: await withTracks(await findOwned(req.params.id, req.user.id)) });
  }));

  // ---- sharing: a mixtape is "published" exactly while its share link is active
  const activate = wrap(async (req, res) => {
    const m = await findOwned(req.params.id, req.user.id);
    const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM mixtape_tracks WHERE mixtape_id = ?', [m.id]);
    if (!count) throw new HttpError(409, 'EMPTY_MIXTAPE', 'Add at least one track before sharing this mixtape.');
    const token = newToken();
    await pool.query("UPDATE mixtapes SET status = 'published', visibility = 'link', share_token_hash = ?, published_at = COALESCE(published_at, UTC_TIMESTAMP()) WHERE id = ? AND user_id = ?", [hashToken(token), m.id, req.user.id]);
    ok(res, { mixtape: await withTracks(await findOwned(m.id, req.user.id)), shareUrl: shareUrl(token) });
  });
  r.post('/:id/publish', activate);
  r.post('/:id/share-link', activate);
  r.delete('/:id/share-link', wrap(async (req, res) => {
    const m = await findOwned(req.params.id, req.user.id);
    await pool.query("UPDATE mixtapes SET status = 'draft', visibility = 'private', share_token_hash = NULL WHERE id = ? AND user_id = ?", [m.id, req.user.id]);
    ok(res, { mixtape: await withTracks(await findOwned(m.id, req.user.id)) });
  }));

  return r;
};
