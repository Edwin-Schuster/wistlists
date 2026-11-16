// Festive effects: snow, string lights, sky, countdown, fireworks, confetti, gift animations,
// sleigh easter egg and synthesized sounds. Vanilla JS, no libraries.
(() => {
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get: (k, d) => localStorage.getItem(`wl_${k}`) ?? d,
    set: (k, v) => localStorage.setItem(`wl_${k}`, v),
  };
  const rand = (a, b) => a + Math.random() * (b - a);
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  };

  // =====================================================================
  // Sound (Web Audio synthesis, muted by default)
  // =====================================================================
  const NOTE = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, C6: 1046.5, G6: 1567.98, C7: 2093 };
  const Sound = {
    on: store.get('sound', 'off') === 'on',
    ctx: null,
    master: null,
    noiseBuf: null,
    ac() {
      if (!this.ctx) {
        const C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        this.ctx = new C();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.55;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },
    bell(f, t, dur = 1.2, vol = 0.16) {
      const c = this.ctx;
      [[1, 1], [2.0, 0.45], [3.01, 0.28], [4.17, 0.16], [5.43, 0.08]].forEach(([mult, g], k) => {
        const o = c.createOscillator();
        const gain = c.createGain();
        o.type = 'sine';
        o.frequency.value = f * mult;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(vol * g, t + 0.006);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur / (1 + k * 0.7));
        o.connect(gain).connect(this.master);
        o.start(t);
        o.stop(t + dur + 0.05);
      });
    },
    noise(t, dur, { type = 'bandpass', freq = 6000, q = 1, vol = 0.08 } = {}) {
      const c = this.ctx;
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      const filt = c.createBiquadFilter();
      filt.type = type;
      filt.frequency.value = freq;
      filt.Q.value = q;
      const g = c.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(filt).connect(g).connect(this.master);
      src.start(t, Math.random() * 0.5);
      src.stop(t + dur + 0.02);
    },
    jingle(c) {
      const q = 0.19;
      const t0 = c.currentTime + 0.05;
      [['E5', 0], ['E5', 1], ['E5', 2], ['E5', 4], ['E5', 5], ['E5', 6], ['E5', 8], ['G5', 9], ['C5', 10], ['D5', 11], ['E5', 12]].forEach(
        ([n, beat]) => this.bell(NOTE[n], t0 + beat * q, n === 'E5' && (beat === 2 || beat === 6 || beat === 12) ? 1.4 : 0.9, 0.13)
      );
      for (let i = 0; i < 26; i++) this.noise(t0 + i * q * 0.5 + rand(0, 0.02), 0.06, { freq: 7500, vol: 0.035 });
    },
    sleigh(c) {
      const t0 = c.currentTime + 0.02;
      for (let i = 0; i < 22; i++) {
        const t = t0 + i * 0.11 + rand(0, 0.025);
        this.noise(t, 0.07, { freq: rand(6500, 9000), q: 1.5, vol: 0.07 });
        if (i % 2 === 0) this.bell(rand(2600, 4200), t, 0.3, 0.025);
      }
    },
    pop(c) {
      const t = c.currentTime + 0.01;
      this.noise(t, 0.09, { type: 'lowpass', freq: 2200, vol: 0.25 });
      const o = c.createOscillator();
      const g = c.createGain();
      o.frequency.setValueAtTime(900, t);
      o.frequency.exponentialRampToValueAtTime(110, t + 0.12);
      g.gain.setValueAtTime(0.18, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      o.connect(g).connect(this.master);
      o.start(t);
      o.stop(t + 0.16);
      for (let i = 0; i < 4; i++) this.bell(rand(3500, 5200), t + 0.05 + i * 0.03, 0.15, 0.02);
    },
    chime(c) {
      const t = c.currentTime + 0.02;
      this.bell(NOTE.C6, t, 1.0, 0.1);
      this.bell(NOTE.G6, t + 0.12, 1.0, 0.09);
      this.bell(NOTE.C7, t + 0.24, 1.3, 0.08);
    },
    tick(c) {
      const t = c.currentTime + 0.005;
      this.noise(t, 0.025, { type: 'highpass', freq: 3000, vol: 0.12 });
      this.bell(1800, t, 0.12, 0.03);
    },
    fanfare(c) {
      const t = c.currentTime + 0.02;
      [[NOTE.C5, 0], [NOTE.E5, 0.12], [NOTE.G5, 0.24], [NOTE.C6, 0.4]].forEach(([f, d]) => this.bell(f, t + d, d === 0.4 ? 1.6 : 0.8, 0.12));
      for (let i = 0; i < 10; i++) this.noise(t + 0.4 + i * 0.07, 0.06, { freq: 7500, vol: 0.04 });
    },
    crumple(c) {
      const t0 = c.currentTime + 0.01;
      for (let i = 0; i < 14; i++) this.noise(t0 + i * 0.035 + rand(0, 0.02), rand(0.02, 0.05), { freq: rand(1500, 5000), q: 0.8, vol: rand(0.05, 0.12) });
    },
    play(name) {
      if (!this.on) return;
      const c = this.ac();
      if (c) this[name](c);
    },
    toggle() {
      this.on = !this.on;
      store.set('sound', this.on ? 'on' : 'off');
      if (this.on) this.play('chime');
      return this.on;
    },
  };

  // =====================================================================
  // Header string lights
  // =====================================================================
  const BULB_COLORS = ['#ff4d4d', '#ffcc33', '#37d67a', '#4fb3ff', '#ff4d4d', '#37d67a', '#ffcc33', '#ff8ad8'];
  function buildLights() {
    const bar = document.querySelector('.topbar');
    if (!bar) return;
    let strip = bar.querySelector('.lights');
    if (!strip) {
      strip = el('div', 'lights');
      strip.setAttribute('aria-hidden', 'true');
      bar.append(strip);
      strip.addEventListener('click', (e) => {
        const b = e.target.closest('.bulb');
        if (b) popBulb(b);
      });
    }
    const W = strip.clientWidth || window.innerWidth;
    const spacing = W < 600 ? 38 : 46;
    const n = Math.floor(W / spacing);
    const seg = spacing * 4;
    const sag = 12;
    const y = (x) => 3 + sag * Math.sin(Math.PI * ((x % seg) / seg));
    let d = `M0 ${y(0)}`;
    for (let x = 6; x <= W; x += 6) d += ` L${x} ${y(x).toFixed(1)}`;
    let html = `<svg viewBox="0 0 ${W} 40" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="#1d2b24" stroke-width="2"/></svg>`;
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * spacing;
      const slope = ((sag * Math.PI) / seg) * Math.cos(Math.PI * ((x % seg) / seg));
      const rot = (Math.atan(slope) * 180) / Math.PI;
      html += `<span class="bulb" style="left:${x}px;top:${y(x) - 1}px;--c:${BULB_COLORS[i % BULB_COLORS.length]};--d:${((i % 8) * 0.4).toFixed(1)}s;--r:${rot.toFixed(1)}deg"><span class="glass"></span></span>`;
    }
    strip.innerHTML = html;
  }
  function popBulb(b) {
    if (b.classList.contains('popped') || b.classList.contains('popping')) return;
    Sound.play('pop');
    const finish = () => {
      b.classList.remove('popping');
      b.classList.add('popped');
      setTimeout(() => b.classList.remove('popped'), 7000);
    };
    if (RM) return finish();
    b.classList.add('popping');
    const r = b.getBoundingClientRect();
    const c = getComputedStyle(b).getPropertyValue('--c');
    for (let i = 0; i < 7; i++) {
      const s = el('span', 'shard');
      s.style.cssText = `left:${r.left + r.width / 2}px;top:${r.top + r.height * 0.6}px;--c:${c};--dx:${rand(-40, 40)}px;--dy:${rand(10, 70)}px;--rot:${rand(-360, 360)}deg`;
      document.body.append(s);
      setTimeout(() => s.remove(), 750);
    }
    setTimeout(finish, 180);
  }

  // =====================================================================
  // Sky: stars, moon, snowy roofline
  // =====================================================================
  const ROOFLINE = `
  <svg viewBox="0 0 1200 140" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <defs>
      <filter id="winGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <g fill="#0f2740" opacity=".9">
      <polygon points="250,130 275,62 300,130"/><polygon points="430,130 452,74 474,130"/><polygon points="660,130 690,52 720,130"/>
      <polygon points="925,130 945,80 965,130"/><polygon points="1150,130 1172,66 1194,130"/>
    </g>
    <g fill="#071322">
      <rect x="60" y="72" width="172" height="68"/><polygon points="40,76 146,22 252,76"/><rect x="192" y="30" width="20" height="32"/>
      <rect x="318" y="54" width="104" height="86"/><polygon points="304,58 370,12 436,58"/>
      <rect x="500" y="84" width="150" height="56"/><polygon points="488,88 575,44 662,88"/><rect x="610" y="46" width="16" height="26"/>
      <rect x="750" y="66" width="200" height="74"/><polygon points="734,70 850,26 966,70"/>
      <rect x="1000" y="58" width="128" height="82"/><polygon points="986,62 1064,16 1142,62"/><rect x="1018" y="24" width="16" height="26"/>
    </g>
    <g fill="#f4f6fb">
      <polygon points="40,76 146,22 252,76 244,82 146,32 48,82"/><rect x="189" y="26" width="26" height="7" rx="3"/>
      <polygon points="304,58 370,12 436,58 428,64 370,22 312,64"/>
      <polygon points="488,88 575,44 662,88 654,93 575,53 496,93"/><rect x="607" y="42" width="22" height="7" rx="3"/>
      <polygon points="734,70 850,26 966,70 958,76 850,36 742,76"/>
      <polygon points="986,62 1064,16 1142,62 1134,68 1064,26 994,68"/><rect x="1015" y="20" width="22" height="7" rx="3"/>
      <circle cx="80" cy="82" r="3"/><circle cx="120" cy="58" r="2.5"/><circle cx="214" cy="68" r="3"/><circle cx="350" cy="38" r="2.5"/>
      <circle cx="402" cy="50" r="3"/><circle cx="540" cy="76" r="2.5"/><circle cx="790" cy="62" r="3"/><circle cx="910" cy="56" r="2.5"/><circle cx="1100" cy="46" r="3"/>
    </g>
    <g fill="#ffd36b" filter="url(#winGlow)">
      <rect class="win" x="86" y="94" width="26" height="22" rx="2"/><rect class="win" x="176" y="94" width="26" height="22" rx="2" style="animation-delay:-2s"/>
      <rect class="win" x="336" y="72" width="22" height="20" rx="2" style="animation-delay:-1s"/><rect class="win" x="380" y="72" width="22" height="20" rx="2" style="animation-delay:-4s"/>
      <rect class="win" x="356" y="104" width="26" height="22" rx="2" style="animation-delay:-3s"/>
      <rect class="win" x="530" y="100" width="24" height="20" rx="2" style="animation-delay:-2.5s"/><rect class="win" x="596" y="100" width="24" height="20" rx="2"/>
      <rect class="win" x="772" y="88" width="28" height="22" rx="2" style="animation-delay:-1.5s"/><rect class="win" x="836" y="88" width="28" height="22" rx="2" style="animation-delay:-5s"/><rect class="win" x="900" y="88" width="28" height="22" rx="2" style="animation-delay:-3.5s"/>
      <rect class="win" x="1022" y="78" width="24" height="22" rx="2" style="animation-delay:-0.5s"/><rect class="win" x="1082" y="78" width="24" height="22" rx="2" style="animation-delay:-4.5s"/>
      <circle class="win" cx="370" cy="40" r="7" style="animation-delay:-2s"/>
    </g>
    <g fill="#3a1d0f"><rect x="132" y="112" width="20" height="28" rx="2"/><rect x="1056" y="112" width="18" height="28" rx="2"/></g>
    <g fill="#0b2a1f">
      <polygon points="455,132 470,96 485,132"/><polygon points="458,116 470,84 482,116"/><polygon points="462,100 470,74 478,100"/>
      <polygon points="680,134 696,92 712,134"/><polygon points="683,116 696,80 709,116"/>
      <polygon points="1158,134 1174,94 1190,134"/><polygon points="1161,116 1174,82 1187,116"/>
    </g>
    <g fill="#ffd36b"><circle cx="470" cy="72" r="2.5"/><circle cx="696" cy="78" r="2.5"/><circle cx="1174" cy="80" r="2.5"/></g>
    <path d="M0 128 Q 150 116 300 126 T 600 123 T 900 128 T 1200 121 V140 H0 Z" fill="#f6f2ea"/>
  </svg>`;

  function decorateSky() {
    document.querySelectorAll('[data-sky]').forEach((sky) => {
      if (sky.querySelector('.sky-layer')) return;
      const layer = el('div', 'sky-layer');
      layer.setAttribute('aria-hidden', 'true');
      const count = Math.round(Math.min(90, Math.max(35, sky.clientWidth / 14)));
      let html = '<div class="moon"></div>';
      for (let i = 0; i < count; i++) {
        const big = Math.random() < 0.08;
        html += `<span class="star${big ? ' big' : ''}" style="left:${rand(0, 100).toFixed(2)}%;top:${rand(0, sky.classList.contains('hero') ? 72 : 95).toFixed(2)}%;--s:${big ? 3 : rand(1, 2.6).toFixed(1)}px;--t:${rand(2, 5.5).toFixed(1)}s;--d:${rand(-5, 0).toFixed(1)}s"></span>`;
      }
      layer.innerHTML = html;
      sky.prepend(layer);
      if (sky.classList.contains('hero')) {
        const roof = el('div', 'roofline', ROOFLINE);
        sky.append(roof);
      }
    });
  }

  // =====================================================================
  // Countdown flip clock (+ Merry Christmas fireworks on Dec 25)
  // =====================================================================
  // ?date=2026-12-25 previews another day (handy for checking the Christmas Day mode).
  const offset = (() => {
    const p = new URLSearchParams(location.search).get('date');
    if (!p) return 0;
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(p) ? `${p}T10:00:00` : p);
    return Number.isNaN(d.getTime()) ? 0 : d.getTime() - Date.now();
  })();
  const now = () => new Date(Date.now() + offset);

  function digitHtml(v) {
    return `<div class="fc-digit" data-v="${v}"><div class="fc-half top"><span>${v}</span></div><div class="fc-half bottom"><span>${v}</span></div></div>`;
  }
  function flip(d, v) {
    const old = d.dataset.v;
    if (old === v) return;
    d.dataset.v = v;
    const top = d.querySelector('.fc-half.top:not(.flap) span');
    const bottom = d.querySelector('.fc-half.bottom:not(.flap) span');
    d.querySelectorAll('.flap').forEach((f) => f.remove());
    if (RM) {
      top.textContent = v;
      bottom.textContent = v;
      return;
    }
    top.textContent = v;
    const ft = el('div', 'fc-half top flap', `<span>${old}</span>`);
    const fb = el('div', 'fc-half bottom flap', `<span>${v}</span>`);
    d.append(ft, fb);
    setTimeout(() => {
      bottom.textContent = v;
      ft.remove();
      fb.remove();
    }, 600);
  }

  function mountCountdown(box) {
    const labels = ['Days', 'Hours', 'Mins', 'Secs'];
    let built = '';
    const tick = () => {
      const n = now();
      if (n.getMonth() === 11 && n.getDate() === 25) {
        if (built !== 'merry') {
          built = 'merry';
          box.innerHTML = '<div class="merry">Merry Christmas!</div><p class="hero-sub">🎁 Today\'s the day. Hope Santa was good to you! 🎄</p>';
          Sound.play('jingle');
          const hero = box.closest('.hero');
          if (hero) startFireworks(hero);
        }
        return;
      }
      let target = new Date(n.getFullYear(), 11, 25);
      if (n > target) target = new Date(n.getFullYear() + 1, 11, 25);
      const s = Math.max(0, Math.floor((target - n) / 1000));
      const parts = [Math.floor(s / 86400), Math.floor(s / 3600) % 24, Math.floor(s / 60) % 60, s % 60].map((v, i) =>
        String(v).padStart(i === 0 && v >= 100 ? 3 : 2, '0')
      );
      const shape = parts.map((p) => p.length).join(',');
      if (built !== shape) {
        built = shape;
        box.innerHTML = `<div class="cd-title">✨ Countdown to Christmas ✨</div>
          <div class="flipclock" role="timer" aria-label="Time until Christmas">
            ${parts.map((p, i) => `<div class="fc-unit"><div class="fc-digits">${[...p].map(digitHtml).join('')}</div><div class="fc-label">${labels[i]}</div></div>`).join('')}
          </div>`;
      } else {
        const digits = box.querySelectorAll('.fc-digit');
        [...parts.join('')].forEach((v, i) => flip(digits[i], v));
      }
      box.querySelector('.flipclock')?.setAttribute('aria-label', `${+parts[0]} days, ${+parts[1]} hours, ${+parts[2]} minutes until Christmas`);
    };
    tick();
    setInterval(tick, 1000);
  }

  function startFireworks(hero) {
    if (RM) return;
    const cv = el('canvas', 'fireworks');
    hero.prepend(cv);
    const ctx = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const size = () => {
      cv.width = hero.clientWidth * dpr;
      cv.height = hero.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    size();
    window.addEventListener('resize', size);
    const rockets = [];
    const sparks = [];
    const colors = ['#ff4d4d', '#ffd36b', '#37d67a', '#4fb3ff', '#ffffff', '#ff8ad8'];
    let last = 0;
    const loop = (t) => {
      const W = hero.clientWidth;
      const H = hero.clientHeight;
      if (t - last > rand(450, 1100)) {
        last = t;
        rockets.push({ x: rand(W * 0.1, W * 0.9), y: H, vy: -rand(6.5, 9), target: rand(H * 0.12, H * 0.45), c: colors[(Math.random() * colors.length) | 0] });
      }
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.y += r.vy;
        r.vy += 0.08;
        ctx.fillStyle = '#ffe9b0';
        ctx.fillRect(r.x - 1, r.y, 2, 5);
        if (r.y <= r.target || r.vy >= 0) {
          rockets.splice(i, 1);
          const n = 60;
          for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2;
            const v = rand(1.5, 4.2);
            sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(50, 80), c: Math.random() < 0.2 ? '#fff' : r.c });
          }
        }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx;
        s.y += s.vy;
        s.vx *= 0.975;
        s.vy = s.vy * 0.975 + 0.05;
        s.life--;
        ctx.globalAlpha = Math.max(0, s.life / 80);
        ctx.fillStyle = s.c;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
        if (s.life <= 0) sparks.splice(i, 1);
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // =====================================================================
  // Snowfall that piles up at the bottom
  // =====================================================================
  const Snow = {
    cv: null,
    raf: 0,
    start() {
      if (RM || this.cv) return;
      const cv = (this.cv = el('canvas', 'snow-canvas'));
      cv.setAttribute('aria-hidden', 'true');
      document.body.append(cv);
      const ctx = cv.getContext('2d');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const BIN = 4;
      let W, H, flakes, pile;
      const resize = () => {
        W = window.innerWidth;
        H = window.innerHeight;
        cv.width = W * dpr;
        cv.height = H * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const count = Math.round(Math.min(160, Math.max(45, (W * H) / 9000)));
        flakes = Array.from({ length: count }, () => newFlake(true));
        pile = new Float32Array(Math.ceil(W / BIN) + 1);
      };
      const newFlake = (anywhere) => ({
        x: rand(0, W),
        y: anywhere ? rand(-H, H) : rand(-40, -5),
        r: rand(1, 3.4),
        vy: rand(0.45, 1.3),
        sway: rand(0.4, 1.4),
        ph: rand(0, Math.PI * 2),
      });
      this.resize = resize;
      resize();
      window.addEventListener('resize', resize);
      let t = 0;
      const loop = () => {
        t += 0.01;
        ctx.clearRect(0, 0, W, H);
        const wind = Math.sin(t * 0.7) * 0.35;
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.beginPath();
        for (let i = 0; i < flakes.length; i++) {
          const f = flakes[i];
          f.y += f.vy * (0.6 + f.r / 3.4);
          f.x += Math.sin(t * 2 + f.ph) * f.sway * 0.35 + wind;
          if (f.x < -5) f.x = W + 5;
          else if (f.x > W + 5) f.x = -5;
          const b = Math.max(0, Math.min(pile.length - 1, Math.round(f.x / BIN)));
          if (f.y + f.r >= H - pile[b]) {
            pile[b] = Math.min(30, pile[b] + f.r * 0.55);
            for (const nb of [b - 1, b + 1]) {
              if (nb < 0 || nb >= pile.length) continue;
              const diff = pile[b] - pile[nb];
              if (diff > 2) {
                pile[b] -= diff * 0.3;
                pile[nb] += diff * 0.3;
              }
            }
            flakes[i] = newFlake(false);
            continue;
          }
          ctx.moveTo(f.x + f.r, f.y);
          ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        }
        ctx.fill();
        // pile
        for (let i = 0; i < pile.length; i++) pile[i] = Math.max(0, pile[i] - 0.0035);
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (let i = 0; i < pile.length; i++) ctx.lineTo(i * BIN, H - pile[i]);
        ctx.lineTo(W, H);
        ctx.closePath();
        ctx.shadowColor = 'rgba(120,150,190,0.45)';
        ctx.shadowBlur = 6;
        ctx.fillStyle = '#fbfdff';
        ctx.fill();
        ctx.shadowBlur = 0;
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    },
    stop() {
      cancelAnimationFrame(this.raf);
      if (this.resize) window.removeEventListener('resize', this.resize);
      this.cv?.remove();
      this.cv = null;
    },
  };

  // =====================================================================
  // Confetti: ornaments and stars
  // =====================================================================
  let fx = null;
  function fxCanvas() {
    if (fx) return fx;
    const cv = el('canvas', 'fx-canvas');
    cv.setAttribute('aria-hidden', 'true');
    document.body.append(cv);
    const ctx = cv.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = innerWidth * dpr;
    cv.height = innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fx = { cv, ctx, parts: [], running: false };
    return fx;
  }
  function drawStar(ctx, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      const rr = i % 2 ? r * 0.45 : r;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
  }
  function drawOrnament(ctx, r, c) {
    ctx.fillStyle = '#c9c2b0';
    ctx.fillRect(-r * 0.3, -r * 1.25, r * 0.6, r * 0.4);
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(-r * 0.35, -r * 0.35, r * 0.28, 0, Math.PI * 2);
    ctx.fill();
  }
  function confetti(x, y, n = 70) {
    if (RM) return;
    const f = fxCanvas();
    const colors = ['#b3202a', '#d4a017', '#175a44', '#2c8061', '#e8bd45', '#4fb3ff', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI * 0.85, -Math.PI * 0.15);
      const v = rand(4, 11.5);
      f.parts.push({
        x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, rot: rand(0, 6), vr: rand(-0.2, 0.2),
        r: rand(4, 7.5), star: Math.random() < 0.45, c: colors[(Math.random() * colors.length) | 0], life: rand(80, 130), max: 130,
      });
    }
    if (f.running) return;
    f.running = true;
    const loop = () => {
      const { ctx, parts } = f;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + 0.24;
        p.rot += p.vr;
        p.life--;
        if (p.life <= 0 || p.y > innerHeight + 20) {
          parts.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = Math.min(1, p.life / 30);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.star) {
          ctx.fillStyle = p.c === '#ffffff' ? '#fff6c8' : p.c === '#175a44' ? '#e8bd45' : p.c;
          drawStar(ctx, p.r * 1.2);
        } else drawOrnament(ctx, p.r, p.c);
        ctx.restore();
      }
      if (parts.length) requestAnimationFrame(loop);
      else {
        f.cv.remove();
        fx = null;
      }
    };
    requestAnimationFrame(loop);
  }

  // =====================================================================
  // Card animations
  // =====================================================================
  function stamp(card) {
    if (!card) return;
    card.querySelector('.stamp')?.classList.add('stamp-new');
    if (!RM) card.classList.add('thud');
    setTimeout(() => card.classList.remove('thud'), 800);
  }

  function giftDrop(row) {
    if (!row) return;
    row.scrollIntoView({ block: 'center' });
    if (RM) {
      row.classList.add('fade-in');
      return;
    }
    const r = row.getBoundingClientRect();
    const g = el('div', 'giftdrop', '<div class="gd-box"></div><div class="gd-lid"></div>');
    g.style.left = `${r.left + r.width / 2 - 42}px`;
    g.style.top = `${r.top + Math.min(r.height, 90) / 2 - 42}px`;
    document.body.append(g);
    row.classList.add('unfold');
    setTimeout(() => Sound.play('pop'), 720);
    setTimeout(() => Sound.play('chime'), 1050);
    setTimeout(() => g.remove(), 1500);
    setTimeout(() => row.classList.remove('unfold'), 1800);
  }

  function crumple(node, done) {
    Sound.play('crumple');
    if (RM) {
      node.classList.add('fade-out');
      setTimeout(done, 360);
      return;
    }
    const r = node.getBoundingClientRect();
    const clone = node.cloneNode(true);
    clone.classList.add('crumple');
    Object.assign(clone.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    // Scale factors so wide rows still crumple into a roughly round ball.
    const ball = 110;
    clone.style.setProperty('--k1x', Math.min(0.62, (ball * 2) / r.width).toFixed(3));
    clone.style.setProperty('--k1y', Math.min(0.6, (ball * 1.5) / r.height).toFixed(3));
    clone.style.setProperty('--k2x', Math.min(0.3, ball / r.width).toFixed(3));
    clone.style.setProperty('--k2y', Math.min(0.5, ball / r.height).toFixed(3));
    document.body.append(clone);
    node.style.height = `${r.height}px`;
    node.style.visibility = 'hidden';
    void node.offsetHeight;
    node.classList.add('collapse-out');
    node.style.height = '0px';
    node.style.paddingTop = node.style.paddingBottom = '0px';
    node.style.marginBottom = `-${parseFloat(getComputedStyle(node.parentElement).rowGap) || 0}px`;
    setTimeout(done, 650);
    setTimeout(() => clone.remove(), 1150);
  }

  // =====================================================================
  // Sleigh easter egg
  // =====================================================================
  let sleighActive = false;
  function flySleigh() {
    if (sleighActive) return;
    sleighActive = true;
    const hero = document.querySelector('.hero');
    const inView = hero && hero.getBoundingClientRect().bottom > 120;
    const s = el(
      'div',
      `sleigh${inView ? '' : ' fixed'}`,
      '<span class="bob"><span class="deer">🦌</span><span class="deer">🦌</span><span class="deer">🦌</span><span class="rein"></span><span class="sled">🛷<span class="santa">🎅</span></span></span><span class="trail"></span>'
    );
    s.setAttribute('aria-hidden', 'true');
    (inView ? hero : document.body).append(s);
    Sound.play('sleigh');
    setTimeout(() => Sound.play('jingle'), 2500);
    s.addEventListener('animationend', (e) => {
      if (e.target !== s) return;
      s.remove();
      sleighActive = false;
    });
  }
  function scheduleSleigh() {
    setTimeout(() => {
      if (!document.hidden) flySleigh();
      scheduleSleigh();
    }, rand(150, 270) * 1000);
  }
  let typed = '';
  document.addEventListener('keydown', (e) => {
    if (e.key.length !== 1) return;
    typed = (typed + e.key.toLowerCase()).slice(-5);
    if (typed === 'santa') flySleigh();
  });

  // =====================================================================
  // Theme
  // =====================================================================
  function setTheme(theme, { persist = true } = {}) {
    document.documentElement.dataset.theme = theme;
    if (persist) store.set('theme', theme);
    document.querySelector('[data-dock-theme]')?.setAttribute('aria-pressed', String(theme === 'fireplace'));
  }

  // =====================================================================
  // Floating dock: snow / sound / theme
  // =====================================================================
  function buildDock() {
    const dock = el('div', 'dock');
    dock.innerHTML = `
      ${RM ? '' : `<button type="button" data-dock-snow aria-pressed="${store.get('snow', 'on') === 'on'}" title="Snow on/off" aria-label="Snow on/off">❄️</button>`}
      <button type="button" data-dock-sound aria-pressed="${Sound.on}" title="Sounds on/off" aria-label="Sounds on/off">${Sound.on ? '🔔' : '🔕'}</button>
      <button type="button" data-dock-theme aria-pressed="${document.documentElement.dataset.theme === 'fireplace'}" title="Cozy fireplace theme" aria-label="Fireplace theme">🔥</button>`;
    document.body.append(dock);
    dock.addEventListener('click', async (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.matches('[data-dock-snow]')) {
        const on = store.get('snow', 'on') !== 'on';
        store.set('snow', on ? 'on' : 'off');
        b.setAttribute('aria-pressed', String(on));
        if (on) Snow.start();
        else Snow.stop();
      } else if (b.matches('[data-dock-sound]')) {
        const on = Sound.toggle();
        b.textContent = on ? '🔔' : '🔕';
        b.setAttribute('aria-pressed', String(on));
      } else if (b.matches('[data-dock-theme]')) {
        const next = document.documentElement.dataset.theme === 'fireplace' ? 'classic' : 'fireplace';
        setTheme(next);
        const user = await window.WL?.me?.();
        if (user) window.WL.api('POST', '/api/account', { theme: next }).catch(() => {});
      }
    });
  }

  // =====================================================================
  // Boot
  // =====================================================================
  function boot() {
    decorateSky();
    buildLights();
    let lastW = window.innerWidth;
    window.addEventListener('resize', () => {
      if (Math.abs(window.innerWidth - lastW) > 30) {
        lastW = window.innerWidth;
        buildLights();
      }
    });
    document.querySelectorAll('[data-countdown]').forEach(mountCountdown);
    buildDock();
    if (store.get('snow', 'on') === 'on') Snow.start();
    if (!RM) scheduleSleigh();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.WL = window.WL || {};
  window.WL.fx = { RM, sound: Sound, confetti, stamp, giftDrop, crumple, sleigh: flySleigh, setTheme, snow: Snow };
})();
