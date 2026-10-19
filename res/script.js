/* ============================================================
   DROPDOWNS
   ============================================================ */
(function initDropdowns() {
  const dropdowns = document.querySelectorAll('.dropdown');
  if (!dropdowns.length) return;

  function closeAll(except) {
    document.querySelectorAll('.dropdown.is-open').forEach(dd => {
      if (dd === except) return;
      dd.classList.remove('is-open');
      const b = dd.querySelector('.nav-dropdown__btn');
      if (b) b.setAttribute('aria-expanded', 'false');
    });
  }

  dropdowns.forEach(dd => {
    const btn = dd.querySelector('.nav-dropdown__btn');
    if (!btn) return;
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const willOpen = !dd.classList.contains('is-open');
      closeAll(dd);
      dd.classList.toggle('is-open', willOpen);
      btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    });
  });

  document.addEventListener('click', () => closeAll(null));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(null); });
})();

/* RIPPLE */
(function initRipple() {
  const selector = '.btn, .dropdown__menu a, .dino-btn, .dino-mute, .dino-diff-btn, .dino-play';
  document.addEventListener('click', e => {
    const el = e.target.closest(selector);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2;
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = (e.clientX - r.left - size / 2) + 'px';
    ripple.style.top = (e.clientY - r.top - size / 2) + 'px';
    el.appendChild(ripple);
    setTimeout(() => ripple.remove(), 700);
  });
})();

/* REVEAL */
(function initReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); }
      });
    }, { threshold: 0.1 });
    els.forEach(el => io.observe(el));
  } else {
    els.forEach(el => el.classList.add('is-visible'));
    return;
  }
  setTimeout(() => {
    els.forEach(el => {
      if (el.classList.contains('is-visible')) return;
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 1.5) el.classList.add('is-visible');
    });
  }, 1200);
})();

/* CUSTOM CURSOR */
(function initCursor() {
  if (!window.matchMedia('(pointer: fine)').matches) return;
  if (document.documentElement.classList.contains('has-custom-cursor')) return;

  const dot = document.createElement('div'); dot.className = 'cursor-dot';
  const ring = document.createElement('div'); ring.className = 'cursor-ring';
  document.body.appendChild(dot); document.body.appendChild(ring);
  document.documentElement.classList.add('has-custom-cursor');

  let mx = window.innerWidth / 2, my = window.innerHeight / 2;
  let dx = mx, dy = my, rx = mx, ry = my;

  document.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; }, { passive: true });

  const hoverSelector = 'a, button, input, textarea, select, label, .btn, .card, .media-card, .contact-card, .confession, .nav-dropdown__btn, .dropdown__menu a, .dino-canvas, .dino-btn, .dino-mute, .dino-nick, .dino-diff-btn, .dino-play, .media-card__desc-btn';

  document.addEventListener('mouseover', e => {
    if (e.target.closest(hoverSelector)) ring.classList.add('is-hover');
    else ring.classList.remove('is-hover');
  }, { passive: true });

  document.addEventListener('mouseleave', () => document.documentElement.classList.remove('has-custom-cursor'));
  document.addEventListener('mouseenter', () => {
    if (window.matchMedia('(pointer: fine)').matches) document.documentElement.classList.add('has-custom-cursor');
  });

  function tick() {
    dx += (mx - dx) * 0.5; dy += (my - dy) * 0.5;
    rx += (mx - rx) * 0.15; ry += (my - ry) * 0.15;
    dot.style.transform = 'translate3d(' + dx + 'px,' + dy + 'px,0) translate(-50%,-50%)';
    ring.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0) translate(-50%,-50%)';
    requestAnimationFrame(tick);
  }
  tick();
})();

/* MOUSE PARALLAX */
(function initMouseEffects() {
  if (!window.matchMedia('(pointer: fine)').matches) return;
  const layers = document.querySelectorAll('.blob-layer');
  const glow = document.querySelector('.cursor-glow');
  if (!layers.length && !glow) return;

  let tx = 0, ty = 0, cx = 0, cy = 0;
  let rx = window.innerWidth / 2, ry = window.innerHeight / 2;
  let active = !document.hidden;

  document.addEventListener('mousemove', e => {
    rx = e.clientX; ry = e.clientY;
    tx = (e.clientX / window.innerWidth - 0.5) * 2;
    ty = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  document.addEventListener('visibilitychange', () => { active = !document.hidden; if (active) tick(); });

  function tick() {
    if (!active) return;
    cx += (tx - cx) * 0.07; cy += (ty - cy) * 0.07;
    for (let i = 0; i < layers.length; i++) {
      const l = layers[i];
      const depth = parseFloat(l.dataset.depth) || 20;
      l.style.transform = 'translate3d(' + (-cx * depth) + 'px,' + (-cy * depth) + 'px,0)';
    }
    if (glow) {
      glow.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0) translate(-50%,-50%)';
      glow.classList.add('is-visible');
    }
    requestAnimationFrame(tick);
  }
  tick();
})();

/* LINES CANVAS */
(function initLines() {
  const canvas = document.getElementById('linesCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const hasMouse = window.matchMedia('(pointer: fine)').matches;
  let W = 0, H = 0;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.floor(W * dpr); canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resize(); initParticles(); }, 150);
  });

  const mouse = { x: -9999, y: -9999 };
  if (hasMouse) {
    document.addEventListener('mousemove', e => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
    document.addEventListener('mouseleave', () => { mouse.x = -9999; mouse.y = -9999; });
  }

  const MAX_DIST = 150, MAX_DIST_SQ = MAX_DIST * MAX_DIST;
  const MOUSE_R = 160, MOUSE_R_SQ = MOUSE_R * MOUSE_R;
  const MAX_SPEED = 2.5, MAX_SPEED_SQ = MAX_SPEED * MAX_SPEED;

  let particles = [];
  const connections = [];

  function initParticles() {
    const count = Math.min(90, Math.max(35, Math.floor((W * H) / 20000)));
    particles = new Array(count);
    for (let i = 0; i < count; i++) {
      particles[i] = { x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6 };
    }
  }
  initParticles();

  let running = !document.hidden;
  document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) requestAnimationFrame(tick); });

  function tick() {
    if (!running) return;
    ctx.clearRect(0, 0, W, H);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (hasMouse) {
        const mdx = mouse.x - p.x, mdy = mouse.y - p.y;
        const md2 = mdx * mdx + mdy * mdy;
        if (md2 < MOUSE_R_SQ && md2 > 1) {
          const md = Math.sqrt(md2);
          const force = (1 - md / MOUSE_R) * 0.1;
          p.vx -= (mdx / md) * force; p.vy -= (mdy / md) * force;
        }
      }
      const sp2 = p.vx * p.vx + p.vy * p.vy;
      if (sp2 > MAX_SPEED_SQ) {
        const sp = Math.sqrt(sp2);
        p.vx = p.vx / sp * MAX_SPEED; p.vy = p.vy / sp * MAX_SPEED;
      }
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.975; p.vy *= 0.975;
      if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx); }
      else if (p.x > W) { p.x = W; p.vx = -Math.abs(p.vx); }
      if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy); }
      else if (p.y > H) { p.y = H; p.vy = -Math.abs(p.vy); }
    }
    connections.length = 0;
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < MAX_DIST_SQ) connections.push([a.x, a.y, b.x, b.y, Math.sqrt(d2)]);
      }
    }
    ctx.lineCap = 'round';
    ctx.lineWidth = 4;
    for (let i = 0; i < connections.length; i++) {
      const c = connections[i];
      const k = 1 - c[4] / MAX_DIST;
      ctx.strokeStyle = 'rgba(243,156,18,' + (k * 0.5).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(c[2], c[3]); ctx.stroke();
    }
    ctx.lineWidth = 1.4;
    for (let i = 0; i < connections.length; i++) {
      const c = connections[i];
      const k = 1 - c[4] / MAX_DIST;
      ctx.strokeStyle = 'rgba(0,0,0,' + (k * 0.95).toFixed(3) + ')';
      ctx.beginPath(); ctx.moveTo(c[0], c[1]); ctx.lineTo(c[2], c[3]); ctx.stroke();
    }
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      ctx.beginPath(); ctx.fillStyle = 'rgba(243,156,18,0.5)'; ctx.arc(p.x, p.y, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2); ctx.fill();
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();

/* TELEGRAM FORM */
(function initTelegramForm() {
  const form = document.getElementById('telegramForm');
  if (!form) return;
  const username = form.dataset.telegramUsername || '';
  form.addEventListener('submit', e => {
    e.preventDefault();
    const name = form.tgName.value.trim();
    const email = form.tgEmail.value.trim();
    const message = form.tgMessage.value.trim();
    if (!name || !message) return;
    let text = 'Привет! Меня зовут ' + name + '.\n';
    if (email) text += 'Мой email: ' + email + '\n';
    text += '\n' + message;
    const url = 'https://t.me/' + encodeURIComponent(username) + '?text=' + encodeURIComponent(text);
    window.open(url, '_blank', 'noopener');
  });
})();

/* STAR RATINGS — рендер 10 звёзд из data-rating (0–10) */
(function initStarRatings() {
  const els = document.querySelectorAll('.media-card__rating[data-rating]');
  if (!els.length) return;
  els.forEach(el => {
    const raw = parseInt(el.getAttribute('data-rating'), 10);
    const rating = Math.max(0, Math.min(10, isNaN(raw) ? 0 : raw));
    let html = '<span class="stars">';
    for (let i = 1; i <= 10; i++) {
      const filled = i <= rating;
      html += '<span class="star' + (filled ? ' is-filled' : '') + '" aria-hidden="true">' +
              (filled ? '★' : '☆') + '</span>';
    }
    html += '</span>';
    html += '<span class="media-card__rating-value">' + rating + '/10</span>';
    el.innerHTML = html;
    el.setAttribute('aria-label', 'Рейтинг: ' + rating + ' из 10');
    el.setAttribute('title', 'Рейтинг: ' + rating + ' из 10');
  });
})();

/* DESC TOGGLE — раскрытие описания в карточках модов */
(function initDescButtons() {
  const buttons = document.querySelectorAll('.media-card__desc-btn');
  if (!buttons.length) return;

  buttons.forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();

      const card = btn.closest('.media-card');
      if (!card) return;
      const desc = card.querySelector('.media-card__desc');
      if (!desc) return;

      const isOpen = !desc.hidden;
      desc.hidden = isOpen;
      btn.setAttribute('aria-expanded', String(!isOpen));
      btn.classList.toggle('is-open', !isOpen);
    });
  });
})();