// Shared helpers for every page. Loaded before the page script.
(() => {
  const PRIORITY = { 1: 'Nice', 2: 'Really want', 3: 'Dream gift' };

  async function api(method, url, body) {
    const opts = { method, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (body === undefined && method !== 'GET') body = {};
    if (body !== undefined) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    let data = {};
    try {
      data = await res.json();
    } catch {
      /* empty body */
    }
    if (!res.ok) throw Object.assign(new Error(data.error || `Request failed (${res.status})`), { status: res.status });
    return data;
  }

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // Only allow http(s) and same-site paths in href/src attributes.
  const safeUrl = (u) => {
    const s = String(u || '').trim();
    if (s.startsWith('/') && !s.startsWith('//')) return s;
    return /^https?:\/\//i.test(s) ? s : '';
  };

  const money = (n, cur = 'USD') => {
    if (n == null || n === '') return '';
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'USD', maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
    } catch {
      return `$${Number(n).toFixed(2)}`;
    }
  };

  const stars = (p) => {
    const n = Number(p) || 2;
    return `<span class="stars" title="${PRIORITY[n]}" aria-label="${n} of 3 stars: ${PRIORITY[n]}">${'★'.repeat(n)}<span class="stars-off">${'★'.repeat(3 - n)}</span></span>`;
  };

  function toast(msg, kind = 'info', ms = 3500) {
    let box = document.querySelector('.toasts');
    if (!box) {
      box = document.createElement('div');
      box.className = 'toasts';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      document.body.append(box);
    }
    const t = document.createElement('div');
    t.className = `toast toast-${kind}`;
    t.textContent = msg;
    box.append(t);
    setTimeout(() => {
      t.classList.add('toast-out');
      setTimeout(() => t.remove(), 400);
    }, ms);
  }

  let mePromise;
  const me = () => (mePromise ||= api('GET', '/api/me').then((d) => d.user).catch(() => null));

  async function renderNav() {
    const nav = document.querySelector('[data-nav]');
    const user = await me();
    // Theme: this browser's choice wins; otherwise use the logged-in user's account setting.
    if (user?.theme && !localStorage.getItem('wl_theme')) document.documentElement.dataset.theme = user.theme;
    if (!nav) return user;
    const here = location.pathname;
    const link = (href, label) => `<a href="${href}" class="${here === href ? 'active' : ''}">${label}</a>`;
    nav.innerHTML = `
      <a class="brand" href="/">🎄 <span>Wish Lists</span></a>
      <div class="nav-links">
        ${link('/', 'Home')}
        ${
          user
            ? `${link('/manage', 'My List')}${link('/planner', 'Gift Planner')}${link('/account', `${esc(user.avatar)} Account`)}
               <button type="button" class="linklike" data-logout>Log out</button>`
            : link('/login', 'Log in')
        }
      </div>`;
    nav.querySelector('[data-logout]')?.addEventListener('click', async () => {
      await api('POST', '/api/logout', {});
      location.href = '/';
    });
    return user;
  }

  // Resize an image file client-side before upload (phones take huge photos).
  function fileToDataUrl(file, maxSide = 1400) {
    return new Promise((resolve, reject) => {
      if (!file.type.startsWith('image/')) return reject(new Error('Please choose an image'));
      if (file.type === 'image/gif') {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error('Could not read that file'));
        return r.readAsDataURL(file);
      }
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('Could not read that image'));
      img.src = URL.createObjectURL(file);
    });
  }

  async function uploadPhoto(file) {
    const data = await fileToDataUrl(file);
    return (await api('POST', '/api/upload', { data })).image;
  }

  const debounce = (fn, ms = 200) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };

  window.WL = { api, esc, safeUrl, money, stars, toast, me, renderNav, uploadPhoto, debounce, PRIORITY };
})();
