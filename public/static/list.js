(async () => {
  const { api, esc, safeUrl, money, stars, toast, renderNav, debounce } = WL;
  const slug = decodeURIComponent(location.pathname.split('/')[2] || '');
  const SECRETS_KEY = 'wl_claims'; // { [itemId]: secret } for claims made in this browser
  const secrets = () => JSON.parse(localStorage.getItem(SECRETS_KEY) || '{}');
  const saveSecret = (id, s) => localStorage.setItem(SECRETS_KEY, JSON.stringify({ ...secrets(), [id]: s }));
  const dropSecret = (id) => {
    const all = secrets();
    delete all[id];
    localStorage.setItem(SECRETS_KEY, JSON.stringify(all));
  };

  const $ = (id) => document.getElementById(id);
  const grid = $('grid');
  const f = { q: $('f-q'), min: $('f-min'), max: $('f-max'), store: $('f-store'), priority: $('f-priority'), sort: $('f-sort'), unclaimed: $('f-unclaimed') };
  let data = { owner: null, isOwner: false, items: [] };

  await renderNav();

  async function load() {
    try {
      data = await api('GET', `/api/lists/${encodeURIComponent(slug)}`);
    } catch (e) {
      grid.innerHTML = `<div class="empty"><div class="big">🧐</div><p>${esc(e.message)}</p><p><a href="/">See all lists</a></p></div>`;
      return;
    }
    const { owner, isOwner, items } = data;
    document.title = `${owner.display_name}'s Christmas Wish List`;
    $('owner-avatar').textContent = owner.avatar;
    $('list-title').textContent = `${owner.display_name}'s Wish List`;
    $('list-intro').textContent = owner.intro || '';
    $('owner-notice').classList.toggle('hidden', !isOwner);
    $('f-unclaimed-wrap').classList.toggle('hidden', isOwner);
    $('elf-mode').classList.toggle('hidden', isOwner || !items.length);
    $('scroll-link').href = `/scroll/${encodeURIComponent(owner.username)}`;

    const stores = [...new Set(items.map((i) => i.store).filter(Boolean))].sort();
    const cur = f.store.value;
    f.store.innerHTML = '<option value="">All stores</option>' + stores.map((s) => `<option>${esc(s)}</option>`).join('');
    f.store.value = stores.includes(cur) ? cur : '';
    renderStats();
    render();
  }

  function renderExtras({ animateNew = false } = {}) {
    const { items, isOwner, owner } = data;
    const claimed = isOwner ? 0 : items.filter((i) => i.claimed).length;
    WL.extras.renderTree($('hero-tree'), claimed, items.length, { animateNew });
    if (isOwner) $('hero-tree').title = 'Ornaments appear as gifts get claimed. No peeking at yours! 🙈';
    if (isOwner) $('cane').innerHTML = '';
    else WL.extras.candyCane($('cane'), { claimed, total: items.length, name: owner.display_name });
  }

  function renderStats() {
    renderExtras();
    const { items, isOwner } = data;
    const total = items.reduce((s, i) => s + (i.price || 0) * i.quantity, 0);
    const claimed = items.filter((i) => i.claimed).length;
    $('list-stats').innerHTML = [
      `<span class="chip">🎁 ${items.length} wish${items.length === 1 ? '' : 'es'}</span>`,
      total ? `<span class="chip">💰 about ${esc(money(total))} total</span>` : '',
      !isOwner && items.length ? `<span class="chip">✅ ${claimed} claimed</span>` : '',
    ].join('');
  }

  const isStuffer = (i) => i.price != null && i.price < 25;

  function filtered() {
    const q = f.q.value.trim().toLowerCase();
    const min = f.min.value === '' ? null : Number(f.min.value);
    const max = f.max.value === '' ? null : Number(f.max.value);
    const pr = Number(f.priority.value) || 0;
    let list = data.items.filter((i) => {
      if (q && !`${i.title} ${i.store} ${i.notes}`.toLowerCase().includes(q)) return false;
      if (min != null && (i.price == null || i.price < min)) return false;
      if (max != null && (i.price == null || i.price > max)) return false;
      if (f.store.value && i.store !== f.store.value) return false;
      if (pr && i.priority < pr) return false;
      if (f.unclaimed.checked && i.claimed) return false;
      return true;
    });
    const priceOr = (i, d) => (i.price == null ? d : i.price);
    const sorters = {
      featured: () => 0,
      priority: (a, b) => b.priority - a.priority,
      'price-asc': (a, b) => priceOr(a, Infinity) - priceOr(b, Infinity),
      'price-desc': (a, b) => priceOr(b, -1) - priceOr(a, -1),
      newest: (a, b) => b.id - a.id,
    };
    list = [...list].sort(sorters[f.sort.value] || sorters.featured);
    return list;
  }

  const RIBBONS = ['', 'rib-gold', 'rib-green'];
  const tilt = (id) => ((((id * 7919) % 7) + 7) % 7 - 3) * 0.6;
  let justClaimed = null;

  function cardHtml(i) {
    const url = safeUrl(i.url);
    const img = safeUrl(i.image);
    const mine = i.claimed && (i.claimed_by_me || secrets()[i.id]);
    let claimArea = '';
    if (!data.isOwner) {
      if (i.claimed) {
        claimArea = `<div class="claimed-tag"><span>🎅 ${mine ? 'You\'re getting this!' : `Claimed${i.claimed_by ? ` by ${esc(i.claimed_by)}` : ''}`}</span>
          ${mine ? `<button class="btn btn-light btn-sm" data-unclaim>Undo</button>` : ''}</div>`;
      } else {
        claimArea = `<button class="btn btn-red" data-claim>🎁 I'll get this!</button>`;
      }
    }
    return `
      <article class="card ${RIBBONS[i.id % 3]} ${i.claimed && !data.isOwner ? 'claimed' : ''}" data-id="${i.id}" style="--tilt:${tilt(i.id)}deg">
        <div class="ribbon-corner" aria-hidden="true"></div><div class="bow" aria-hidden="true"><i></i></div>
        <div class="photo">${img ? `<img src="${esc(img)}" alt="${esc(i.title)}" loading="lazy" referrerpolicy="no-referrer">` : '<span class="placeholder">🎁</span>'}
          ${i.claimed && !data.isOwner ? `<div class="stamp" aria-hidden="true">🎅 Someone's on it!</div>` : ''}</div>
        <div class="body">
          <h3>${esc(i.title)}</h3>
          <div class="meta">
            <span>${i.price != null ? `<span class="price">${esc(money(i.price, i.currency))}</span>` : '<span class="muted small">No price</span>'}${
              i.price_drop ? `<span class="old-price">${esc(money(i.previous_price, i.currency))}</span>` : ''
            }</span>
            ${stars(i.priority)}
          </div>
          <div class="meta">
            <span class="store">${esc(i.store)}</span>
            <span>${i.price_drop ? '<span class="badge badge-drop">🔻 Price drop</span> ' : ''}${i.quantity > 1 ? `<span class="badge">Wants ${i.quantity}</span>` : ''}</span>
          </div>
          ${i.notes ? `<div class="notes">${esc(i.notes)}</div>` : ''}
          <div class="actions">
            ${url ? `<a class="btn btn-light btn-sm" href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow">View item ↗</a>` : ''}
          </div>
          ${claimArea}
        </div>
      </article>`;
  }

  function render() {
    const list = filtered();
    const filtersActive = f.q.value || f.min.value || f.max.value || f.store.value || f.priority.value || f.unclaimed.checked;
    const stuffers = data.items.filter(isStuffer);
    $('stuffers-section').classList.toggle('hidden', !stuffers.length || Boolean(filtersActive));
    $('stuffers').innerHTML = stuffers.map(cardHtml).join('');
    $('result-count').textContent = filtersActive ? `${list.length} of ${data.items.length} shown` : '';
    if (!data.items.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="big">🎄</div><p>${
        data.isOwner ? 'Your list is empty. <a href="/manage">Add your first wish →</a>' : 'Nothing here yet. Check back soon!'
      }</p></div>`;
      return;
    }
    grid.innerHTML = list.length
      ? list.map(cardHtml).join('')
      : '<div class="empty" style="grid-column:1/-1"><div class="big">🔍</div><p>No wishes match those filters.</p></div>';
    if (justClaimed != null) {
      document.querySelectorAll(`.card[data-id="${justClaimed}"]`).forEach((c) => WL.fx.stamp(c));
      justClaimed = null;
    }
  }

  // ----- claiming -----
  const dlg = $('claim-dialog');
  let claimTarget = null;
  let claimOrigin = null;
  document.addEventListener('click', async (e) => {
    const card = e.target.closest('[data-id]');
    if (!card) return;
    const id = Number(card.dataset.id);
    const item = data.items.find((i) => i.id === id);
    if (e.target.closest('[data-claim]')) {
      claimTarget = item;
      const r = e.target.closest('[data-claim]').getBoundingClientRect();
      claimOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      $('claim-item-title').textContent = item.title;
      $('claim-name').value = localStorage.getItem('wl_name') || '';
      dlg.showModal();
    } else if (e.target.closest('[data-unclaim]')) {
      try {
        await api('POST', `/api/items/${id}/unclaim`, { secret: secrets()[id] || '' });
        dropSecret(id);
        Object.assign(item, { claimed: false, claimed_by: '', claimed_by_me: false });
        renderStats();
        render();
        toast('Unclaimed. It\'s up for grabs again.');
      } catch (ex) {
        toast(ex.message, 'error');
      }
    }
  });
  dlg.addEventListener('close', async () => {
    if (dlg.returnValue !== 'ok' || !claimTarget) return;
    const item = claimTarget;
    claimTarget = null;
    const name = $('claim-name').value.trim();
    if (name) localStorage.setItem('wl_name', name);
    try {
      const r = await api('POST', `/api/items/${item.id}/claim`, { name });
      saveSecret(item.id, r.secret);
      Object.assign(item, { claimed: true, claimed_by: r.claimed_by, claimed_by_me: true });
      const card = document.querySelector(`#grid .card[data-id="${item.id}"]`);
      const box = card?.getBoundingClientRect();
      const o = box && box.bottom > 0 && box.top < innerHeight ? { x: box.left + box.width / 2, y: box.top + box.height * 0.45 } : claimOrigin;
      if (o) WL.fx.confetti(o.x, o.y);
      WL.fx.sound.play('jingle');
      justClaimed = item.id;
      renderStats();
      renderExtras({ animateNew: true });
      render();
      toast("🎅 Someone's on it! Thanks for claiming.", 'success');
    } catch (ex) {
      toast(ex.message, 'error');
      if (ex.status === 409) load();
    }
  });

  // ----- elf mode -----
  $('elf-mode').addEventListener('click', () =>
    WL.extras.elfWheel({
      items: data.items,
      onClaim: (item) => {
        claimTarget = item;
        claimOrigin = { x: innerWidth / 2, y: innerHeight / 2 };
        $('claim-item-title').textContent = item.title;
        $('claim-name').value = localStorage.getItem('wl_name') || '';
        dlg.showModal();
      },
    })
  );

  // ----- filters -----
  const rerender = debounce(render, 120);
  Object.values(f).forEach((el) => el.addEventListener('input', rerender));

  // ----- share -----
  const shareUrl = location.origin + location.pathname;
  $('copy-link').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast('Link copied! 📋', 'success');
    } catch {
      prompt('Copy this link:', shareUrl);
    }
  });
  if (navigator.share) {
    $('share-link').classList.remove('hidden');
    $('share-link').addEventListener('click', () =>
      navigator.share({ title: document.title, text: 'Here\'s my Christmas wish list 🎄', url: shareUrl }).catch(() => {})
    );
  }

  load();
})();
