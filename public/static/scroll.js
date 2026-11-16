// Printable "Santa's scroll" parchment view of one person's list.
(async () => {
  const { api, esc, money, stars, renderNav } = WL;
  const slug = decodeURIComponent(location.pathname.split('/')[2] || '');
  const $ = (id) => document.getElementById(id);
  await renderNav();

  let data;
  try {
    data = await api('GET', `/api/lists/${encodeURIComponent(slug)}`);
  } catch (e) {
    $('parchment').innerHTML = `<p style="text-align:center">${esc(e.message)}</p>`;
    return;
  }
  const { owner, isOwner } = data;
  document.title = `Santa's Scroll · ${owner.display_name}`;
  $('back-link').href = `/list/${encodeURIComponent(owner.username)}`;
  $('back-link').textContent = `← Back to ${owner.display_name}'s list`;
  $('unclaimed-wrap').classList.toggle('hidden', isOwner);

  const host = (u) => {
    try {
      return new URL(u).hostname.replace(/^www\./, '');
    } catch {
      return '';
    }
  };

  function render() {
    const onlyUnclaimed = !isOwner && $('only-unclaimed').checked;
    // Dream gifts first, then the owner's own order.
    const items = data.items
      .map((it, idx) => ({ ...it, idx }))
      .filter((i) => !(onlyUnclaimed && i.claimed))
      .sort((a, b) => b.priority - a.priority || a.idx - b.idx);
    const total = items.reduce((s, i) => s + (i.price || 0) * i.quantity, 0);
    const listUrl = `${location.origin}/list/${owner.username}`;
    $('parchment').innerHTML = `
      <h1>Santa's Scroll</h1>
      <div class="scroll-sub">${esc(owner.avatar)} The Christmas Wishes of ${esc(owner.display_name)} ${esc(owner.avatar)}</div>
      ${owner.intro ? `<p class="scroll-intro">“${esc(owner.intro)}”</p>` : ''}
      <div class="scroll-divider" aria-hidden="true">✦ ❄ ✦ ❄ ✦</div>
      ${
        items.length
          ? `<ol class="scroll-list">${items
              .map(
                (i) => `
            <li class="scroll-item ${!isOwner && i.claimed ? 'is-claimed' : ''}">
              <span class="scroll-box" aria-hidden="true"></span>
              <div>
                <div class="scroll-title">${esc(i.title)}</div>
                <div class="scroll-meta">${stars(i.priority)} ${esc(WL.PRIORITY[i.priority])}${i.store ? ` · ${esc(i.store)}` : ''}${i.quantity > 1 ? ` · wants ${i.quantity}` : ''}${!isOwner && i.claimed ? ' · <strong>claimed</strong>' : ''}</div>
                ${i.notes ? `<div class="scroll-note">${esc(i.notes)}</div>` : ''}
                ${host(i.url) ? `<div class="scroll-link">${esc(host(i.url))}</div>` : ''}
              </div>
              <div class="scroll-price">${i.price != null ? esc(money(i.price, i.currency)) : ''}</div>
            </li>`
              )
              .join('')}</ol>`
          : '<p style="text-align:center;font-style:italic">The scroll is blank… for now!</p>'
      }
      <div class="scroll-foot">
        <div>
          <div class="scroll-total">${items.length} wish${items.length === 1 ? '' : 'es'}${total ? ` · about ${esc(money(total))} in all` : ''}</div>
          <div class="scroll-sign">Signed, sealed &amp; sent to the North Pole</div>
        </div>
        <div class="wax-seal" aria-hidden="true">🎅</div>
      </div>
      <div class="scroll-url">Claim a gift so nobody doubles up: <strong>${esc(listUrl)}</strong></div>`;
  }

  $('only-unclaimed').addEventListener('change', render);
  $('print-btn').addEventListener('click', () => window.print());
  render();
})();
