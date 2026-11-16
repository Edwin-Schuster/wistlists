// Reads a public (or shared) Amazon wish list and returns its items.
// Amazon renders the first 10 items in the page and serves the rest through a
// "showMoreUrl" endpoint that returns the next batch plus the next URL.
const cheerio = require('cheerio');
const { safeFetch, parsePrice, currencyFromText } = require('./scraper');

const MAX_PAGES = 40; // ~400 items
const AMAZON_HOST = /(^|\.)amazon\.(com|ca|co\.uk|de|fr|it|es|nl|se|pl|com\.au|com\.mx|com\.br|co\.jp|in|sg|ae|sa|com\.tr|com\.be)$/i;
const SHORT_HOST = /^(a\.co|amzn\.to|amzn\.com|amzn\.eu)$/i;
const LIST_ID = /\/(?:hz\/wishlist\/ls|hz\/wishlist\/genericItemsPage|gp\/registry\/wishlist|registry\/wishlist|wishlist\/ls)\/([A-Z0-9]{8,16})/i;

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

function userError(message) {
  return Object.assign(new Error(message), { status: 400 });
}

// Accepts a wish list link (full or a.co short link) and returns { origin, listId }.
async function resolveListUrl(raw) {
  let u;
  try {
    u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw userError('Paste the link to your Amazon wish list');
  }
  if (SHORT_HOST.test(u.hostname)) {
    const { finalUrl } = await safeFetch(u.toString(), { maxBytes: 2e5 });
    u = new URL(finalUrl);
  }
  if (!AMAZON_HOST.test(u.hostname)) throw userError('That is not an Amazon link. Paste the link from "Send list to others" on your Amazon list.');
  const m = u.pathname.match(LIST_ID);
  if (!m) throw userError("That link isn't an Amazon wish list. Open the list on Amazon and copy its link (it contains /hz/wishlist/ls/).");
  return { origin: `https://${u.hostname.replace(/^smile\./, 'www.')}`, listId: m[1].toUpperCase() };
}

// Turns a thumbnail URL like .../41q3a-T9meL._SS135_.jpg into a 500px version.
function largerImage(src) {
  if (!src || !/^https?:\/\//i.test(src)) return '';
  return src.replace(/\._[A-Z0-9_,]+_\.(jpe?g|png|webp)$/i, '._AC_SL500_.$1');
}

const PRIORITY = { highest: 3, high: 3, medium: 2, normal: 2, low: 1, lowest: 1 };

function parseItems($, origin) {
  const items = [];
  $('li[data-itemid]').each((_, li) => {
    const $li = $(li);
    const iid = $li.attr('data-itemid');
    const byId = (prefix) => $li.find(`[id="${prefix}${iid}"]`);
    const link = byId('itemName_');
    const title = clean(link.attr('title') || link.text());
    if (!title) return;

    const href = link.attr('href') || '';
    const params = $li.attr('data-reposition-action-params') || '';
    const asin = (href.match(/\/dp\/([A-Z0-9]{10})/i) || params.match(/ASIN:([A-Z0-9]{10})/i) || [])[1];
    let url = '';
    if (asin) url = `${origin}/dp/${asin.toUpperCase()}`;
    else if (href) {
      try {
        url = new URL(href, origin).toString();
      } catch {
        url = '';
      }
    }

    const priceText = clean(byId('itemPrice_').find('.a-offscreen').first().text());
    const dataPrice = Number($li.attr('data-price'));
    const price = Number.isFinite(dataPrice) && dataPrice > 0 ? Math.round(dataPrice * 100) / 100 : parsePrice(priceText);

    const img = byId('itemImage_').find('img').first().attr('src') || $li.find('img').first().attr('src');
    const requested = parseInt(clean(byId('itemRequested_').text()), 10);
    const label = clean(byId('itemPriorityLabel_').text()).toLowerCase();
    const priorityWord = Object.keys(PRIORITY).find((w) => label.includes(w));

    let store = 'Amazon';
    try {
      if (url && !AMAZON_HOST.test(new URL(url).hostname)) store = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      /* keep Amazon */
    }

    items.push({
      title: title.slice(0, 200),
      url,
      store,
      price,
      currency: currencyFromText(priceText) || null,
      image: largerImage(img),
      notes: clean(byId('itemComment_').text()).slice(0, 1000),
      priority: priorityWord ? PRIORITY[priorityWord] : 2,
      quantity: Number.isFinite(requested) && requested > 0 && requested < 100 ? requested : 1,
    });
  });
  return items;
}

function looksBlocked(html) {
  return /captcha|Robot Check|Sorry, we just need to make sure you're not a robot/i.test(html.slice(0, 20000));
}

async function fetchAmazonWishlist(rawUrl) {
  const { origin, listId } = await resolveListUrl(String(rawUrl || '').trim());
  const first = await safeFetch(`${origin}/hz/wishlist/ls/${listId}`, { maxBytes: 6e6, timeoutMs: 20000 });
  const html = first.body.toString('utf8');
  if (looksBlocked(html)) throw userError('Amazon asked for a robot check. Wait a few minutes and try again.');
  if (/\/ap\/signin/.test(first.finalUrl)) {
    throw userError('That list is private. On Amazon, open the list → ⋯ More → Manage list → set Privacy to "Public" or "Shared", then try again.');
  }

  let $ = cheerio.load(html);
  const listName = clean($('#profile-list-name').first().text()) || 'Amazon wish list';
  const items = parseItems($, origin);
  if (!items.length && !$('#endOfListMarker').length && !$('#no-items-section-anywhere, #no-items-section').length) {
    throw userError("Couldn't read that list. Make sure it is set to Public or Shared on Amazon.");
  }

  const seenTokens = new Set();
  for (let page = 1; page < MAX_PAGES; page++) {
    if ($('#endOfListMarker').length) break;
    const next = $('input[name="showMoreUrl"]').attr('value');
    const token = next && (next.match(/paginationToken=([^&]*)/) || [])[1];
    if (!next || !token || seenTokens.has(token)) break;
    seenTokens.add(token);
    await pause(400); // be polite to Amazon
    const r = await safeFetch(new URL(next, origin).toString(), {
      maxBytes: 4e6,
      timeoutMs: 20000,
      headers: { 'X-Requested-With': 'XMLHttpRequest', Referer: `${origin}/hz/wishlist/ls/${listId}` },
    });
    const part = r.body.toString('utf8');
    if (looksBlocked(part)) break; // keep what we have
    $ = cheerio.load(part);
    const more = parseItems($, origin);
    if (!more.length) break;
    items.push(...more);
  }

  // Amazon can repeat an item across batches; keep the first.
  const seen = new Set();
  const unique = items.filter((it) => {
    const key = it.url || it.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { listName, listUrl: `${origin}/hz/wishlist/ls/${listId}`, items: unique };
}

module.exports = { fetchAmazonWishlist, resolveListUrl, parseItems, largerImage };
