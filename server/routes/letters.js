const express = require('express');
const { HttpError, ok, wrap, notFound } = require('../utils/errors');
const { validateLetter, assertValid, REASONS } = require('../utils/validate');
const { newToken, hashToken } = require('../utils/tokens');
const { parseId, likePattern, paging, ownerAvailability } = require('../utils/share');
const { requireAuth } = require('../middleware/auth');

const SORTS = {
  newest: 'created_at DESC, id DESC',
  oldest: 'created_at ASC, id ASC',
  title: 'title ASC, id ASC',
  updated: 'updated_at DESC, id DESC',
};
const WRITABLE = [
  'title', 'song_title', 'artist', 'song_url', 'artwork_url', 'recipient_name', 'message', 'reason_category',
  'custom_reason', 'theme', 'sender_display_name', 'show_sender', 'visibility', 'allow_responses', 'scheduled_at', 'expires_at',
];

// Owner-facing shape. The token hash never leaves the server; the owner only learns whether a link exists.
function serialize(row) {
  const { share_token_hash, user_id, ...rest } = row;
  return { ...rest, show_sender: !!rest.show_sender, allow_responses: !!rest.allow_responses, has_share_link: !!share_token_hash, availability: ownerAvailability(row) };
}

module.exports = function letterRoutes({ pool, config }) {
  const r = express.Router();
  r.use(requireAuth(pool));
  const shareUrl = (token) => `${config.baseUrl}/l/${token}`;

  // Every query is scoped by user_id: a letter that is not yours behaves exactly like one that does not exist.
  async function findOwned(idParam, userId) {
    const id = parseId(idParam);
    const [rows] = await pool.query('SELECT * FROM song_letters WHERE id = ? AND user_id = ?', [id, userId]);
    if (!rows[0]) throw notFound('That letter could not be found.');
    return rows[0];
  }

  r.get('/', wrap(async (req, res) => {
    const { page, limit, offset } = paging(req.query);
    const where = ['user_id = ?'];
    const args = [req.user.id];
    const status = req.query.status || 'active';
    if (status === 'active') where.push("status IN ('draft','published')");
    else if (['draft', 'published', 'archived'].includes(status)) { where.push('status = ?'); args.push(status); }
    if (['private', 'link'].includes(req.query.visibility)) { where.push('visibility = ?'); args.push(req.query.visibility); }
    if (REASONS.includes(req.query.reason)) { where.push('reason_category = ?'); args.push(req.query.reason); }
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    if (q) {
      where.push('(title LIKE ? OR song_title LIKE ? OR artist LIKE ? OR recipient_name LIKE ? OR message LIKE ?)');
      args.push(...Array(5).fill(likePattern(q)));
    }
    const orderBy = SORTS[req.query.sort] || SORTS.updated;
    const clause = where.join(' AND ');
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM song_letters WHERE ${clause}`, args);
    const [rows] = await pool.query(
      `SELECT id, title, song_title, artist, recipient_name, reason_category, theme, status, visibility, share_token_hash,
              scheduled_at, expires_at, allow_responses, created_at, updated_at,
              (SELECT COUNT(*) FROM responses WHERE song_letter_id = song_letters.id) AS response_count
         FROM song_letters WHERE ${clause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [...args, limit, offset]
    );
    ok(res, { items: rows.map(serialize), total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
  }));

  r.post('/', wrap(async (req, res) => {
    const publish = req.body.action === 'publish';
    const v = assertValid(validateLetter(req.body, { strict: publish }));
    const token = publish && v.visibility === 'link' ? newToken() : null;
    const [result] = await pool.query(
      `INSERT INTO song_letters (user_id, title, song_title, artist, song_url, artwork_url, recipient_name, message, reason_category,
         custom_reason, theme, sender_display_name, show_sender, status, visibility, share_token_hash, allow_responses,
         scheduled_at, expires_at, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [req.user.id, v.title, v.song_title, v.artist, v.song_url, v.artwork_url, v.recipient_name, v.message, v.reason_category,
        v.custom_reason || null, v.theme, v.sender_display_name || null, v.show_sender ? 1 : 0, publish ? 'published' : 'draft',
        v.visibility, token ? hashToken(token) : null, v.allow_responses ? 1 : 0, v.scheduled_at, v.expires_at, publish ? new Date() : null]
    );
    const letter = await findOwned(result.insertId, req.user.id);
    ok(res, { letter: serialize(letter), shareUrl: token ? shareUrl(token) : null }, 201);
  }));

  r.get('/:id', wrap(async (req, res) => ok(res, { letter: serialize(await findOwned(req.params.id, req.user.id)) })));

  r.put('/:id', wrap(async (req, res) => {
    const existing = await findOwned(req.params.id, req.user.id);
    if (existing.status === 'archived') throw new HttpError(409, 'ARCHIVED', 'Restore this letter from the archive before editing it.');
    const publish = req.body.action === 'publish';
    const strict = publish || existing.status === 'published'; // a published letter must stay complete
    const v = assertValid(validateLetter(req.body, { strict, existing }));
    const status = publish ? 'published' : existing.status;
    let token = null;
    let tokenHash = existing.share_token_hash;
    if (v.visibility === 'private') tokenHash = null;
    else if (status === 'published' && !tokenHash) { token = newToken(); tokenHash = hashToken(token); }
    const publishedAt = status === 'published' && !existing.published_at ? new Date() : existing.published_at;
    const sets = WRITABLE.map((c) => `${c} = ?`).join(', ');
    const values = WRITABLE.map((c) => (c === 'show_sender' || c === 'allow_responses' ? (v[c] ? 1 : 0) : ['custom_reason', 'sender_display_name'].includes(c) ? v[c] || null : v[c]));
    await pool.query(
      `UPDATE song_letters SET ${sets}, status = ?, share_token_hash = ?, published_at = ? WHERE id = ? AND user_id = ?`,
      [...values, status, tokenHash, publishedAt, existing.id, req.user.id]
    );
    ok(res, { letter: serialize(await findOwned(existing.id, req.user.id)), shareUrl: token ? shareUrl(token) : null });
  }));

  r.post('/:id/duplicate', wrap(async (req, res) => {
    const src = await findOwned(req.params.id, req.user.id);
    const [result] = await pool.query(
      `INSERT INTO song_letters (user_id, title, song_title, artist, song_url, artwork_url, recipient_name, message, reason_category,
         custom_reason, theme, sender_display_name, show_sender, status, visibility, allow_responses)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 'private', ?)`,
      [req.user.id, `${src.title}`.slice(0, 108) + ' (copy)', src.song_title, src.artist, src.song_url, src.artwork_url, src.recipient_name,
        src.message, src.reason_category, src.custom_reason, src.theme, src.sender_display_name, src.show_sender, src.allow_responses]
    );
    ok(res, { letter: serialize(await findOwned(result.insertId, req.user.id)) }, 201);
  }));

  // Archiving closes the public link immediately; restoring brings the letter back as a private draft.
  r.post('/:id/archive', wrap(async (req, res) => {
    const l = await findOwned(req.params.id, req.user.id);
    await pool.query("UPDATE song_letters SET status = 'archived', visibility = 'private', share_token_hash = NULL WHERE id = ? AND user_id = ?", [l.id, req.user.id]);
    ok(res, { letter: serialize(await findOwned(l.id, req.user.id)) });
  }));

  r.post('/:id/restore', wrap(async (req, res) => {
    const l = await findOwned(req.params.id, req.user.id);
    if (l.status !== 'archived') throw new HttpError(409, 'NOT_ARCHIVED', 'This letter is not archived.');
    await pool.query("UPDATE song_letters SET status = 'draft' WHERE id = ? AND user_id = ?", [l.id, req.user.id]);
    ok(res, { letter: serialize(await findOwned(l.id, req.user.id)) });
  }));

  r.delete('/:id', wrap(async (req, res) => {
    const l = await findOwned(req.params.id, req.user.id);
    await pool.query('DELETE FROM song_letters WHERE id = ? AND user_id = ?', [l.id, req.user.id]); // responses + mixtape entries cascade
    ok(res, { deleted: true });
  }));

  // (Re)generate the share link. The previous link stops working at once; the new URL is returned once.
  r.post('/:id/share-link', wrap(async (req, res) => {
    const l = await findOwned(req.params.id, req.user.id);
    if (l.status !== 'published') throw new HttpError(409, 'NOT_PUBLISHED', 'Publish the letter before creating a share link.');
    const token = newToken();
    await pool.query("UPDATE song_letters SET visibility = 'link', share_token_hash = ? WHERE id = ? AND user_id = ?", [hashToken(token), l.id, req.user.id]);
    ok(res, { letter: serialize(await findOwned(l.id, req.user.id)), shareUrl: shareUrl(token) });
  }));

  r.delete('/:id/share-link', wrap(async (req, res) => {
    const l = await findOwned(req.params.id, req.user.id);
    await pool.query("UPDATE song_letters SET visibility = 'private', share_token_hash = NULL WHERE id = ? AND user_id = ?", [l.id, req.user.id]);
    ok(res, { letter: serialize(await findOwned(l.id, req.user.id)) });
  }));

  r.get('/:id/responses', wrap(async (req, res) => {
    const l = await findOwned(req.params.id, req.user.id);
    const [rows] = await pool.query('SELECT id, display_name, message, created_at FROM responses WHERE song_letter_id = ? ORDER BY created_at DESC, id DESC LIMIT 200', [l.id]);
    ok(res, { responses: rows });
  }));

  return r;
};
