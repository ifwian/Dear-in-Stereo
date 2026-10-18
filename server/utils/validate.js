// Server-side validation. Each validator returns { value, fields } where `fields` maps
// field name -> message. An empty `fields` object means the input is valid.
const { parseMusicUrl, parseArtworkUrl } = require('./music');
const { HttpError } = require('./errors');

const REASONS = ['reminded_me', 'unsaid', 'late_night', 'memory', 'comfort', 'just_because', 'future_day', 'custom'];
const THEMES = ['paper', 'ink', 'rosewood', 'kraft', 'dusk'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Collapses whitespace in single-line text; strips control characters everywhere.
const line = (v) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim() : '');
const block = (v) =>
  typeof v === 'string' ? v.replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim() : '';
const bool = (v) => v === true || v === 1 || v === '1' || v === 'true';

function check(fields, name, text, { max, min = 0, label = name, required = false }) {
  if (required && !text) fields[name] = `${label} is required.`;
  else if (text && text.length < min) fields[name] = `${label} must be at least ${min} characters.`;
  else if (text.length > max) fields[name] = `${label} must be ${max} characters or fewer.`;
}

// Accepts an ISO-8601 timestamp that includes a timezone (the browser sends UTC "Z" times).
function parseInstant(v) {
  if (v === null || v === undefined || v === '') return { value: null };
  if (typeof v !== 'string' || !/(Z|[+-]\d\d:?\d\d)$/i.test(v)) return { error: 'Use a valid date and time.' };
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? { error: 'Use a valid date and time.' } : { value: d };
}

const sameInstant = (a, b) => (a ? new Date(a).getTime() : null) === (b ? b.getTime() : null);

/**
 * strict=true is used when publishing: every field the recipient sees must be present.
 * existing is the stored letter (on update) so unchanged dates are not re-checked against "now".
 */
function validateLetter(body, { strict = false, existing = null, now = new Date() } = {}) {
  const f = {};
  const v = {
    title: line(body.title),
    song_title: line(body.song_title),
    artist: line(body.artist),
    recipient_name: line(body.recipient_name),
    message: block(body.message),
    custom_reason: line(body.custom_reason),
    sender_display_name: line(body.sender_display_name),
    reason_category: body.reason_category || 'just_because',
    theme: body.theme || 'paper',
    visibility: body.visibility || 'private',
    show_sender: bool(body.show_sender ?? true),
    allow_responses: bool(body.allow_responses),
  };

  check(f, 'title', v.title, { max: 120, label: 'Title', required: true });
  check(f, 'song_title', v.song_title, { max: 200, label: 'Song title', required: strict });
  check(f, 'artist', v.artist, { max: 200, label: 'Artist', required: strict });
  check(f, 'recipient_name', v.recipient_name, { max: 80, label: 'Recipient', required: strict });
  check(f, 'message', v.message, { max: 5000, label: 'Message', required: strict });
  check(f, 'custom_reason', v.custom_reason, { max: 140, label: 'Custom reason' });
  check(f, 'sender_display_name', v.sender_display_name, { max: 60, label: 'Sender name' });

  if (!REASONS.includes(v.reason_category)) f.reason_category = 'Choose one of the listed reasons.';
  if (strict && v.reason_category === 'custom' && !v.custom_reason) f.custom_reason = 'Write your own reason.';
  if (!THEMES.includes(v.theme)) f.theme = 'Choose one of the listed themes.';
  if (!['private', 'link'].includes(v.visibility)) f.visibility = 'Visibility must be private or link.';
  if (v.reason_category !== 'custom') v.custom_reason = '';

  // Song link: required when publishing, validated whenever present.
  const rawUrl = typeof body.song_url === 'string' ? body.song_url.trim() : '';
  if (!rawUrl) {
    v.song_url = '';
    if (strict) f.song_url = 'Paste a Spotify or YouTube link.';
  } else {
    const parsed = parseMusicUrl(rawUrl);
    if (!parsed) f.song_url = 'Only https Spotify and YouTube links are supported.';
    else v.song_url = parsed.url;
  }

  const rawArt = typeof body.artwork_url === 'string' ? body.artwork_url.trim() : '';
  if (!rawArt) v.artwork_url = null;
  else {
    const art = parseArtworkUrl(rawArt);
    if (!art || art.length > 500) f.artwork_url = 'Artwork must be an https image link (500 characters max).';
    else v.artwork_url = art;
  }

  const sched = parseInstant(body.scheduled_at);
  const exp = parseInstant(body.expires_at);
  if (sched.error) f.scheduled_at = sched.error;
  if (exp.error) f.expires_at = exp.error;
  v.scheduled_at = sched.value ?? null;
  v.expires_at = exp.value ?? null;
  if (v.scheduled_at && !f.scheduled_at && v.scheduled_at <= now && !(existing && sameInstant(existing.scheduled_at, v.scheduled_at))) {
    f.scheduled_at = 'Pick a time in the future.';
  }
  if (v.expires_at && !f.expires_at && v.expires_at <= now && !(existing && sameInstant(existing.expires_at, v.expires_at))) {
    f.expires_at = 'The expiry must be in the future.';
  }
  if (v.scheduled_at && v.expires_at && !f.expires_at && v.expires_at <= v.scheduled_at) {
    f.expires_at = 'The expiry must come after the scheduled time.';
  }
  return { value: v, fields: f };
}

function validateMixtape(body) {
  const f = {};
  const v = {
    title: line(body.title),
    description: line(body.description),
    cover_theme: body.cover_theme || 'kraft',
  };
  check(f, 'title', v.title, { max: 120, label: 'Title', required: true });
  check(f, 'description', v.description, { max: 500, label: 'Description' });
  if (!THEMES.includes(v.cover_theme)) f.cover_theme = 'Choose one of the listed covers.';
  return { value: v, fields: f };
}

// A track is either { song_letter_id } or { track_title, artist, song_url } — never both.
function validateTrack(body) {
  const f = {};
  const v = { track_note: line(body.track_note), song_letter_id: null, track_title: null, artist: null, song_url: null };
  check(f, 'track_note', v.track_note, { max: 280, label: 'Note' });
  const hasLetter = body.song_letter_id !== undefined && body.song_letter_id !== null && body.song_letter_id !== '';
  if (hasLetter) {
    const id = Number(body.song_letter_id);
    if (!Number.isInteger(id) || id <= 0) f.song_letter_id = 'Choose one of your letters.';
    else v.song_letter_id = id;
    if (body.track_title || body.artist || body.song_url) f.song_letter_id = 'Add either a letter or a song, not both.';
  } else {
    v.track_title = line(body.track_title);
    v.artist = line(body.artist);
    check(f, 'track_title', v.track_title, { max: 200, label: 'Song title', required: true });
    check(f, 'artist', v.artist, { max: 200, label: 'Artist', required: true });
    const parsed = parseMusicUrl(typeof body.song_url === 'string' ? body.song_url : '');
    if (!parsed) f.song_url = 'Only https Spotify and YouTube links are supported.';
    else v.song_url = parsed.url;
  }
  return { value: v, fields: f };
}

function validateRegistration(body) {
  const f = {};
  const v = { display_name: line(body.display_name), email: line(body.email).toLowerCase(), password: typeof body.password === 'string' ? body.password : '' };
  check(f, 'display_name', v.display_name, { max: 60, min: 2, label: 'Display name', required: true });
  if (!EMAIL_RE.test(v.email) || v.email.length > 254) f.email = 'Enter a valid email address.';
  const pw = passwordProblem(v.password);
  if (pw) f.password = pw;
  return { value: v, fields: f };
}

function passwordProblem(pw) {
  if (typeof pw !== 'string' || pw.length < 10) return 'Use at least 10 characters.';
  if (pw.length > 72) return 'Use 72 characters or fewer.'; // bcrypt only reads the first 72 bytes
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Include at least one letter and one number.';
  return null;
}

function validateResponse(body) {
  const f = {};
  const v = { display_name: line(body.display_name), message: block(body.message) };
  check(f, 'display_name', v.display_name, { max: 60, label: 'Name' });
  check(f, 'message', v.message, { max: 1000, label: 'Response', required: true });
  return { value: v, fields: f };
}

// Throws a 422 with per-field messages when validation failed.
function assertValid({ value, fields }) {
  if (Object.keys(fields).length) throw new HttpError(422, 'VALIDATION', 'Please fix the highlighted fields.', { fields });
  return value;
}

module.exports = {
  REASONS, THEMES, line, block, bool, passwordProblem,
  validateLetter, validateMixtape, validateTrack, validateRegistration, validateResponse, assertValid,
};
