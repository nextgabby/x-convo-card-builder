export function sendError(res, err, fallback = 'Something went wrong') {
  console.error(err);
  if (err.status === 429) {
    return res.status(429).json({ error: err.message, resetIn: err.resetIn });
  }
  const status = err.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  const message = status === 500
    ? fallback
    : (err.publicMessage || err.message || fallback);
  return res.status(status).json({ error: message });
}
