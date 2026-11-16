(async () => {
  const { api, esc, money, safeUrl, toast, renderNav } = WL;
  const me = await renderNav();
  const itemsBox = document.getElementById('planner-items');
  const budgetInput = document.getElementById('budget');
  let state = { budget: null, spent: 0, items: [] };

  function renderBudget() {
    const { budget, spent } = state;
    const bar = document.getElementById('budget-bar');
    const label = document.getElementById('budget-label');
    if (budget) {
      const pct = Math.min(100, (spent / budget) * 100);
      bar.firstElementChild.style.width = `${pct}%`;
      bar.classList.toggle('over', spent > budget);
      label.textContent = `${money(spent)} of ${money(budget)}${spent > budget ? ` · ${money(spent - budget)} over!` : ` · ${money(budget - spent)} left`}`;
    } else {
      bar.firstElementChild.style.width = '0';
      label.textContent = `${money(spent || 0)} spent · no budget set`;
    }
  }

  function render() {
    renderBudget();
    const wrapped = state.items.filter((i) => i.wrapped).length;
    document.getElementById('wrap-count').textContent = state.items.length ? `${wrapped}/${state.items.length} wrapped` : '';
    if (!state.items.length) {
      itemsBox.innerHTML = '<div class="empty"><div class="big">🛷</div><p>You haven\'t claimed anything yet. Open a list and hit "I\'ll get this!"</p></div>';
      return;
    }
    itemsBox.innerHTML = state.items
      .map(
        (i) => `
      <div class="planner-item" data-id="${i.id}">
        ${i.image ? `<img src="${esc(safeUrl(i.image))}" alt="" loading="lazy">` : '<div class="ph">🎁</div>'}
        <div>
          <div><strong>${esc(i.title)}</strong>${i.quantity > 1 ? ` <span class="badge">×${i.quantity}</span>` : ''}</div>
          <div class="small muted">for ${esc(i.owner.avatar)} ${esc(i.owner.name)} ${i.price != null ? `· <span class="price" style="font-size:.95rem">${esc(money(i.price * i.quantity, i.currency))}</span>` : ''}
            ${i.store ? `· ${esc(i.store)}` : ''} ${safeUrl(i.url) ? `· <a href="${esc(safeUrl(i.url))}" target="_blank" rel="noopener noreferrer nofollow">View</a>` : ''}
            · <button class="linklike small" data-unclaim style="color:var(--cranberry);padding:0">Unclaim</button></div>
        </div>
        <label class="wrap-check"><input type="checkbox" data-wrapped ${i.wrapped ? 'checked' : ''}> Wrapped</label>
      </div>`
      )
      .join('');
  }

  async function load() {
    state = await api('GET', '/api/planner');
    budgetInput.value = state.budget ?? '';
    render();
  }

  itemsBox.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-wrapped]')) return;
    const id = Number(e.target.closest('[data-id]').dataset.id);
    const item = state.items.find((i) => i.id === id);
    item.wrapped = e.target.checked;
    render();
    try {
      await api('POST', `/api/items/${id}/wrapped`, { wrapped: item.wrapped });
    } catch (ex) {
      toast(ex.message, 'error');
    }
  });
  itemsBox.addEventListener('click', async (e) => {
    if (!e.target.matches('[data-unclaim]')) return;
    const id = Number(e.target.closest('[data-id]').dataset.id);
    if (!confirm('Unclaim this gift? Someone else will be able to claim it.')) return;
    try {
      await api('POST', `/api/items/${id}/unclaim`, {});
      await load();
    } catch (ex) {
      toast(ex.message, 'error');
    }
  });
  document.getElementById('budget-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await api('PUT', '/api/planner', { budget: budgetInput.value });
      state.budget = r.budget;
      renderBudget();
      toast('Budget saved', 'success');
    } catch (ex) {
      toast(ex.message, 'error');
    }
  });

  const { lists } = await api('GET', '/api/lists');
  document.getElementById('other-lists').innerHTML = lists
    .filter((l) => l.username !== me.username)
    .map((l) => `<a class="btn btn-light" href="/list/${encodeURIComponent(l.username)}">${esc(l.avatar)} ${esc(l.display_name)}'s list (${l.count})</a>`)
    .join('') || '<p class="muted">No other lists yet.</p>';
  load();
})();
