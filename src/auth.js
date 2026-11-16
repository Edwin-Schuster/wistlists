const crypto = require('node:crypto');
const db = require('./db');
const config = require('./config');

const COOKIE = 'wl_session';

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(expected, actual);
}

function validatePassword(password) {
  if (!password || String(password).length < 8) throw new Error('Password must be at least 8 characters');
}

function createUser(username, displayName, password) {
  if (!/^[a-z0-9_-]{2,32}$/i.test(username || '')) {
    throw new Error('Username must be 2-32 letters, numbers, _ or -');
  }
  validatePassword(password);
  return db
    .prepare('INSERT INTO users (username, display_name, password_hash) VALUES (?, ?, ?)')
    .run(username.toLowerCase(), (displayName || username).trim(), hashPassword(password));
}

function setPassword(userId, password) {
  validatePassword(password);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), userId);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

// Creates users listed in SEED_USERS on startup. Existing users are never touched,
// so passwords changed inside the app stick.
function seedUsers() {
  if (!config.SEED_USERS) return;
  for (const entry of config.SEED_USERS.split(/[;\n]/).map((s) => s.trim()).filter(Boolean)) {
    const [username, displayName, ...pw] = entry.split(':');
    const password = pw.join(':');
    if (db.prepare('SELECT id FROM users WHERE username = ?').get(username)) continue;
    try {
      createUser(username, displayName, password);
      console.log(`[seed] created user "${username}"`);
    } catch (e) {
      console.error(`[seed] could not create "${username}": ${e.message}`);
    }
  }
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = Date.now() + config.SESSION_DAYS * 864e5;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
  return { token, expires };
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      try {
        out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        /* ignore malformed cookie */
      }
    }
  }
  return out;
}

function cookieOpts(expires) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.COOKIE_SECURE,
    path: '/',
    expires: new Date(expires),
  };
}

// Attaches req.user (or null) to every request.
function sessionMiddleware(req, _res, next) {
  req.user = null;
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) {
    const row = db
      .prepare(
        `SELECT u.id, u.username, u.display_name, u.intro, u.avatar, u.theme, u.budget, s.expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`
      )
      .get(token);
    if (row && row.expires_at > Date.now()) {
      const { expires_at: _e, ...user } = row;
      req.user = user;
      req.sessionToken = token;
    }
  }
  next();
}

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in' });
  next();
}

// CSRF defence: state-changing API calls must be JSON. A cross-site HTML form can't send
// application/json, and we never answer CORS preflights, so other sites can't forge requests.
function requireJson(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  // HTML forms can't send DELETE and cross-site fetch() DELETE needs a preflight, so a bodiless DELETE is safe.
  if (req.method === 'DELETE' && !req.headers['content-length'] && !req.headers['transfer-encoding']) return next();
  if (!req.is('application/json')) return res.status(415).json({ error: 'Expected JSON' });
  next();
}

// Small in-memory rate limiter factory (per IP).
function rateLimit({ max, windowMs, message }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (now > v.reset) hits.delete(k);
  }, windowMs).unref();
  return (req, res, next) => {
    const now = Date.now();
    const rec = hits.get(req.ip) || { count: 0, reset: now + windowMs };
    if (now > rec.reset) Object.assign(rec, { count: 0, reset: now + windowMs });
    rec.count++;
    hits.set(req.ip, rec);
    if (rec.count > max) return res.status(429).json({ error: message || 'Too many requests, slow down.' });
    next();
  };
}

setInterval(() => {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}, 60 * 60e3).unref();

module.exports = {
  COOKIE,
  verifyPassword,
  createUser,
  setPassword,
  seedUsers,
  createSession,
  cookieOpts,
  sessionMiddleware,
  requireUser,
  requireJson,
  rateLimit,
};
