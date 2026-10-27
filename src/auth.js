/**
 * Password hashing (scrypt, built into Node.js) and cookie-based sessions.
 */
const crypto = require('crypto');
const db = require('./db');
const { COOKIE_NAME, SESSION_DAYS } = require('./config');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const attempt = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(attempt, Buffer.from(hash, 'hex'));
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim().split('='))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)])
  );
}

function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  db.run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', [token, userId, expires.toISOString()]);
  res.cookie(COOKIE_NAME, token, { httpOnly: true, sameSite: 'lax', expires });
}

function endSession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (token) db.run('DELETE FROM sessions WHERE token = ?', [token]);
  res.clearCookie(COOKIE_NAME);
}

/** Fields that are safe to send to the browser. */
function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    orgName: row.org_name,
    phone: row.phone,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
  };
}

/** Middleware: attaches req.user when a valid session cookie is present. */
function loadUser(req, res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (token) {
    const row = db.get(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`,
      [token, new Date().toISOString()]
    );
    if (row) req.user = publicUser(row);
  }
  next();
}

/** Middleware factory: only lets through logged-in users, optionally of one role. */
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Log in to continue.' });
    if (role && req.user.role !== role) {
      const who = role === 'donor' ? 'donors' : 'NGOs and volunteers';
      return res.status(403).json({ error: `Only ${who} can do this.` });
    }
    next();
  };
}

module.exports = { hashPassword, verifyPassword, startSession, endSession, publicUser, loadUser, requireRole };
