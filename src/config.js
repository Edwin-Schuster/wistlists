const path = require('node:path');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));

module.exports = {
  PORT: Number(process.env.PORT || 3000),
  DATA_DIR,
  IMAGE_DIR: path.join(DATA_DIR, 'images'),
  DB_PATH: path.join(DATA_DIR, 'wishlist.db'),
  SITE_TITLE: process.env.SITE_TITLE || 'Our Christmas Wish Lists',
  // Set to "true" when serving over HTTPS (behind Caddy/Nginx/Traefik).
  COOKIE_SECURE: String(process.env.COOKIE_SECURE || 'false') === 'true',
  TRUST_PROXY: String(process.env.TRUST_PROXY || 'true') === 'true',
  SESSION_DAYS: Number(process.env.SESSION_DAYS || 30),
  // Optional: https://serpapi.com key enables in-app Google Shopping search with prices + photos.
  SERPAPI_KEY: process.env.SERPAPI_KEY || '',
  SEARCH_COUNTRY: process.env.SEARCH_COUNTRY || 'us',
  DEFAULT_CURRENCY: process.env.DEFAULT_CURRENCY || 'USD',
  // "username:Display Name:password;username2:Display Name 2:password2"
  SEED_USERS: process.env.SEED_USERS || '',
  // Allow the scraper to fetch private/LAN addresses (off by default; SSRF guard).
  ALLOW_PRIVATE_FETCH: String(process.env.ALLOW_PRIVATE_FETCH || 'false') === 'true',
};
