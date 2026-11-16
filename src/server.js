const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const config = require('./config');
const db = require('./db');
const auth = require('./auth');
const { scrapeProduct, cacheImage } = require('./scraper');
const search = require('./search');

auth.seedUsers();

const app = express();
app.disable('x-powered-by');
if (config.TRUST_PROXY) app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});
app.use(auth.sessionMiddleware);

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const page = (name) => path.join(PUBLIC_DIR, `${name}.html`);
const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ---------- helpers ----------
const AVATARS = ['🎅', '🤶', '🦌', '⛄', '🧝'];
const THEMES = ['classic', 'fireplace'];
const STATUSES = ['active', 'archived', 'got_it'];
const isLocalImage = (img) => Boolean(img) && /^[a-f0-9]{32}\.(jpg|png|webp|gif|avif)$/.test(img);
const imageUrl = (img) => (isLocalImage(img) ? `/images/${img}` : img || '');
const httpError = (status, message) => Object.assign(new Error(message), { status });
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// viewer: null (owner's own view, no claim info) or { userId } (anyone else)
function serializeItem(row, viewer) {
  const item = {
    id: row.id,
    title: row.title,
    url: row.url,
    store: row.store,
    price: row.price,
    previous_price: row.previous_price,
    price_drop: row.price != null && row.previous_price != null && row.price < row.previous_price,
    currency: row.currency,
    image: imageUrl(row.image),
    notes: row.notes,
    priority: row.priority,
    quantity: row.quantity,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  if (viewer) {
    item.claimed = Boolean(row.claimed_at);
    item.claimed_by = row.claimed_by || '';
    item.claimed_by_me = Boolean(viewer.userId && row.claimed_by_user_id === viewer.userId);
  }
  return item;
}

function cleanItemInput(body, { partial = false } = {}) {
  const out = {};
  const has = (k) => !partial || k in body;
  const str = (v, max) => String(v ?? '').trim().slice(0, max);
  if (has('title')) {
    out.title = str(body.title, 200);
    if (!out.title) throw httpError(400, 'Give the item a name');
  }
  if (has('url')) {
    out.url = str(body.url, 2000);
    if (out.url && !/^https?:\/\//i.test(out.url)) out.url = `https://${out.url}`;
    if (out.url) {
      try {
        new URL(out.url);
      } catch {
        throw httpError(400, 'That link does not look right');
      }
    }
  }
  if (has('store')) out.store = str(body.store, 80);
  if (has('price')) {
    const p = body.price === '' || body.price == null ? null : Number(String(body.price).replace(/[^\d.]/g, ''));
    out.price = p != null && Number.isFinite(p) && p >= 0 ? Math.round(p * 100) / 100 : null;
  }
  if (has('currency')) out.currency = (str(body.currency, 3) || config.DEFAULT_CURRENCY).toUpperCase();
  if (has('image')) out.image = str(body.image, 2000);
  if (has('notes')) out.notes = str(body.notes, 1000);
  if (has('priority')) {
    const pr = Number(body.priority);
    out.priority = [1, 2, 3].includes(pr) ? pr : 2;
  }
  if (has('quantity')) {
    const q = parseInt(body.quantity, 10);
    out.quantity = Number.isFinite(q) && q > 0 && q < 100 ? q : 1;
  }
  if (partial && 'status' in body) {
    if (!STATUSES.includes(body.status)) throw httpError(400, 'Unknown status');
    out.status = body.status;
  }
  return out;
}

// Image field from the client: "/images/<file>" (already stored), a remote URL (downloaded), or blank.
async function resolveImage(img) {
  if (!img) return '';
  const local = img.match(/^\/images\/([a-f0-9]{32}\.(?:jpg|png|webp|gif|avif))$/);
  if (local) return local[1];
  if (/^https?:\/\//i.test(img)) return cacheImage(img);
  return '';
}

function removeImageIfOrphaned(img) {
  if (!isLocalImage(img)) return;
  if (!db.prepare('SELECT 1 FROM items WHERE image = ? LIMIT 1').get(img)) {
    fs.rm(path.join(config.IMAGE_DIR, img), { force: true }, () => {});
  }
}

function ownItem(req) {
  const item = db.prepare('SELECT * FROM items WHERE id = ?').get(Number(req.params.id));
  if (!item) throw httpError(404, 'Item not found');
  if (item.user_id !== req.user.id) throw httpError(403, 'That is not your item');
  return item;
}

function updateItem(id, data) {
  const cols = Object.keys(data);
  if (!cols.length) return;
  db.prepare(`UPDATE items SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(
    ...cols.map((c) => data[c]),
    id
  );
}

// Re-scrape one item. Records previous_price when the price drops.
async function refreshItem(item) {
  const data = await scrapeProduct(item.url);
  const updates = {};
  if (data.price) {
    if (item.price != null && data.price < item.price) updates.previous_price = item.price;
    else if (item.price != null && data.price > item.price) updates.previous_price = null;
    updates.price = data.price;
    if (data.currency) updates.currency = data.currency;
  }
  if (!item.image && data.image) updates.image = await cacheImage(data.image);
  updateItem(item.id, updates);
  return {
    dropped: updates.previous_price != null,
    ok: Boolean(data.price),
    warning: data.price ? '' : data.warning || 'No price found on the page',
  };
}

const getItem = (id) => db.prepare('SELECT * FROM items WHERE id = ?').get(id);

// ---------- photo upload (JSON body with a data: URL; needs a bigger body limit) ----------
const MAGIC = [
  { ext: 'jpg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'gif', test: (b) => b.subarray(0, 4).toString('ascii') === 'GIF8' },
  { ext: 'webp', test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
];
app.post(
  '/api/upload',
  auth.requireUser,
  auth.requireJson,
  express.json({ limit: '12mb' }),
  (req, res) => {
    const m = String(req.body?.data || '').match(/^data:image\/[a-z+.-]+;base64,(.+)$/i);
    if (!m) return res.status(400).json({ error: 'Please choose an image file' });
    const buf = Buffer.from(m[1], 'base64');
    if (buf.length > 8e6) return res.status(413).json({ error: 'That photo is too big (8 MB max)' });
    const kind = MAGIC.find((k) => k.test(buf));
    if (!kind) return res.status(400).json({ error: 'Use a JPG, PNG, WebP or GIF image' });
    const name = `${crypto.createHash('sha256').update(buf).digest('hex').slice(0, 32)}.${kind.ext}`;
    const file = path.join(config.IMAGE_DIR, name);
    if (!fs.existsSync(file)) fs.writeFileSync(file, buf);
    res.json({ image: `/images/${name}` });
  }
);

// ---------- API ----------
const api = express.Router();
api.use(express.json({ limit: '200kb' }));
api.use(auth.requireJson);

api.get('/config', (req, res) => {
  res.json({
    siteTitle: config.SITE_TITLE,
    searchEnabled: search.enabled(),
    currency: config.DEFAULT_CURRENCY,
    avatars: AVATARS,
    themes: THEMES,
  });
});

api.get('/me', (req, res) => res.json({ user: req.user }));

api.post(
  '/login',
  auth.rateLimit({ max: 10, windowMs: 15 * 60e3, message: 'Too many login attempts. Try again in a few minutes.' }),
  (req, res) => {
    const { username, password } = req.body || {};
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(String(username || '').trim());
    if (!user || !auth.verifyPassword(String(password || ''), user.password_hash)) {
      return res.status(401).json({ error: 'Wrong username or password' });
    }
    const { token, expires } = auth.createSession(user.id);
    res.cookie(auth.COOKIE, token, auth.cookieOpts(expires));
    res.json({ ok: true, user: { username: user.username, display_name: user.display_name } });
  }
);

api.post('/logout', (req, res) => {
  if (req.sessionToken) db.prepare('DELETE FROM sessions WHERE token = ?').run(req.sessionToken);
  res.clearCookie(auth.COOKIE, { path: '/' });
  res.json({ ok: true });
});

api.post('/account', auth.requireUser, (req, res) => {
  const b = req.body || {};
  const updates = {};
  if (b.display_name !== undefined) updates.display_name = String(b.display_name).trim().slice(0, 60) || req.user.username;
  if (b.intro !== undefined) updates.intro = String(b.intro).trim().slice(0, 500);
  if (b.avatar !== undefined) {
    if (!AVATARS.includes(b.avatar)) return res.status(400).json({ error: 'Pick one of the avatars' });
    updates.avatar = b.avatar;
  }
  if (b.theme !== undefined) {
    if (!THEMES.includes(b.theme)) return res.status(400).json({ error: 'Unknown theme' });
    updates.theme = b.theme;
  }
  if (b.new_password) {
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!auth.verifyPassword(String(b.current_password || ''), row.password_hash)) {
      return res.status(400).json({ error: 'Current password is wrong' });
    }
    auth.setPassword(req.user.id, String(b.new_password)); // also logs out other sessions
    const { token, expires } = auth.createSession(req.user.id);
    res.cookie(auth.COOKIE, token, auth.cookieOpts(expires));
  }
  const cols = Object.keys(updates);
  if (cols.length) {
    db.prepare(`UPDATE users SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`).run(...cols.map((c) => updates[c]), req.user.id);
  }
  res.json({ ok: true });
});

// Public: everyone's lists (home page stockings)
api.get('/lists', (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.username, u.display_name, u.avatar, u.intro,
              COUNT(i.id) AS count,
              COALESCE(SUM(i.price * i.quantity), 0) AS total,
              COALESCE(SUM(CASE WHEN i.claimed_at IS NOT NULL THEN 1 ELSE 0 END), 0) AS claimed
       FROM users u LEFT JOIN items i ON i.user_id = u.id AND i.status = 'active'
       GROUP BY u.id ORDER BY u.id`
    )
    .all();
  // No spoilers: the owner never learns how many of their own wishes are claimed.
  res.json({ lists: rows.map((r) => (req.user && req.user.username === r.username ? { ...r, claimed: null } : r)) });
});

// Public: one person's list. Claims are hidden when the owner is looking.
api.get('/lists/:username', (req, res) => {
  const owner = db.prepare('SELECT id, username, display_name, avatar, intro FROM users WHERE username = ?').get(req.params.username);
  if (!owner) return res.status(404).json({ error: 'No list with that name' });
  const isOwner = req.user?.id === owner.id;
  const viewer = isOwner ? null : { userId: req.user?.id || null };
  const items = db
    .prepare("SELECT * FROM items WHERE user_id = ? AND status = 'active' ORDER BY sort_order ASC, id DESC")
    .all(owner.id)
    .map((r) => serializeItem(r, viewer));
  const { id: _id, ...ownerPublic } = owner;
  res.json({ owner: ownerPublic, isOwner, loggedIn: Boolean(req.user), items });
});

// ----- my list (dashboard) -----
api.get('/my/items', auth.requireUser, (req, res) => {
  const items = db
    .prepare('SELECT * FROM items WHERE user_id = ? ORDER BY sort_order ASC, id DESC')
    .all(req.user.id)
    .map((r) => serializeItem(r, null));
  res.json({ items });
});

api.put('/my/order', auth.requireUser, (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
  const stmt = db.prepare('UPDATE items SET sort_order = ? WHERE id = ? AND user_id = ?');
  db.exec('BEGIN');
  try {
    ids.forEach((id, i) => stmt.run(i, id, req.user.id));
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  res.json({ ok: true });
});

api.post(
  '/my/refresh-all',
  auth.requireUser,
  auth.rateLimit({ max: 5, windowMs: 5 * 60e3, message: 'Prices were just refreshed. Try again in a few minutes.' }),
  wrap(async (req, res) => {
    const items = db.prepare("SELECT * FROM items WHERE user_id = ? AND url <> '' AND status = 'active'").all(req.user.id);
    let dropped = 0;
    let updated = 0;
    const failed = [];
    const queue = [...items];
    const worker = async () => {
      for (let it = queue.shift(); it; it = queue.shift()) {
        try {
          const r = await refreshItem(it);
          if (r.ok) updated++;
          else failed.push(it.title);
          if (r.dropped) dropped++;
        } catch {
          failed.push(it.title);
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    res.json({ checked: items.length, updated, dropped, failed });
  })
);

api.post(
  '/scrape',
  auth.requireUser,
  auth.rateLimit({ max: 60, windowMs: 60e3 }),
  wrap(async (req, res) => {
    const url = String(req.body?.url || '').trim();
    if (!url) return res.status(400).json({ error: 'Paste a link first' });
    res.json(await scrapeProduct(/^https?:\/\//i.test(url) ? url : `https://${url}`));
  })
);

api.get(
  '/search',
  auth.requireUser,
  auth.rateLimit({ max: 30, windowMs: 60e3 }),
  wrap(async (req, res) => res.json(await search.searchProducts(req.query.q)))
);

api.post(
  '/items',
  auth.requireUser,
  wrap(async (req, res) => {
    const data = cleanItemInput(req.body || {});
    data.image = await resolveImage(data.image);
    const top = db.prepare('SELECT COALESCE(MIN(sort_order), 0) - 1 AS s FROM items WHERE user_id = ?').get(req.user.id).s;
    const r = db
      .prepare(
        `INSERT INTO items (user_id, title, url, store, price, currency, image, notes, priority, quantity, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(req.user.id, data.title, data.url, data.store, data.price, data.currency, data.image, data.notes, data.priority, data.quantity, top);
    res.status(201).json({ item: serializeItem(getItem(r.lastInsertRowid), null) });
  })
);

api.put(
  '/items/:id',
  auth.requireUser,
  wrap(async (req, res) => {
    const existing = ownItem(req);
    const data = cleanItemInput(req.body || {}, { partial: true });
    if ('image' in data) data.image = await resolveImage(data.image);
    if ('price' in data && data.price !== existing.price) data.previous_price = null; // manual edit resets drop badge
    updateItem(existing.id, data);
    if ('image' in data && data.image !== existing.image) removeImageIfOrphaned(existing.image);
    res.json({ item: serializeItem(getItem(existing.id), null) });
  })
);

api.delete('/items/:id', auth.requireUser, (req, res) => {
  const item = ownItem(req);
  db.prepare('DELETE FROM items WHERE id = ?').run(item.id);
  removeImageIfOrphaned(item.image);
  res.json({ ok: true });
});

api.post(
  '/items/:id/refresh',
  auth.requireUser,
  wrap(async (req, res) => {
    const item = ownItem(req);
    if (!item.url) throw httpError(400, 'This item has no link to refresh from');
    const r = await refreshItem(item);
    res.json({ item: serializeItem(getItem(item.id), null), ...r });
  })
);

// ----- claims: "I'll get this!" -----
const claimLimiter = auth.rateLimit({ max: 30, windowMs: 10 * 60e3 });
api.post('/items/:id/claim', claimLimiter, (req, res) => {
  const item = getItem(Number(req.params.id));
  if (!item || item.status !== 'active') return res.status(404).json({ error: 'Item not found' });
  if (req.user?.id === item.user_id) return res.status(400).json({ error: "No peeking! You can't claim your own gifts." });
  if (item.claimed_at) return res.status(409).json({ error: 'Someone already claimed this one' });
  const name = String(req.body?.name || '').trim().slice(0, 60) || (req.user ? req.user.display_name : '');
  const secret = crypto.randomBytes(16).toString('hex');
  db.prepare(
    "UPDATE items SET claimed_by = ?, claimed_by_user_id = ?, claim_secret = ?, claimed_at = datetime('now'), wrapped = 0 WHERE id = ?"
  ).run(name, req.user?.id ?? null, secret, item.id);
  res.json({ ok: true, secret, claimed_by: name });
});

api.post('/items/:id/unclaim', claimLimiter, (req, res) => {
  const item = getItem(Number(req.params.id));
  if (!item) return res.status(404).json({ error: 'Item not found' });
  if (req.user?.id === item.user_id) return res.status(400).json({ error: "That's your own list!" });
  if (!item.claimed_at) return res.json({ ok: true });
  const secret = String(req.body?.secret || '');
  const secretOk =
    Boolean(item.claim_secret) &&
    secret.length === item.claim_secret.length &&
    crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(item.claim_secret));
  const mine = req.user && item.claimed_by_user_id === req.user.id;
  if (!secretOk && !mine) return res.status(403).json({ error: 'Only the person who claimed this can undo it' });
  db.prepare(
    'UPDATE items SET claimed_by = NULL, claimed_by_user_id = NULL, claim_secret = NULL, claimed_at = NULL, wrapped = 0 WHERE id = ?'
  ).run(item.id);
  res.json({ ok: true });
});

// ----- gift planner -----
api.get('/planner', auth.requireUser, (req, res) => {
  const rows = db
    .prepare(
      `SELECT i.*, u.display_name AS owner_name, u.username AS owner_username, u.avatar AS owner_avatar
       FROM items i JOIN users u ON u.id = i.user_id
       WHERE i.claimed_by_user_id = ? ORDER BY u.id, i.claimed_at`
    )
    .all(req.user.id);
  const items = rows.map((r) => ({
    ...serializeItem(r, { userId: req.user.id }),
    wrapped: Boolean(r.wrapped),
    owner: { name: r.owner_name, username: r.owner_username, avatar: r.owner_avatar },
  }));
  const spent = items.reduce((s, i) => s + (i.price || 0) * i.quantity, 0);
  res.json({ budget: req.user.budget, spent: Math.round(spent * 100) / 100, items });
});

api.put('/planner', auth.requireUser, (req, res) => {
  const b = req.body?.budget;
  const budget = b === '' || b == null ? null : Number(b);
  if (budget != null && !(Number.isFinite(budget) && budget >= 0)) return res.status(400).json({ error: 'Budget must be a number' });
  db.prepare('UPDATE users SET budget = ? WHERE id = ?').run(budget, req.user.id);
  res.json({ ok: true, budget });
});

api.post('/items/:id/wrapped', auth.requireUser, (req, res) => {
  const item = getItem(Number(req.params.id));
  if (!item || item.claimed_by_user_id !== req.user.id) return res.status(404).json({ error: 'Not one of your claimed gifts' });
  db.prepare('UPDATE items SET wrapped = ? WHERE id = ?').run(req.body?.wrapped ? 1 : 0, item.id);
  res.json({ ok: true });
});

api.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use('/api', api);

// ---------- pages ----------
app.use('/images', express.static(config.IMAGE_DIR, { maxAge: '365d', immutable: true, fallthrough: false }));
app.use('/static', express.static(path.join(PUBLIC_DIR, 'static'), { maxAge: '1h' }));

const sendPage = (name) => (req, res) => res.sendFile(page(name));
app.get('/', sendPage('index'));
app.get('/login', (req, res) => (req.user ? res.redirect('/manage') : res.sendFile(page('login'))));
for (const p of ['manage', 'planner', 'account']) {
  app.get(`/${p}`, (req, res) => (req.user ? res.sendFile(page(p)) : res.redirect(`/login?next=/${p}`)));
}
// Bookmarklet target: /add?url=...
app.get('/add', (req, res) => {
  const target = `/manage?add=${encodeURIComponent(String(req.query.url || ''))}`;
  res.redirect(req.user ? target : `/login?next=${encodeURIComponent(target)}`);
});

// Public list page, with Open Graph tags filled in server-side for link previews.
app.get('/list/:username', (req, res) => {
  const owner = db.prepare('SELECT id, username, display_name, avatar FROM users WHERE username = ?').get(req.params.username);
  if (!owner) return res.status(404).sendFile(page('index'));
  const stats = db
    .prepare("SELECT COUNT(*) AS n FROM items WHERE user_id = ? AND status = 'active'")
    .get(owner.id);
  const cover = db
    .prepare("SELECT image FROM items WHERE user_id = ? AND status = 'active' AND image <> '' ORDER BY sort_order, id DESC LIMIT 1")
    .get(owner.id)?.image;
  const base = `${req.protocol}://${req.get('host')}`;
  const coverUrl = cover ? (isLocalImage(cover) ? `${base}/images/${cover}` : cover) : `${base}/static/og-default.png`;
  const title = `${owner.avatar} ${owner.display_name}'s Christmas Wish List`;
  const desc = `${stats.n} wish${stats.n === 1 ? '' : 'es'} for Santa. Pick one and claim it so nobody doubles up!`;
  const html = fs
    .readFileSync(page('list'), 'utf8')
    .replaceAll('{{TITLE}}', escapeHtml(title))
    .replaceAll('{{DESCRIPTION}}', escapeHtml(desc))
    .replaceAll('{{OG_IMAGE}}', escapeHtml(coverUrl))
    .replaceAll('{{URL}}', escapeHtml(`${base}/list/${owner.username}`));
  res.type('html').send(html);
});

// Printable "Santa's scroll" view of a list.
app.get('/scroll/:username', (req, res) => {
  const owner = db.prepare('SELECT id FROM users WHERE username = ?').get(req.params.username);
  res.status(owner ? 200 : 404).sendFile(page(owner ? 'scroll' : 'index'));
});

app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use((req, res) => res.status(404).sendFile(page('index')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  const msg = status >= 500 ? 'Something went wrong' : err.type === 'entity.too.large' ? 'That upload is too big' : err.message;
  if (req.path.startsWith('/api/')) return res.status(status).json({ error: msg });
  res.status(status).send(status === 404 ? 'Not found' : 'Something went wrong');
});

const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
app.listen(config.PORT, () => {
  console.log(`🎄 Wish list running on http://localhost:${config.PORT}`);
  if (!userCount) {
    console.warn('No users yet! Set SEED_USERS, or run: docker compose exec wishlist npm run user -- add edwin "Edwin" <password>');
  }
});
