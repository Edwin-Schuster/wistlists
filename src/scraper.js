// Fetches a product page and extracts title / price / image / store.
// Strategy (best signal first): JSON-LD Product -> OpenGraph/product meta -> microdata ->
// site-specific selectors (Amazon etc.) -> generic fallbacks.
const dns = require('node:dns').promises;
const net = require('node:net');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const cheerio = require('cheerio');
const config = require('./config');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const BROWSER_HEADERS = {
  'User-Agent': UA,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
  'Upgrade-Insecure-Requests': '1',
};

// ---------- SSRF guard ----------
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 || a === 127 || a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith('::ffff:')) return isPrivateIp(v6.slice(7));
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80');
}

async function assertPublicUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error('That does not look like a valid link');
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http(s) links are supported');
  if (config.ALLOW_PRIVATE_FETCH) return u;
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error('That address is not allowed');
  return u;
}

// fetch() with manual redirects so every hop passes the SSRF guard, plus timeout + size cap.
async function safeFetch(url, { maxBytes = 4e6, timeoutMs = 12000, headers = {} } = {}) {
  let current = url;
  for (let hop = 0; hop < 6; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, {
      headers: { ...BROWSER_HEADERS, ...headers },
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current).toString();
      continue;
    }
    const reader = res.body?.getReader();
    const chunks = [];
    let size = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) {
          reader.cancel().catch(() => {});
          break;
        }
        chunks.push(value);
      }
    }
    return { res, finalUrl: current, body: Buffer.concat(chunks) };
  }
  throw new Error('Too many redirects');
}

// ---------- parsing helpers ----------
const clean = (s) => (s == null ? '' : String(s).replace(/\s+/g, ' ').trim());

function parsePrice(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
  let s = String(value).replace(/[^\d.,]/g, '');
  if (!s) return null;
  // "1.299,99" (EU) vs "1,299.99" (US) vs "12,99"
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    s = s.length - lastComma - 1 === 2 ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else {
    s = s.replace(/,/g, '');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

const SYMBOL_CURRENCY = { $: 'USD', '£': 'GBP', '€': 'EUR', '¥': 'JPY', '₹': 'INR', 'C$': 'CAD', 'A$': 'AUD' };
function currencyFromText(text) {
  const t = String(text || '');
  for (const [sym, code] of Object.entries(SYMBOL_CURRENCY).reverse()) if (t.includes(sym)) return code;
  const m = t.match(/\b(USD|EUR|GBP|CAD|AUD|JPY|INR|NZD|CHF|SEK|NOK|DKK|MXN)\b/);
  return m ? m[1] : null;
}

function absUrl(src, base) {
  if (!src) return '';
  try {
    return new URL(String(src).trim(), base).toString();
  } catch {
    return '';
  }
}

function firstImage(img) {
  if (!img) return '';
  if (Array.isArray(img)) return firstImage(img[0]);
  if (typeof img === 'object') return img.url || img.contentUrl || img['@id'] || '';
  return String(img);
}

function collectJsonLd($) {
  const nodes = [];
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    nodes.push(n);
    if (n['@graph']) walk(n['@graph']);
    if (n.mainEntity) walk(n.mainEntity);
    if (n.hasVariant) walk(n.hasVariant);
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).contents().text();
    try {
      walk(JSON.parse(raw));
    } catch {
      try {
        walk(JSON.parse(raw.replace(/[\u0000-\u001f]+/g, ' ')));
      } catch {
        /* ignore */
      }
    }
  });
  return nodes;
}

const isType = (n, t) => {
  const types = [].concat(n['@type'] || []);
  return types.some((x) => String(x).toLowerCase() === t.toLowerCase());
};

function fromOffers(offers) {
  if (!offers) return {};
  const list = [].concat(offers);
  for (const o of list) {
    if (!o || typeof o !== 'object') continue;
    const price = parsePrice(o.price ?? o.lowPrice ?? o.priceSpecification?.price ?? o.highPrice);
    if (price) {
      return {
        price,
        currency: o.priceCurrency || o.priceSpecification?.priceCurrency || null,
        store: clean(o.seller?.name),
      };
    }
    if (o.offers) {
      const nested = fromOffers(o.offers);
      if (nested.price) return nested;
    }
  }
  return {};
}

function storeFromHost(hostname) {
  if (net.isIP(hostname.replace(/^\[|\]$/g, ''))) return '';
  const host = hostname.replace(/^www\.|^smile\.|^m\./, '');
  const known = {
    'amazon.': 'Amazon', 'target.com': 'Target', 'walmart.com': 'Walmart', 'bestbuy.com': 'Best Buy',
    'etsy.com': 'Etsy', 'ebay.': 'eBay', 'costco.com': 'Costco', 'homedepot.com': 'Home Depot',
    'lowes.com': "Lowe's", 'rei.com': 'REI', 'nordstrom.com': 'Nordstrom', 'kohls.com': "Kohl's",
    'macys.com': "Macy's", 'ikea.com': 'IKEA', 'apple.com': 'Apple', 'lego.com': 'LEGO',
    'sephora.com': 'Sephora', 'ulta.com': 'Ulta', 'wayfair.com': 'Wayfair', 'crateandbarrel.com': 'Crate & Barrel',
    'williams-sonoma.com': 'Williams Sonoma', 'barnesandnoble.com': 'Barnes & Noble', 'nike.com': 'Nike',
    'patagonia.com': 'Patagonia', 'uncommongoods.com': 'Uncommon Goods', 'anthropologie.com': 'Anthropologie',
  };
  for (const [k, v] of Object.entries(known)) if (host.includes(k)) return v;
  const base = host.split('.').slice(-2, -1)[0] || host;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function amazonLargeImage($) {
  const el = $('#landingImage, #imgBlkFront, #ebooksImgBlkFront, #main-image').first();
  if (!el.length) return '';
  const hi = el.attr('data-old-hires');
  if (hi) return hi;
  const dyn = el.attr('data-a-dynamic-image');
  if (dyn) {
    try {
      const entries = Object.entries(JSON.parse(dyn));
      entries.sort((a, b) => b[1][0] * b[1][1] - a[1][0] * a[1][1]);
      if (entries[0]) return entries[0][0];
    } catch {
      /* ignore */
    }
  }
  return el.attr('src') || '';
}

function extract(html, pageUrl) {
  const $ = cheerio.load(html);
  const meta = (...names) => {
    for (const n of names) {
      const v =
        $(`meta[property="${n}"]`).attr('content') ||
        $(`meta[name="${n}"]`).attr('content') ||
        $(`meta[itemprop="${n}"]`).attr('content');
      if (v && clean(v)) return clean(v);
    }
    return '';
  };

  const out = { title: '', price: null, currency: null, image: '', store: '', description: '' };
  const host = new URL(pageUrl).hostname;

  // 1) JSON-LD
  const nodes = collectJsonLd($);
  const product =
    nodes.find((n) => isType(n, 'Product') && n.offers) ||
    nodes.find((n) => isType(n, 'Product')) ||
    nodes.find((n) => isType(n, 'ProductGroup')) ||
    nodes.find((n) => isType(n, 'Book') || isType(n, 'IndividualProduct'));
  if (product) {
    out.title = clean(product.name);
    out.image = firstImage(product.image);
    out.description = clean(product.description).slice(0, 300);
    Object.assign(out, Object.fromEntries(Object.entries(fromOffers(product.offers)).filter(([, v]) => v)));
    if (!out.price && Array.isArray(product.hasVariant)) {
      for (const v of product.hasVariant) {
        const o = fromOffers(v.offers);
        if (o.price) {
          out.price = o.price;
          out.currency = o.currency;
          break;
        }
      }
    }
  }

  // 2) Site-specific (Amazon is the big one; it rarely ships JSON-LD). Detect by host or by its DOM.
  if (/amazon\./.test(host) || $('#productTitle').length) {
    out.title = out.title || clean($('#productTitle').text()) || clean($('#title').text());
    if (!out.price) {
      const txt =
        $('#corePrice_feature_div .a-offscreen').first().text() ||
        $('#corePriceDisplay_desktop_feature_div .a-offscreen').first().text() ||
        $('.priceToPay .a-offscreen').first().text() ||
        $('#priceblock_ourprice, #priceblock_dealprice, #price_inside_buybox, #kindle-price, #price').first().text() ||
        $('.a-price .a-offscreen').first().text();
      out.price = parsePrice(txt);
      out.currency = out.currency || currencyFromText(txt);
    }
    out.image = out.image || amazonLargeImage($);
  }

  // 3) OpenGraph / product meta / twitter cards
  out.title = out.title || meta('og:title', 'twitter:title', 'title');
  out.image = out.image || meta('og:image:secure_url', 'og:image', 'og:image:url', 'twitter:image', 'twitter:image:src', 'image');
  out.description = out.description || meta('og:description', 'description', 'twitter:description').slice(0, 300);
  if (!out.price) {
    out.price = parsePrice(
      meta('product:price:amount', 'og:price:amount', 'twitter:data1', 'price') ||
        $('[itemprop="price"]').first().attr('content') ||
        $('[itemprop="price"]').first().text()
    );
    out.currency =
      out.currency ||
      meta('product:price:currency', 'og:price:currency', 'priceCurrency') ||
      $('[itemprop="priceCurrency"]').first().attr('content') ||
      null;
  }
  out.store = out.store || meta('og:site_name');

  // 4) Generic fallbacks
  out.title = out.title || clean($('h1').first().text()) || clean($('title').text());
  if (!out.price) {
    const candidates = $('[class*="price" i], [id*="price" i], [data-testid*="price" i]')
      .slice(0, 30)
      .map((_, el) => clean($(el).text()))
      .get()
      .filter((t) => /[$£€¥₹]\s?\d/.test(t) && t.length < 40);
    if (candidates[0]) {
      out.price = parsePrice(candidates[0].match(/[$£€¥₹]\s?[\d.,]+/)[0]);
      out.currency = out.currency || currencyFromText(candidates[0]);
    }
  }
  if (!out.image) {
    const img = $('img[src]')
      .filter((_, el) => {
        const w = parseInt($(el).attr('width') || '0', 10);
        const src = $(el).attr('src') || '';
        return !/logo|sprite|icon|pixel|blank|spacer/i.test(src) && (w === 0 || w >= 200);
      })
      .first()
      .attr('src');
    out.image = img || '';
  }

  // Tidy up
  out.title = out.title.replace(/\s*[|–-]\s*(Amazon\.com|Target|Walmart\.com|Best Buy|Etsy).*$/i, '').slice(0, 200);
  if (/^Amazon\.[a-z.]+\s*:/i.test(out.title)) out.title = out.title.replace(/^Amazon\.[a-z.]+\s*:\s*/i, '').replace(/\s+:\s+[^:]+$/, '');
  out.image = absUrl(out.image, pageUrl);
  out.store = clean(out.store) || storeFromHost(host);
  if (out.price && !out.currency) out.currency = config.DEFAULT_CURRENCY;
  if (out.currency) out.currency = String(out.currency).toUpperCase().slice(0, 3);
  return out;
}

// Turns tracking-heavy URLs into clean canonical ones where we know how.
function canonicalizeUrl(raw) {
  try {
    const u = new URL(raw);
    if (/amazon\./.test(u.hostname)) {
      const m = u.pathname.match(/\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/asin)\/([A-Z0-9]{10})/i);
      if (m) return `${u.protocol}//${u.hostname}/dp/${m[1].toUpperCase()}`;
    }
    for (const p of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|msclkid|mc_|ref_|_ga|igshid|si$)/i.test(p)) u.searchParams.delete(p);
    }
    u.hash = '';
    return u.toString();
  } catch {
    return raw;
  }
}

async function scrapeProduct(rawUrl) {
  const url = canonicalizeUrl(String(rawUrl).trim());
  const result = { url, title: '', price: null, currency: null, image: '', store: '', warning: '' };
  try {
    const { res, finalUrl, body } = await safeFetch(url);
    const ctype = res.headers.get('content-type') || '';
    if (ctype.startsWith('image/')) {
      return { ...result, image: finalUrl, store: storeFromHost(new URL(finalUrl).hostname) };
    }
    const data = extract(body.toString('utf8'), finalUrl);
    Object.assign(result, data, { url: canonicalizeUrl(finalUrl) === finalUrl ? url : canonicalizeUrl(finalUrl) });
    if (!res.ok) result.warning = `The store responded with ${res.status}; some details may be missing.`;
    if (/captcha|robot check|access denied|are you a human/i.test(data.title)) {
      result.title = '';
      result.warning = 'The store blocked automatic lookup. Fill in the details by hand.';
    }
  } catch (e) {
    result.store = (() => {
      try {
        return storeFromHost(new URL(url).hostname);
      } catch {
        return '';
      }
    })();
    result.warning = `Couldn't read that page automatically (${e.message}). You can fill in the details by hand.`;
  }
  if (!result.warning) {
    const missing = [!result.title && 'name', !result.price && 'price', !result.image && 'photo'].filter(Boolean);
    if (missing.length === 3) result.warning = 'No product details found on that page. Fill in what you can.';
    else if (missing.length) result.warning = `Couldn't find the ${missing.join(' or ')} on that page. Add it by hand if you like.`;
  }
  return result;
}

// Downloads an image into the data volume so it keeps working even if the store link dies.
async function cacheImage(imageUrl) {
  if (!imageUrl || !/^https?:/i.test(imageUrl)) return imageUrl || '';
  try {
    const { res, body } = await safeFetch(imageUrl, {
      maxBytes: 8e6,
      headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8' },
    });
    const ctype = (res.headers.get('content-type') || '').split(';')[0].trim();
    const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' }[ctype];
    if (!res.ok || !ext || body.length < 200 || body.length >= 8e6) return imageUrl;
    const name = `${crypto.createHash('sha256').update(body).digest('hex').slice(0, 32)}.${ext}`;
    const file = path.join(config.IMAGE_DIR, name);
    if (!fs.existsSync(file)) fs.writeFileSync(file, body);
    return name;
  } catch {
    return imageUrl; // fall back to hot-linking
  }
}

module.exports = { scrapeProduct, cacheImage, parsePrice, extract, canonicalizeUrl, storeFromHost };
