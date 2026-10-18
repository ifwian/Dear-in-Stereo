// Consistent API responses: { ok: true, data } or { ok: false, error: { code, message, fields? } }
class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const ok = (res, data = {}, status = 200) => res.status(status).json({ ok: true, data });

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const notFound = (what = 'Not found') => new HttpError(404, 'NOT_FOUND', what);

module.exports = { HttpError, ok, wrap, notFound };
