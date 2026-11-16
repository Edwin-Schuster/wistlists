// Stage 3 fun extras: ornament tree, candy-cane progress bar, elf-mode spinning wheel.
(() => {
  const { esc } = WL;
  const RM = WL.fx?.RM ?? window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const play = (n) => WL.fx?.sound.play(n);

  // =====================================================================
  // Christmas tree: one ornament per claimed gift
  // =====================================================================
  // Ornament slots inside the tree, ordered so they spread out as the tree fills up.
  const SLOTS = (() => {
    const rows = [
      [44, [0]], [58, [-9, 9]], [72, [-15, 0, 15]], [86, [-20, -6, 8, 21]],
      [100, [-26, -12, 2, 15, 27]], [114, [-31, -18, -5, 8, 20, 32]], [127, [-36, -23, -10, 3, 16, 28, 38]],
    ];
    const all = [];
    rows.forEach(([y, xs], r) => xs.forEach((x, i) => all.push({ x: 60 + x, y: y + ((i % 2) * 3 - 1), k: (i * 7 + r * 3) % 11 })));
    return all.sort((a, b) => a.k - b.k || a.y - b.y);
  })();
  const ORN = ['#d42a35', '#e8bd45', '#3aa0ff', '#f0f0f0', '#c13dd1', '#ff8a1f'];

  function treeSvg(claimed, total, { newIndex = -1 } = {}) {
    const shown = Math.min(claimed, SLOTS.length);
    const done = total > 0 && claimed >= total;
    let ornaments = '';
    for (let i = 0; i < shown; i++) {
      const s = SLOTS[i];
      const c = ORN[i % ORN.length];
      ornaments += `<g class="orn${i === newIndex ? ' orn-new' : ''}" style="transform-origin:${s.x}px ${s.y - 6}px">
        <line x1="${s.x}" y1="${s.y - 7}" x2="${s.x}" y2="${s.y - 4}" stroke="#c9b26a" stroke-width=".8"/>
        <rect x="${s.x - 1.4}" y="${s.y - 5.6}" width="2.8" height="1.8" rx=".5" fill="#c9c2b0"/>
        <circle cx="${s.x}" cy="${s.y}" r="4.3" fill="${c}"/>
        <circle cx="${s.x - 1.4}" cy="${s.y - 1.5}" r="1.3" fill="#fff" opacity=".6"/>
      </g>`;
    }
    return `
    <svg viewBox="0 0 120 170" class="xtree${done ? ' complete' : ''}" role="img" aria-label="Christmas tree with ${claimed} ornament${claimed === 1 ? '' : 's'}: ${claimed} of ${total} gifts claimed">
      <defs>
        <linearGradient id="treeG" x1="0" x2="1"><stop offset="0" stop-color="#1f7a55"/><stop offset=".55" stop-color="#175a44"/><stop offset="1" stop-color="#0f3d2e"/></linearGradient>
        <radialGradient id="starGlow"><stop offset="0" stop-color="#fff3b0" stop-opacity=".9"/><stop offset="1" stop-color="#ffd86b" stop-opacity="0"/></radialGradient>
      </defs>
      <rect x="53" y="134" width="14" height="18" rx="2" fill="#6b4123"/>
      <path d="M34 150 h52 l-6 14 h-40 z" fill="#b3202a"/><path d="M34 150 h52 v4 h-52z" fill="#d4a017"/>
      <polygon points="60,22 86,64 34,64" fill="url(#treeG)"/>
      <polygon points="60,40 96,98 24,98" fill="url(#treeG)"/>
      <polygon points="60,70 106,138 14,138" fill="url(#treeG)"/>
      <g fill="#f6f8fb" opacity=".9">
        <path d="M34 64 q8 -5 13 0 q6 -5 13 0 q7 -5 13 0 q6 -5 13 0 l0 2 h-52z"/>
        <path d="M24 98 q9 -5 15 0 q7 -5 14 0 q7 -5 14 0 q7 -5 14 0 q7 -5 15 0 l0 2 h-72z"/>
        <path d="M14 138 q9 -5 15 0 q8 -5 15 0 q8 -5 16 0 q8 -5 15 0 q8 -5 15 0 q7 -5 12 0 l0 2 h-88z"/>
      </g>
      <path d="M40 58 Q60 70 80 56 M33 90 Q60 106 88 88 M24 128 Q60 146 98 126" fill="none" stroke="#e8bd45" stroke-width="1.3" stroke-dasharray="1 3" stroke-linecap="round"/>
      ${ornaments}
      <circle class="star-glow" cx="60" cy="18" r="16" fill="url(#starGlow)"/>
      <path class="tree-star" d="M60 6 l3.5 7.5 8 .9 -6 5.5 1.7 8 -7.2 -4.1 -7.2 4.1 1.7 -8 -6 -5.5 8 -.9z"/>
    </svg>
    ${claimed > SLOTS.length ? `<span class="xtree-more">+${claimed - SLOTS.length}</span>` : ''}`;
  }

  function renderTree(box, claimed, total, { animateNew = false } = {}) {
    if (!box) return;
    box.innerHTML = treeSvg(claimed, total, { newIndex: animateNew && !RM ? Math.min(claimed, SLOTS.length) - 1 : -1 });
    box.title = total ? `${claimed} of ${total} gifts claimed. One ornament per claimed gift!` : '';
  }

  // =====================================================================
  // Candy-cane progress bar
  // =====================================================================
  function candyCane(box, { claimed, total, name }) {
    if (!box) return;
    if (!total) {
      box.innerHTML = '';
      return;
    }
    const pct = Math.round((claimed / total) * 100);
    const msg =
      pct === 100
        ? `🎉 Every one of ${esc(name)}'s wishes is claimed!`
        : pct === 0
          ? `Be the first elf to claim one of ${esc(name)}'s gifts!`
          : `${esc(name)}'s list is <strong>${pct}%</strong> claimed!`;
    box.innerHTML = `
      <div class="cane" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}" aria-label="${pct}% of ${esc(name)}'s list claimed">
        <svg class="cane-hook" viewBox="0 0 34 40" aria-hidden="true">
          <path d="M28 38 V16 A10 10 0 0 0 8 16 V20" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round"/>
          <path d="M28 38 V16 A10 10 0 0 0 8 16 V20" fill="none" stroke="#c4202b" stroke-width="9" stroke-dasharray="5 5" stroke-linecap="butt"/>
        </svg>
        <div class="cane-track"><div class="cane-fill" style="width:${pct}%"></div></div>
      </div>
      <p class="cane-msg">${msg} <span class="muted small">(${claimed} of ${total})</span></p>`;
    if (!RM) {
      const fill = box.querySelector('.cane-fill');
      fill.style.width = '0%';
      requestAnimationFrame(() => requestAnimationFrame(() => (fill.style.width = `${pct}%`)));
    }
  }

  // =====================================================================
  // Elf mode: spin a wheel to pick a random unclaimed gift
  // =====================================================================
  const WHEEL_COLORS = ['#b3202a', '#175a44', '#d4a017', '#0b1d33', '#c9353f', '#2c8061', '#e0ac2c', '#24456e'];
  const secureRandom = (n) => {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] % n;
  };
  const short = (t, n) => (t.length > n ? `${t.slice(0, n - 1).trim()}…` : t);

  function wheelSvg(items) {
    const n = items.length;
    const R = 140;
    const seg = 360 / n;
    let paths = '';
    items.forEach((it, i) => {
      const a0 = ((i * seg - 90) * Math.PI) / 180;
      const a1 = (((i + 1) * seg - 90) * Math.PI) / 180;
      const large = seg > 180 ? 1 : 0;
      const x0 = 150 + R * Math.cos(a0);
      const y0 = 150 + R * Math.sin(a0);
      const x1 = 150 + R * Math.cos(a1);
      const y1 = 150 + R * Math.sin(a1);
      const fill = WHEEL_COLORS[i % WHEEL_COLORS.length];
      const light = fill === '#d4a017' || fill === '#e0ac2c';
      const d = n === 1 ? `M150 10 A140 140 0 1 1 149.99 10 Z` : `M150 150 L${x0} ${y0} A${R} ${R} 0 ${large} 1 ${x1} ${y1} Z`;
      const mid = i * seg + seg / 2;
      const fs = n > 10 ? 10 : n > 6 ? 11.5 : 13;
      paths += `<path d="${d}" fill="${fill}" stroke="#fbf6ec" stroke-width="2"/>
        <text transform="rotate(${mid - 90} 150 150)" x="${150 + R - 12}" y="${150 + fs / 3}" text-anchor="end" font-size="${fs}" fill="${light ? '#2a1d00' : '#fff'}">${esc(short(it.title, n > 10 ? 15 : n > 6 ? 13 : 12))}</text>`;
    });
    let pegs = '';
    for (let i = 0; i < n; i++) {
      const a = ((i * seg - 90) * Math.PI) / 180;
      pegs += `<circle cx="${150 + (R + 1) * Math.cos(a)}" cy="${150 + (R + 1) * Math.sin(a)}" r="3.2" fill="#e8bd45" stroke="#7a5a10" stroke-width=".8"/>`;
    }
    return `
      <svg viewBox="0 0 300 300" class="wheel-svg" aria-hidden="true">
        <circle cx="150" cy="150" r="148" fill="#7a5a10"/><circle cx="150" cy="150" r="145" fill="#e8bd45"/>
        <g class="wheel-rot">${paths}${pegs}</g>
        <circle cx="150" cy="150" r="24" fill="#fbf6ec" stroke="#e8bd45" stroke-width="4"/>
        <text x="150" y="159" text-anchor="middle" font-size="24">🧝</text>
      </svg>`;
  }

  function elfWheel({ items, onClaim }) {
    const pool = items.filter((i) => !i.claimed);
    let dlg = document.getElementById('elf-dialog');
    if (!dlg) {
      dlg = document.createElement('dialog');
      dlg.id = 'elf-dialog';
      dlg.className = 'elf-dialog';
      document.body.append(dlg);
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg) dlg.close();
      });
    }
    if (!pool.length) {
      dlg.innerHTML = `<h2>🧝 Elf mode</h2><p>Every wish on this list is already claimed. The elves are impressed! 🎉</p>
        <div class="dialog-actions"><button class="btn" data-close>Close</button></div>`;
      dlg.querySelector('[data-close]').onclick = () => dlg.close();
      dlg.showModal();
      return;
    }
    // Pick the winner from *all* unclaimed gifts first, then show up to 12 on the wheel including it.
    const winner = pool[secureRandom(pool.length)];
    let shown = pool.length > 12 ? [winner, ...pool.filter((p) => p !== winner).sort(() => Math.random() - 0.5).slice(0, 11)] : [...pool];
    shown = shown.sort(() => Math.random() - 0.5);
    const idx = shown.indexOf(winner);

    dlg.innerHTML = `
      <h2>🧝 Elf mode</h2>
      <p class="muted" style="margin-top:0">Can't decide? Let the elves pick a gift that nobody has claimed yet.</p>
      <div class="wheel-wrap">
        <div class="wheel-pointer" aria-hidden="true"></div>
        ${wheelSvg(shown)}
      </div>
      <div class="elf-result" aria-live="polite"></div>
      <div class="dialog-actions">
        <button class="btn btn-light" data-close type="button">Close</button>
        <button class="btn btn-red" data-spin type="button">🎡 Spin the wheel!</button>
      </div>`;
    const rot = dlg.querySelector('.wheel-rot');
    const result = dlg.querySelector('.elf-result');
    const spinBtn = dlg.querySelector('[data-spin]');
    dlg.querySelector('[data-close]').onclick = () => dlg.close();
    dlg.showModal();

    let spun = false;
    spinBtn.onclick = () => {
      if (spun) {
        elfWheel({ items, onClaim }); // spin again with a fresh pick
        return;
      }
      spun = true;
      spinBtn.disabled = true;
      const seg = 360 / shown.length;
      const jitter = (Math.random() - 0.5) * seg * 0.6;
      const target = 360 * 6 - (idx * seg + seg / 2) + jitter;
      const duration = RM ? 0 : 5200;
      rot.style.transition = RM ? 'none' : `transform ${duration}ms cubic-bezier(0.12, 0.65, 0.08, 1)`;
      rot.style.transform = `rotate(${target}deg)`;
      if (!RM) {
        // Ticks that slow down with the wheel.
        let t = 0;
        let gap = 45;
        while (t < duration - 400) {
          setTimeout(() => play('tick'), t);
          t += gap;
          gap *= 1.075;
        }
      }
      setTimeout(() => {
        play('fanfare');
        const box = dlg.querySelector('.wheel-wrap').getBoundingClientRect();
        WL.fx?.confetti(box.left + box.width / 2, box.top + box.height / 2, 50);
        const img = WL.safeUrl(winner.image);
        const url = WL.safeUrl(winner.url);
        result.innerHTML = `
          <div class="elf-pick ${RM ? 'fade-in' : ''}">
            ${img ? `<img src="${esc(img)}" alt="" referrerpolicy="no-referrer">` : '<span class="ph">🎁</span>'}
            <div>
              <div class="small muted">The elves have chosen…</div>
              <strong>${esc(winner.title)}</strong>
              <div>${winner.price != null ? `<span class="price">${esc(WL.money(winner.price, winner.currency))}</span>` : ''} <span class="store">${esc(winner.store)}</span></div>
              ${url ? `<a class="small" href="${esc(url)}" target="_blank" rel="noopener noreferrer nofollow">View item ↗</a>` : ''}
            </div>
          </div>`;
        spinBtn.disabled = false;
        spinBtn.textContent = '🎡 Spin again';
        spinBtn.classList.replace('btn-red', 'btn-light');
        const claim = document.createElement('button');
        claim.className = 'btn btn-red';
        claim.type = 'button';
        claim.textContent = "🎁 I'll get this!";
        claim.onclick = () => {
          dlg.close();
          onClaim(winner);
        };
        dlg.querySelector('.dialog-actions').append(claim);
      }, duration + 150);
    };
  }

  WL.extras = { renderTree, candyCane, elfWheel };
})();
