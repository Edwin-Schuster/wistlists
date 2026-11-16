(async () => {
  const { api, esc, money, renderNav } = WL;
  // Knitted stocking: hanging loop, fluffy cuff, body with heel/toe patches.
  const stockingSvg = (i) => `
    <svg viewBox="0 0 200 300" aria-hidden="true">
      <defs>
        <pattern id="knit${i}" width="14" height="12" patternUnits="userSpaceOnUse">
          <path d="M0 2 L7 9 L14 2" fill="none" stroke="rgba(255,255,255,.13)" stroke-width="2.4"/>
        </pattern>
        <filter id="fluff${i}"><feTurbulence baseFrequency=".09" numOctaves="2" seed="${i + 3}"/><feDisplacementMap in="SourceGraphic" scale="7"/></filter>
      </defs>
      <path d="M96 4 c-12 0 -12 22 0 22" fill="none" stroke="#c9a24a" stroke-width="4"/>
      <path d="M38 64 H162 V178 C162 196 172 208 186 214 C214 228 206 286 160 290 L92 292 C52 294 34 266 36 236 Z" fill="var(--sock)"/>
      <path d="M38 64 H162 V178 C162 196 172 208 186 214 C214 228 206 286 160 290 L92 292 C52 294 34 266 36 236 Z" fill="url(#knit${i})"/>
      <path d="M36 236 C34 266 52 294 92 292 L96 292 C70 284 62 258 74 236 Z" fill="var(--sock-2)" opacity=".9"/>
      <path d="M186 214 C214 228 206 286 160 290 C178 276 186 250 172 226 Z" fill="#fbf6ec" opacity=".9"/>
      <rect x="24" y="16" width="152" height="62" rx="18" fill="#fffdf8" filter="url(#fluff${i})"/>
    </svg>`;
  renderNav();
  const box = document.getElementById('stockings');
  try {
    const { lists } = await api('GET', '/api/lists');
    if (!lists.length) {
      box.innerHTML = '<div class="empty"><div class="big">🎄</div><p>No lists yet. Ask the site owner to create users.</p></div>';
      return;
    }
    box.innerHTML = lists
      .map(
        (l, i) => `
        <a class="stocking" href="/list/${encodeURIComponent(l.username)}" aria-label="${esc(l.display_name)}'s wish list, ${l.count} wishes">
          ${stockingSvg(i)}
          <span class="s-name">${esc(l.display_name)}</span>
          <span class="s-avatar" aria-hidden="true">${esc(l.avatar)}</span>
          <span class="s-tag">${l.count} wish${l.count === 1 ? '' : 'es'}</span>
          <span class="s-cta">${l.total ? `about ${esc(money(l.total))} · ` : ''}Peek inside →</span>
          ${l.claimed != null && l.count ? `<span class="mini-cane" data-claimed="${l.claimed}" data-total="${l.count}"></span>` : ''}
        </a>`
      )
      .join('');
    box.querySelectorAll('.mini-cane').forEach((m) => {
      const claimed = Number(m.dataset.claimed);
      const total = Number(m.dataset.total);
      WL.extras.candyCane(m, { claimed, total, name: '' });
      m.querySelector('.cane-msg')?.remove();
      m.insertAdjacentHTML('beforeend', `<span class="mini-cane-label">${Math.round((claimed / total) * 100)}% claimed</span>`);
    });
  } catch (e) {
    box.innerHTML = `<p class="error">${esc(e.message)}</p>`;
  }
})();
