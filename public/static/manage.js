(async () => {
  const { api, esc, safeUrl, money, stars, toast, renderNav, uploadPhoto, PRIORITY } = WL;
  const $ = (id) => document.getElementById(id);
  const me = await renderNav();
  const cfg = await api('GET', '/api/config');
  let items = [];

  $('view-public').href = `/list/${encodeURIComponent(me.username)}`;

  // ---------- tabs ----------
  const tabs = document.querySelectorAll('[data-tab]');
  function showTab(name) {
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tab === name)));
    document.querySelectorAll('[data-pane]').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== name));
    closeEditor();
    if (name === 'manual') openEditor({}, { warning: '' });
    if (name === 'search') $('search-q').focus();
    if (name === 'link') $('magic-url').focus();
    if (name === 'import') $('import-url').focus();
  }
  tabs.forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

  // ---------- item editor (shared by magic add, search, manual add and inline edit) ----------
  function buildEditor(values = {}, { warning = '', saveLabel = '🎁 Add to my list', onSave, onCancel } = {}) {
    const form = $('editor-tpl').content.firstElementChild.cloneNode(true);
    const set = (name, v) => {
      if (v != null && form.elements[name]) form.elements[name].value = v;
    };
    set('title', values.title);
    set('price', values.price);
    set('currency', values.currency || cfg.currency);
    set('store', values.store);
    set('url', values.url);
    set('image', values.image);
    set('priority', values.priority || 2);
    set('quantity', values.quantity || 1);
    set('notes', values.notes);
    form.querySelector('[data-save]').textContent = saveLabel;
    const warn = form.querySelector('[data-warning]');
    if (warning) {
      warn.textContent = `⚠️ ${warning}`;
      warn.classList.remove('hidden');
    }

    const box = form.querySelector('[data-photo-box]');
    const showPhoto = () => {
      const src = safeUrl(form.elements.image.value);
      box.innerHTML = src
        ? `<img src="${esc(src)}" alt="Item photo" referrerpolicy="no-referrer">`
        : '<span class="placeholder" style="font-size:3rem">🎁</span>';
      const img = box.querySelector('img');
      if (img) img.onerror = () => (box.innerHTML = '<span class="placeholder small muted">Photo not loading</span>');
    };
    showPhoto();
    form.elements.image.addEventListener('change', showPhoto);
    form.querySelector('[data-photo-file]').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      box.innerHTML = '<span class="spinner" style="border-top-color:var(--evergreen)"></span>';
      try {
        form.elements.image.value = await uploadPhoto(file);
        toast('Photo uploaded 📷', 'success');
      } catch (ex) {
        toast(ex.message, 'error');
      }
      showPhoto();
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[data-save]');
      const label = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Saving…';
      const body = Object.fromEntries(['title', 'price', 'currency', 'store', 'url', 'image', 'priority', 'quantity', 'notes'].map((k) => [k, form.elements[k].value]));
      try {
        await onSave(body);
      } catch (ex) {
        toast(ex.message, 'error');
        btn.disabled = false;
        btn.innerHTML = label;
      }
    });
    form.querySelector('[data-cancel]').addEventListener('click', () => onCancel?.());
    return form;
  }

  const slot = $('editor-slot');
  function closeEditor() {
    slot.innerHTML = '';
  }
  function openEditor(values, { warning } = {}) {
    closeEditor();
    const form = buildEditor(values, {
      warning,
      onSave: async (body) => {
        const { item } = await api('POST', '/api/items', body);
        items.unshift(item);
        closeEditor();
        renderItems();
        $('magic-url').value = '';
        WL.fx.giftDrop(document.querySelector(`[data-item="${item.id}"]`));
        toast(`🎁 "${item.title}" added to your list!`, 'success');
      },
      onCancel: closeEditor,
    });
    slot.append(form);
    form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    return form;
  }

  // ---------- magic add ----------
  async function magicFetch(url) {
    const btn = $('magic-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Fetching…';
    closeEditor();
    try {
      const data = await api('POST', '/api/scrape', { url });
      openEditor({ ...data, currency: data.currency || cfg.currency }, { warning: data.warning });
    } catch (ex) {
      toast(ex.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '✨ Fetch';
    }
  }
  $('magic-form').addEventListener('submit', (e) => {
    e.preventDefault();
    magicFetch($('magic-url').value.trim());
  });
  // Paste straight into the box = fetch immediately.
  $('magic-url').addEventListener('paste', () =>
    setTimeout(() => {
      const v = $('magic-url').value.trim();
      if (/^https?:\/\/\S+\.\S+/.test(v)) magicFetch(v);
    }, 0)
  );

  // ---------- search ----------
  let lastResults = [];
  $('search-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('search-q').value.trim();
    const out = $('search-results');
    out.innerHTML = cfg.searchEnabled ? '<p class="muted">Searching the North Pole catalogue…</p>' : '';
    try {
      const r = await api('GET', `/api/search?q=${encodeURIComponent(q)}`);
      $('search-nokey').classList.toggle('hidden', Boolean(r.provider));
      $('store-links').innerHTML =
        `<span class="small muted" style="align-self:center">${r.provider ? 'Or search:' : 'Search on:'}</span>` +
        r.storeLinks.map((s) => `<a class="btn btn-light btn-sm" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.name)} ↗</a>`).join('');
      lastResults = r.results;
      out.innerHTML = r.results.length
        ? r.results
            .map(
              (x, idx) => `
          <div class="result">
            ${safeUrl(x.image) ? `<img src="${esc(safeUrl(x.image))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
            <div class="r-body">
              <div class="r-title">${esc(x.title)}</div>
              <div><span class="price" style="font-size:1rem">${x.price != null ? esc(money(x.price, cfg.currency)) : esc(x.priceText)}</span> <span class="store">${esc(x.store)}</span></div>
              ${safeUrl(x.url) ? `<a class="small" href="${esc(safeUrl(x.url))}" target="_blank" rel="noopener noreferrer nofollow">View ↗</a>` : ''}
              <button class="btn btn-red btn-sm" data-add-result="${idx}">+ Add</button>
            </div>
          </div>`
            )
            .join('')
        : r.provider
          ? '<p class="muted">No results. Try different words.</p>'
          : '';
    } catch (ex) {
      out.innerHTML = '';
      toast(ex.message, 'error');
    }
  });
  $('search-results').addEventListener('click', (e) => {
    const b = e.target.closest('[data-add-result]');
    if (!b) return;
    const x = lastResults[Number(b.dataset.addResult)];
    openEditor({ title: x.title, price: x.price, store: x.store, image: x.image, url: x.url, currency: cfg.currency });
  });

  // ---------- my items ----------
  function rowHtml(i) {
    const img = safeUrl(i.image);
    const active = i.status === 'active';
    const statusBadge = i.status === 'got_it' ? '<span class="badge">✅ Already got it</span>' : i.status === 'archived' ? '<span class="badge">📦 Archived</span>' : '';
    return `
      <div class="my-item" data-item="${i.id}">
        ${active ? '<span class="handle" title="Drag to reorder" aria-label="Drag to reorder">☰</span>' : '<span></span>'}
        ${img ? `<img class="thumb" src="${esc(img)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : '<div class="thumb placeholder">🎁</div>'}
        <div class="info">
          <div class="title">${esc(i.title)}</div>
          <div class="sub">
            ${i.price != null ? `<span class="price" style="font-size:1rem">${esc(money(i.price, i.currency))}</span>` : '<span class="muted">No price</span>'}
            ${i.price_drop ? `<span class="old-price">${esc(money(i.previous_price, i.currency))}</span><span class="badge badge-drop">🔻 Price drop</span>` : ''}
            ${stars(i.priority)} <span class="muted small">${PRIORITY[i.priority]}</span>
            ${i.quantity > 1 ? `<span class="badge">×${i.quantity}</span>` : ''}
            ${i.store ? `<span class="store">${esc(i.store)}</span>` : ''}
            ${statusBadge}
          </div>
          ${i.notes ? `<div class="notes" style="margin-top:6px">${esc(i.notes)}</div>` : ''}
          <div class="item-actions">
            <button class="btn btn-light btn-sm" data-act="edit">✏️ Edit</button>
            ${active && i.url ? '<button class="btn btn-light btn-sm" data-act="refresh">🔄 Price</button>' : ''}
            ${safeUrl(i.url) ? `<a class="btn btn-light btn-sm" href="${esc(safeUrl(i.url))}" target="_blank" rel="noopener noreferrer nofollow">↗ Open</a>` : ''}
            ${active ? '<button class="btn btn-light btn-sm" data-act="got_it">✅ Got it</button><button class="btn btn-light btn-sm" data-act="archive">📦 Archive</button>' : '<button class="btn btn-light btn-sm" data-act="restore">↩️ Restore</button>'}
            <button class="btn btn-light btn-sm" data-act="delete" style="color:var(--cranberry)">🗑 Delete</button>
          </div>
        </div>
      </div>`;
  }

  function renderItems() {
    const active = items.filter((i) => i.status === 'active');
    const other = items.filter((i) => i.status !== 'active');
    $('my-count').textContent = `(${active.length})`;
    $('my-items').innerHTML = active.length
      ? active.map(rowHtml).join('')
      : '<div class="empty"><div class="big">🎄</div><p>Your list is empty. Paste a link above to add your first wish!</p></div>';
    $('archived-items').innerHTML = other.length ? other.map(rowHtml).join('') : '<p class="muted small">Nothing archived.</p>';
    $('archived-count').textContent = other.length ? `(${other.length})` : '';
  }

  async function loadItems() {
    items = (await api('GET', '/api/my/items')).items;
    renderItems();
  }

  const replaceItem = (item) => {
    const idx = items.findIndex((x) => x.id === item.id);
    if (idx >= 0) items[idx] = item;
  };

  document.querySelector('main').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const row = btn.closest('[data-item]');
    const id = Number(row.dataset.item);
    const item = items.find((x) => x.id === id);
    const act = btn.dataset.act;
    try {
      if (act === 'edit') {
        if (row.querySelector('[data-editor]')) return row.querySelector('[data-editor]').remove();
        const form = buildEditor(item, {
          saveLabel: '💾 Save changes',
          onSave: async (body) => {
            const r = await api('PUT', `/api/items/${id}`, body);
            replaceItem(r.item);
            renderItems();
            toast('Saved ✓', 'success');
          },
          onCancel: () => form.remove(),
        });
        row.append(form);
      } else if (act === 'refresh') {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner"></span>';
        const r = await api('POST', `/api/items/${id}/refresh`, {});
        replaceItem(r.item);
        renderItems();
        if (r.dropped) toast(`🔻 Price dropped to ${money(r.item.price, r.item.currency)}!`, 'success');
        else if (r.ok) toast(`Price checked: ${money(r.item.price, r.item.currency)}`);
        else toast(r.warning, 'error');
      } else if (act === 'got_it' || act === 'archive' || act === 'restore') {
        const status = { got_it: 'got_it', archive: 'archived', restore: 'active' }[act];
        const r = await api('PUT', `/api/items/${id}`, { status });
        replaceItem(r.item);
        renderItems();
        toast(act === 'restore' ? 'Back on your list' : act === 'got_it' ? '✅ Marked as already got. Hidden from your public list.' : '📦 Archived');
      } else if (act === 'delete') {
        if (!confirm(`Delete "${item.title}"?`)) return;
        await api('DELETE', `/api/items/${id}`);
        items = items.filter((x) => x.id !== id);
        WL.fx.crumple(row, renderItems);
        toast('Deleted');
      }
    } catch (ex) {
      toast(ex.message, 'error');
      renderItems();
    }
  });

  // ---------- refresh all prices ----------
  $('refresh-all').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Checking prices…';
    try {
      const r = await api('POST', '/api/my/refresh-all', {});
      await loadItems();
      const parts = [`Checked ${r.checked} item${r.checked === 1 ? '' : 's'}`];
      if (r.dropped) parts.push(`🔻 ${r.dropped} price drop${r.dropped === 1 ? '' : 's'}!`);
      if (r.failed.length) parts.push(`${r.failed.length} couldn't be read`);
      toast(parts.join(' · '), r.dropped ? 'success' : 'info', 6000);
    } catch (ex) {
      toast(ex.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '🔄 Refresh prices';
    }
  });

  // ---------- drag to reorder (pointer events: works with mouse and touch) ----------
  const listEl = $('my-items');
  listEl.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.handle');
    if (!handle) return;
    e.preventDefault();
    const row = handle.closest('.my-item');
    const startY = e.clientY;
    const rect = row.getBoundingClientRect();
    const ph = document.createElement('div');
    ph.className = 'drop-ph';
    ph.style.height = `${rect.height}px`;
    row.after(ph);
    Object.assign(row.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, pointerEvents: 'none' });
    row.classList.add('dragging');
    document.body.style.userSelect = 'none';

    const move = (ev) => {
      row.style.top = `${rect.top + ev.clientY - startY}px`;
      const siblings = [...listEl.querySelectorAll('.my-item:not(.dragging)')];
      const after = siblings.find((s) => {
        const r = s.getBoundingClientRect();
        return ev.clientY < r.top + r.height / 2;
      });
      if (after) listEl.insertBefore(ph, after);
      else listEl.append(ph);
      // auto-scroll near edges
      if (ev.clientY < 80) window.scrollBy(0, -12);
      else if (ev.clientY > innerHeight - 80) window.scrollBy(0, 12);
    };
    const up = async () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      row.removeAttribute('style');
      document.body.style.userSelect = '';
      row.classList.remove('dragging');
      ph.replaceWith(row);
      const ids = [...listEl.querySelectorAll('.my-item')].map((r) => Number(r.dataset.item));
      const active = ids.map((id) => items.find((x) => x.id === id));
      items = [...active, ...items.filter((x) => x.status !== 'active')];
      try {
        await api('PUT', '/api/my/order', { ids });
      } catch (ex) {
        toast(ex.message, 'error');
      }
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
  });

  // ---------- bookmarklet ----------
  const code = `javascript:(()=>{window.open('${location.origin}/add?url='+encodeURIComponent(location.href),'_blank')})()`;
  $('bookmarklet').href = code;
  $('bookmarklet').removeAttribute('onclick');
  $('bookmarklet').addEventListener('click', (e) => {
    e.preventDefault();
    toast('Drag me to your bookmarks bar!');
  });
  $('bookmarklet-code').value = code;

  // ---------- import an Amazon wish list ----------
  let imported = [];
  const importOut = $('import-out');

  function renderImport(r) {
    imported = r.items;
    const fresh = imported.filter((x) => !x.already).length;
    if (!imported.length) {
      importOut.innerHTML = `<p class="muted">"${esc(r.listName)}" has no items yet.</p>`;
      return;
    }
    importOut.innerHTML = `
      <div class="section-head" style="margin-top:14px;flex-wrap:wrap;gap:8px">
        <div><strong>${esc(r.listName)}</strong> <span class="muted small">${imported.length} item${imported.length === 1 ? '' : 's'}${
          fresh < imported.length ? `, ${imported.length - fresh} already on your list` : ''
        }</span></div>
        <label class="small"><input type="checkbox" id="import-all" ${fresh ? 'checked' : ''}> Select all new</label>
      </div>
      <div class="results" id="import-results">
        ${imported
          .map(
            (x, idx) => `
          <label class="result" style="cursor:pointer;${x.already ? 'opacity:.55' : ''}">
            ${safeUrl(x.image) ? `<img src="${esc(safeUrl(x.image))}" alt="" loading="lazy" referrerpolicy="no-referrer">` : ''}
            <div class="r-body">
              <div class="r-title">${esc(x.title)}</div>
              <div><span class="price" style="font-size:1rem">${x.price != null ? esc(money(x.price, x.currency || cfg.currency)) : '<span class="muted small">No price</span>'}</span>
                ${x.quantity > 1 ? `<span class="small muted">× ${x.quantity}</span>` : ''}</div>
              ${x.notes ? `<div class="small muted">“${esc(x.notes)}”</div>` : ''}
              <div class="small" style="margin-top:auto">
                <input type="checkbox" data-import-idx="${idx}" ${x.already ? '' : 'checked'}> ${x.already ? 'Already on your list' : 'Import'}
              </div>
            </div>
          </label>`
          )
          .join('')}
      </div>
      <p style="margin-top:14px"><button class="btn btn-red" id="import-go" type="button"></button> <span class="small muted" id="import-progress"></span></p>`;
    updateImportButton();
  }

  const checkedImports = () => [...importOut.querySelectorAll('[data-import-idx]:checked')].map((c) => imported[Number(c.dataset.importIdx)]);
  function updateImportButton() {
    const n = checkedImports().length;
    const b = $('import-go');
    if (!b) return;
    b.textContent = `🎁 Add ${n} item${n === 1 ? '' : 's'} to my list`;
    b.disabled = n === 0;
  }

  importOut.addEventListener('change', (e) => {
    if (e.target.id === 'import-all') {
      importOut.querySelectorAll('[data-import-idx]').forEach((c) => {
        if (!imported[Number(c.dataset.importIdx)].already) c.checked = e.target.checked;
      });
    }
    updateImportButton();
  });

  $('import-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('import-btn');
    btn.disabled = true;
    importOut.innerHTML = '<p class="muted">Reading your Amazon list… long lists can take up to a minute.</p>';
    try {
      renderImport(await api('POST', '/api/import/amazon/preview', { url: $('import-url').value.trim() }));
    } catch (ex) {
      importOut.innerHTML = `<p class="small" style="color:var(--cranberry)">⚠️ ${esc(ex.message)}</p>`;
    } finally {
      btn.disabled = false;
    }
  });

  importOut.addEventListener('click', async (e) => {
    if (e.target.id !== 'import-go') return;
    const picked = checkedImports().map(({ already, ...it }) => it);
    if (!picked.length) return;
    const go = e.target;
    go.disabled = true;
    const progress = $('import-progress');
    // Send the last batch first: each batch lands on top, so the list ends up in Amazon's order.
    const batches = [];
    for (let i = 0; i < picked.length; i += 10) batches.push(picked.slice(i, i + 10));
    let added = 0;
    let skipped = 0;
    let done = 0;
    try {
      for (const batch of batches.reverse()) {
        progress.textContent = `Adding… ${done} of ${picked.length}`;
        const r = await api('POST', '/api/import/items', { items: batch });
        added += r.added;
        skipped += r.skipped;
        done += batch.length;
      }
      progress.textContent = '';
      toast(`🎁 Added ${added} item${added === 1 ? '' : 's'}${skipped ? ` (${skipped} skipped, already on your list)` : ''}`);
      importOut.innerHTML = '';
      $('import-url').value = '';
      await loadItems();
    } catch (ex) {
      progress.textContent = '';
      toast(`${ex.message}${added ? ` (${added} added before the error)` : ''}`, 'error');
      if (added) await loadItems();
      go.disabled = false;
    }
  });

  await loadItems();

  // Arrived from the bookmarklet: /manage?add=<url>
  const addUrl = new URLSearchParams(location.search).get('add');
  if (addUrl) {
    history.replaceState(null, '', '/manage');
    $('magic-url').value = addUrl;
    magicFetch(addUrl);
  }
})();
