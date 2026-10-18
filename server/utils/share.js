const { parseMusicUrl } = require('./music');
const { HttpError, notFound } = require('./errors');

const parseId = (value) => {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw notFound('That item could not be found.');
  return id;
};

// Escapes LIKE wildcards so a search for "100%" matches literally.
const likePattern = (q) => `%${String(q).replace(/[\\%_]/g, '\\$&')}%`;

function paging(query, { defaultLimit = 12, maxLimit = 50 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

// Is the recipient-facing page open right now? Always evaluated on the server, in UTC.
function accessState(letter, now = new Date()) {
  if (letter.status !== 'published' || letter.visibility !== 'link' || !letter.share_token_hash) return 'hidden';
  if (letter.scheduled_at && new Date(letter.scheduled_at) > now) return 'not_yet';
  if (letter.expires_at && new Date(letter.expires_at) <= now) return 'expired';
  return 'live';
}

// What the owner sees as the letter's state.
function ownerAvailability(letter, now = new Date()) {
  if (letter.status === 'draft') return 'draft';
  if (letter.status === 'archived') return 'archived';
  if (letter.visibility !== 'link' || !letter.share_token_hash) return 'private';
  const s = accessState(letter, now);
  return s === 'live' ? 'live' : s === 'not_yet' ? 'scheduled' : 'expired';
}

function embedFor(songUrl) {
  const p = parseMusicUrl(songUrl || '');
  return p ? { provider: p.provider, embedUrl: p.embedUrl, kind: p.kind } : null;
}

// Throws the right public error for a letter that is not currently open.
function assertOpen(state, letter) {
  if (state === 'live') return;
  if (state === 'not_yet') {
    throw new HttpError(403, 'NOT_YET_AVAILABLE', 'This letter is not open yet.', { availableAt: letter.scheduled_at });
  }
  if (state === 'expired') throw new HttpError(410, 'EXPIRED', 'This link has expired.');
  throw notFound('This link is not available.'); // never reveals whether a letter exists
}

module.exports = { parseId, likePattern, paging, accessState, ownerAvailability, embedFor, assertOpen };
