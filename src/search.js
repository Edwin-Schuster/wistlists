// Product search. Uses SerpApi's Google Shopping engine when SERPAPI_KEY is set;
// the UI always offers one-click store searches as well, which need no key.
const config = require('./config');

const STORES = [
  { name: 'Amazon', url: 'https://www.amazon.com/s?k=' },
  { name: 'Target', url: 'https://www.target.com/s?searchTerm=' },
  { name: 'Walmart', url: 'https://www.walmart.com/search?q=' },
  { name: 'Best Buy', url: 'https://www.bestbuy.com/site/searchpage.jsp?st=' },
  { name: 'Etsy', url: 'https://www.etsy.com/search?q=' },
  { name: 'Google Shopping', url: 'https://www.google.com/search?tbm=shop&q=' },
];

const cache = new Map(); // query -> { at, results }

async function searchProducts(query) {
  const q = String(query || '').trim().slice(0, 150);
  const storeLinks = STORES.map((s) => ({ name: s.name, url: s.url + encodeURIComponent(q) }));
  if (!q) return { provider: null, results: [], storeLinks };
  if (!config.SERPAPI_KEY) return { provider: null, results: [], storeLinks };

  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600e3) return { provider: 'google_shopping', results: hit.results, storeLinks };

  const params = new URLSearchParams({
    engine: config.SERPAPI_ENGINE,
    q,
    gl: config.SEARCH_COUNTRY,
    hl: 'en',
    api_key: config.SERPAPI_KEY,
  });
  const res = await fetch(`https://serpapi.com/search.json?${params}`, { signal: AbortSignal.timeout(20000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `Search failed (${res.status})`);

  const results = (data.shopping_results || []).slice(0, 30).map((r) => ({
    title: r.title,
    price: typeof r.extracted_price === 'number' ? r.extracted_price : null,
    priceText: r.price || '',
    store: r.source || '',
    image: r.thumbnail || r.serpapi_thumbnail || '',
    url: r.link || r.product_link || '',
    rating: r.rating || null,
    reviews: r.reviews || null,
  }));
  cache.set(key, { at: Date.now(), results });
  if (cache.size > 200) cache.delete(cache.keys().next().value);
  return { provider: 'google_shopping', results, storeLinks };
}

module.exports = { searchProducts, enabled: () => Boolean(config.SERPAPI_KEY) };
