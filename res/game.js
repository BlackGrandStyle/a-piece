/* ============================================================
   HAMSTER GAME — optimized + enhancements + fixes
   ============================================================ */
(function initHamsterGame() {
  const canvas = document.getElementById('dinoCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  /* ---- ЯВНЫЕ ОБЪЯВЛЕНИЯ (были неявными глобалами) ---- */
  let dinoWrap = document.querySelector('.dino-wrap');
  let overlayUI = null;
  let legendEl = null;

  function randomNick() {
    const arr = window.DINO_NICKNAMES;
    if (!Array.isArray(arr) || arr.length === 0) return 'Гость';
    return arr[Math.floor(Math.random() * arr.length)] || 'Гость';
  }

  const GRAVITY = 0.75;
  const GRID_CELL = 40;
  const JUMP_V = [-11, -12.3, -13.4, -14.5];
  const BOUNCE_V = -8;
  const START_SPEED = 5;
  const MAX_SPEED = 10;
  const MAX_BOOST_LEVEL = 3;
  const SPRINT_MUL = 1.4;
  const SHATTER_TARGET_BLOCKS = 1400;
  const BG_COUNT = 21;
  const BIRD_OSC_AMP = GRID_CELL * 0.5;
  const AXE_MAX_KILLS = 3;

  const DIFFICULTY = {
    easy:   { label: 'Легко',  intervalMul: 1.55, speedMul: 0.9 },
    medium: { label: 'Средне', intervalMul: 1.0,  speedMul: 1.0 },
    hard:   { label: 'Тяжко',  intervalMul: 0.6,  speedMul: 1.15 }
  };

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0, groundY = 0;

  let hamster = { x: 40, y: 0, vy: 0, w: 32, h: 34, onGround: true, legFrame: 0 };
  let obstacles = [];
  let walkers = [];
  let arrows = [];
  let knives = [];
  let axes = [];
  let blocks = [];
  let pickups = [];
  let particles = [];
  let effects = [];
  let speed = START_SPEED;
  let score = 0;
  let hiScore = 0;
  let frameCount = 0;
  let gameState = 'menu';
  let paused = false;
  let sprinting = false;
  let difficulty = 'medium';
  let shieldLevel = 0;
  let jumpBoostLevel = 0, jumpBoostFrames = 0;
  let scoreBoostLevel = 0, scoreBoostFrames = 0;
  let speedBoostLevel = 0, speedBoostFrames = 0;
  let magnetLevel = 0, magnetFrames = 0;
  let knifeLevel = 0, knifeFrames = 0, knifeCooldown = 0;
  let axeLevel = 0, axeFrames = 0, axeCooldown = 0;
  let visible = false;
  let nextCactusAt = 60;
  let nextBirdAt = 260;
  let nextWalkerAt = 420;
  let nextSkeletonAt = 700;
  let nextBlockAt = 150;
  let nextPickupAt = 250;
  let scoreSavedThisRun = false;

  let shatterBlocks = [];
  let shatterFrames = 0;

  /* ---------- ПУЛ ЧАСТИЦ ---------- */
  const particlePool = [];
  function acquireParticle() { return particlePool.length > 0 ? particlePool.pop() : {}; }
  function releaseParticle(p) { if (particlePool.length < 300) particlePool.push(p); }

  /* ---------- КЭШ ГРАДИЕНТОВ ---------- */
  let gradientCache = new Map();
  function fillGrad(c1, c2) {
    const key = c1 + '|' + c2 + '|' + H;
    let g = gradientCache.get(key);
    if (g === undefined) {
      g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, c1);
      g.addColorStop(1, c2);
      gradientCache.set(key, g);
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  /* ---------- ФОНЫ ---------- */
  const BG_STEP = 250;
  let bgOrder = [];
  let bgStep = 0;
  let bgCurrent = 0;
  let bgPrevious = 0;
  let bgTransition = 1;

  function shuffleBgOrder() {
    bgOrder = [];
    for (let i = 0; i < BG_COUNT; i++) bgOrder.push(i);
    for (let i = bgOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = bgOrder[i]; bgOrder[i] = bgOrder[j]; bgOrder[j] = tmp;
    }
    bgStep = 0;
    bgCurrent = bgOrder[0];
    bgPrevious = bgOrder[0];
    bgTransition = 1;
  }
  shuffleBgOrder();

  function updateBg() {
    const targetStep = Math.floor(score / BG_STEP);
    if (targetStep !== bgStep) {
      bgPrevious = bgCurrent;
      bgStep = targetStep;
      bgCurrent = bgOrder[bgStep % BG_COUNT];
      bgTransition = 0;
    }
    if (bgTransition < 1) bgTransition = Math.min(1, bgTransition + 0.012);
  }

  /* ---------- РЕКОРДЫ ---------- */
  function hiKey(d) { return 'hamsterHiScore_' + (d || 'medium'); }
  function loadHiScore(d) {
    try { return parseInt(localStorage.getItem(hiKey(d)) || '0', 10) || 0; }
    catch (e) { return 0; }
  }
  function saveHiScore(d, sc) { try { localStorage.setItem(hiKey(d), String(sc)); } catch (e) {} }

  try {
    const savedDiff = localStorage.getItem('dinoDifficulty');
    if (savedDiff && DIFFICULTY[savedDiff]) difficulty = savedDiff;
  } catch (e) {}
  hiScore = loadHiScore(difficulty);

  function getMusicSpeedMul() {
    let mul = 1;
    const scoreLevel = Math.floor(score / 550);
    mul *= Math.min(1.8, 1 + scoreLevel * 0.15);
    if (sprinting) mul *= 1.05;
    if (speedBoostFrames > 0) mul *= (1 + 0.10 * speedBoostLevel);
    return mul;
  }

  /* ---------- ЛИДЕРБОРД ---------- */
  const LB_KEY = 'dinoLeaderboard';
  const NICK_KEY = 'dinoNick';

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function loadLeaderboard() {
    try {
      const raw = localStorage.getItem(LB_KEY);
      if (raw) return JSON.parse(raw) || [];
    } catch (e) {}
    const seed = (window.DINO_SEED_LEADERBOARD || []).slice();
    try { localStorage.setItem(LB_KEY, JSON.stringify(seed)); } catch (e) {}
    return seed;
  }
  function saveLeaderboard(list) {
    try { localStorage.setItem(LB_KEY, JSON.stringify(list.slice(0, 30))); } catch (e) {}
  }
  function addScore(nick, sc, diff) {
    if (!nick || sc <= 0) return;
    const list = loadLeaderboard();
    list.push({ nick: String(nick).slice(0, 16), score: sc, difficulty: diff || 'medium', date: Date.now() });
    list.sort((a, b) => b.score - a.score);
    saveLeaderboard(list);
    renderLeaderboard();
  }
  function diffLabel(d) {
    if (d === 'easy') return 'Легко';
    if (d === 'hard') return 'Тяжко';
    return 'Средне';
  }
  
  // Шапка таблицы удалена
  function renderLeaderboard() {
    const el = document.getElementById('dinoLeaderboard');
    if (!el) return;
    const list = loadLeaderboard();
    if (!list.length) {
      el.innerHTML = '<div class="dino-lb__empty">Пока пусто. Стань первым!</div>';
      return;
    }
    let html = '';
    list.slice(0, 10).forEach((item, i) => {
      const cls = i < 3 ? ' dino-lb__row--top' : '';
      const d = item.difficulty || 'medium';
      html += '<div class="dino-lb__row' + cls + '">' +
        '<span>' + (i + 1) + '</span>' +
        '<span>' + escapeHtml(item.nick) + '</span>' +
        '<span class="dino-lb__diff dino-lb__diff--' + d + '">' + diffLabel(d) + '</span>' +
        '<span>' + Math.floor(item.score) + '</span>' +
        '</div>';
    });
    el.innerHTML = html;
  }

  try {
    if (!localStorage.getItem('dinoAnonCleanupDone')) {
      const raw = localStorage.getItem(LB_KEY);
      if (raw) {
        const list = JSON.parse(raw) || [];
        const cleaned = list.filter(item => item && item.nick && item.nick !== 'Аноним');
        localStorage.setItem(LB_KEY, JSON.stringify(cleaned));
      }
      localStorage.setItem('dinoAnonCleanupDone', '1');
    }
  } catch (e) {}

  const nickInput = document.getElementById('dinoNick');
  if (nickInput) {
    try { nickInput.value = localStorage.getItem(NICK_KEY) || ''; } catch (e) {}
    nickInput.addEventListener('input', () => {
      try { localStorage.setItem(NICK_KEY, nickInput.value.trim()); } catch (e) {}
    });
  }

  /* ---------- АУДИО ---------- */
  const GameAudio = (function () {
    let actx = null;
    let muted = false;
    let musicTimer = null;
    let musicNextTime = 0;
    let musicIdx = 0;

    try { muted = localStorage.getItem('dinoMuted') === '1'; } catch (e) { muted = false; }

    function getCtx() {
      if (!actx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        try { actx = new AC(); } catch (e) { return null; }
      }
      if (actx.state === 'suspended') actx.resume().catch(() => {});
      return actx;
    }
    function playTone(freq, dur, type, vol, when) {
      if (muted) return;
      const c = getCtx(); if (!c || !freq) return;
      const t = when !== undefined ? when : c.currentTime;
      const osc = c.createOscillator(); const gain = c.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(vol || 0.06, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(gain); gain.connect(c.destination);
      osc.start(t); osc.stop(t + dur + 0.03);
    }
    function playMelody(notes, type, vol, gap) {
      if (muted) return;
      const c = getCtx(); if (!c) return;
      const t = c.currentTime;
      for (let i = 0; i < notes.length; i++) {
        const f = notes[i];
        const osc = c.createOscillator(); const g = c.createGain();
        osc.type = type;
        const st = t + i * gap;
        osc.frequency.setValueAtTime(f, st);
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime(vol, st + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, st + gap * 1.7);
        osc.connect(g); g.connect(c.destination);
        osc.start(st); osc.stop(st + gap * 1.9);
      }
    }
    function playSweep(f1, f2, type, vol, dur) {
      if (muted) return;
      const c = getCtx(); if (!c) return;
      const t = c.currentTime;
      const osc = c.createOscillator(); const g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(f1, t);
      osc.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.03);
      osc.connect(g); g.connect(c.destination);
      osc.start(t); osc.stop(t + dur + 0.05);
    }

    function pickupJump(lv) {
      const n = lv >= 3 ? [523, 659, 784, 1047, 1319] : lv === 2 ? [523, 659, 784, 1047] : [523, 659, 784];
      playMelody(n, 'square', 0.065, 0.05);
    }
    function expireJump() { playMelody([1047, 784, 523], 'square', 0.055, 0.055); }
    function pickupScore(lv) {
      const n = lv >= 3 ? [784, 988, 1175, 1568] : lv === 2 ? [784, 988, 1175] : [784, 988];
      playMelody(n, 'triangle', 0.085, 0.05);
    }
    function expireScore() { playMelody([1175, 988, 784, 587], 'triangle', 0.06, 0.065); }
    function pickupSpeed(lv) { playSweep(300, 1300 + lv * 150, 'sawtooth', 0.075, 0.2); }
    function expireSpeed() { playSweep(1300, 200, 'sawtooth', 0.06, 0.22); }
    function pickupShield(lv) {
      const n = lv >= 3 ? [440, 554, 659, 880] : lv === 2 ? [440, 554, 659] : [440, 554];
      playMelody(n, 'sine', 0.09, 0.07);
    }
    function expireShield() { playMelody([659, 440], 'sine', 0.07, 0.1); }
    function pickupMagnet(lv) {
      playSweep(280, 1000 + lv * 80, 'triangle', 0.09, 0.3);
      playMelody([500, 700, 900], 'sine', 0.05, 0.08);
    }
    function expireMagnet() { playSweep(1000, 200, 'triangle', 0.07, 0.3); }
    function pickupKnife(lv) {
      playSweep(2000, 900, 'square', 0.07, 0.09);
      playSweep(2600, 1300, 'sawtooth', 0.055, 0.08);
    }
    function expireKnife() { playSweep(900, 220, 'square', 0.055, 0.2); }
    function pickupAxe(lv) {
      playSweep(1800, 700, 'square', 0.08, 0.1);
      playSweep(2400, 1100, 'sawtooth', 0.06, 0.09);
      playMelody([392, 523, 659], 'triangle', 0.05, 0.06);
    }
    function expireAxe() { playSweep(700, 180, 'square', 0.06, 0.22); }
    function coinPickup() { playMelody([659, 880], 'square', 0.06, 0.045); }

    function sfxJump() {
      if (muted) return;
      const c = getCtx(); if (!c) return;
      const t = c.currentTime;
      const osc = c.createOscillator(); const g = c.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(320, t);
      osc.frequency.exponentialRampToValueAtTime(680, t + 0.09);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      osc.connect(g); g.connect(c.destination);
      osc.start(t); osc.stop(t + 0.14);
    }
    function sfxHitBox() {
      if (muted) return;
      const c = getCtx(); if (!c) return;
      const t = c.currentTime;
      for (let i = 0; i < 2; i++) {
        const osc = c.createOscillator(); const g = c.createGain();
        osc.type = 'square';
        const st = t + i * 0.025;
        osc.frequency.setValueAtTime(220 - i * 60, st);
        osc.frequency.exponentialRampToValueAtTime(50, st + 0.1);
        g.gain.setValueAtTime(0.1, st);
        g.gain.exponentialRampToValueAtTime(0.0001, st + 0.12);
        osc.connect(g); g.connect(c.destination);
        osc.start(st); osc.stop(st + 0.14);
      }
    }
    function sfxKillBird() {
      if (muted) return;
      const c = getCtx(); if (!c) return;
      const t = c.currentTime;
      const osc = c.createOscillator(); const g = c.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(950, t);
      osc.frequency.exponentialRampToValueAtTime(180, t + 0.2);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(g); g.connect(c.destination);
      osc.start(t); osc.stop(t + 0.24);
    }
    function sfxArrow() {
      if (muted) return;
      const c = getCtx(); if (!c) return;
      const t = c.currentTime;
      const o1 = c.createOscillator(); const g1 = c.createGain();
      o1.type = 'sawtooth';
      o1.frequency.setValueAtTime(1200, t);
      o1.frequency.exponentialRampToValueAtTime(300, t + 0.15);
      g1.gain.setValueAtTime(0.0001, t);
      g1.gain.exponentialRampToValueAtTime(0.09, t + 0.01);
      g1.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o1.connect(g1); g1.connect(c.destination);
      o1.start(t); o1.stop(t + 0.2);

      const o2 = c.createOscillator(); const g2 = c.createGain();
      o2.type = 'triangle';
      o2.frequency.setValueAtTime(220, t);
      o2.frequency.exponentialRampToValueAtTime(80, t + 0.2);
      g2.gain.setValueAtTime(0.0001, t);
      g2.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o2.connect(g2); g2.connect(c.destination);
      o2.start(t); o2.stop(t + 0.24);
    }

    function sfxDeath() {
      if (muted) return;
      const c = getCtx(); if (!c) return;
      const t = c.currentTime;
      const notes = [
        { f: 392, dur: 0.14 }, { f: 370, dur: 0.14 },
        { f: 349, dur: 0.14 }, { f: 294, dur: 0.65 }
      ];
      let time = t;
      for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(n.f, time);
        if (i === notes.length - 1) osc.frequency.linearRampToValueAtTime(n.f * 0.82, time + n.dur);
        g.gain.setValueAtTime(0.0001, time);
        g.gain.exponentialRampToValueAtTime(0.12, time + 0.02);
        g.gain.setValueAtTime(0.12, time + n.dur * 0.5);
        g.gain.exponentialRampToValueAtTime(0.0001, time + n.dur + 0.06);
        osc.connect(g); g.connect(c.destination);
        osc.start(time); osc.stop(time + n.dur + 0.1);
        time += n.dur * 0.9;
      }
    }

    const MELODY = [
      [440, 0.5], [523, 0.5], [659, 0.5], [880, 0.5],
      [659, 0.5], [523, 0.5], [440, 0.5], [0, 0.5],
      [494, 0.5], [587, 0.5], [740, 0.5], [988, 0.5],
      [740, 0.5], [587, 0.5], [494, 0.5], [0, 0.5]
    ];
    const BASS = [
      [110, 1], [110, 1], [131, 1], [123, 1],
      [110, 1], [110, 1], [131, 1], [147, 1]
    ];
    function startMusic() {
      if (muted) return;
      const c = getCtx(); if (!c) return;
      if (musicTimer) return;
      musicNextTime = c.currentTime;
      musicIdx = 0;
      function schedule() {
        const c2 = getCtx(); if (!c2) return;
        while (musicNextTime < c2.currentTime + 0.5) {
          const speedMul = getMusicSpeedMul();
          const beat = (60 / 135) / speedMul;
          const [f, b] = MELODY[musicIdx % MELODY.length];
          if (f) playTone(f, b * beat * 0.85, 'square', 0.04, musicNextTime);
          if (musicIdx % 4 === 0) {
            const bi = Math.floor(musicIdx / 4) % BASS.length;
            const [bf, bb] = BASS[bi];
            playTone(bf, bb * beat * 1.5, 'triangle', 0.05, musicNextTime);
          }
          musicNextTime += b * beat;
          musicIdx++;
        }
      }
      schedule();
      musicTimer = setInterval(schedule, 180);
    }
    function stopMusic() { if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }
    function setMuted(v) {
      muted = !!v;
      try { localStorage.setItem('dinoMuted', muted ? '1' : '0'); } catch (e) {}
      if (muted) stopMusic();
    }
    function isMuted() { return muted; }

    return {
      jump: sfxJump,
      hitBox: sfxHitBox,
      killBird: sfxKillBird,
      arrow: sfxArrow,
      death: sfxDeath,
      coinPickup,
      pickupJump, pickupScore, pickupSpeed, pickupShield, pickupMagnet, pickupKnife, pickupAxe,
      expireJump, expireScore, expireSpeed, expireShield, expireMagnet, expireKnife, expireAxe,
      startMusic, stopMusic, setMuted, isMuted
    };
  })();

  /* ---------- RESIZE ---------- */
  function resize() {
    const oldGroundY = groundY;
    const rect = canvas.getBoundingClientRect();
    W = Math.max(0, rect.width);
    H = Math.max(0, rect.height);
    if (W === 0 || H === 0) return;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    groundY = H - 26;
    gradientCache.clear();

    if (oldGroundY > 0 && oldGroundY !== groundY) {
      const delta = groundY - oldGroundY;
      for (let i = 0; i < obstacles.length; i++) obstacles[i].y += delta;
      for (let i = 0; i < walkers.length; i++) walkers[i].y += delta;
      for (let i = 0; i < arrows.length; i++) arrows[i].y += delta;
      for (let i = 0; i < knives.length; i++) knives[i].y += delta;
      for (let i = 0; i < axes.length; i++) axes[i].y += delta;
      for (let i = 0; i < blocks.length; i++) blocks[i].y += delta;
      for (let i = 0; i < pickups.length; i++) pickups[i].y += delta;
      for (let i = 0; i < particles.length; i++) particles[i].y += delta;
      for (let i = 0; i < effects.length; i++) {
        const e = effects[i];
        if (e.type === 'fly') e.startY += delta;
        else e.y += delta;
      }
      if (!hamster.onGround) hamster.y += delta;
    }
    if (hamster.onGround) hamster.y = groundY;
    if (paused) render();
    syncOverlay();
  }
  resize();

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 150);
  });
  if (window.ResizeObserver) {
    new ResizeObserver(resize).observe(canvas);
  }

  /* ---------- ХЕЛПЕРЫ СЕТКИ ---------- */
  function spawnCellX() { return Math.ceil((W + 4) / GRID_CELL) * GRID_CELL; }
  function isRightColumnBusy() {
    const threshold = W - GRID_CELL;
    for (let i = 0; i < obstacles.length; i++) if (obstacles[i].x + obstacles[i].w > threshold) return true;
    for (let i = 0; i < walkers.length; i++) if (walkers[i].x + walkers[i].w > threshold) return true;
    for (let i = 0; i < blocks.length; i++) if (blocks[i].x + blocks[i].w > threshold) return true;
    for (let i = 0; i < pickups.length; i++) if (pickups[i].x + pickups[i].w > threshold) return true;
    return false;
  }

  /* ---------- ЗВУК / ПАУЗА / СПРИНТ / FULLSCREEN ---------- */
  const muteBtn = document.getElementById('dinoMute');
  function updateMuteUI() {
    if (!muteBtn) return;
    const m = GameAudio.isMuted();
    muteBtn.textContent = 'Звук';
    muteBtn.title = m ? 'Включить звук' : 'Выключить звук';
    muteBtn.classList.toggle('is-muted', m);
  }
  if (muteBtn) {
    muteBtn.addEventListener('click', e => {
      e.preventDefault();
      GameAudio.setMuted(!GameAudio.isMuted());
      updateMuteUI();
      updateMusicState();
    });
  }
  updateMuteUI();

  const pauseBtn = document.getElementById('dinoPause');
  function updatePauseUI() {
    if (!pauseBtn) return;
    pauseBtn.textContent = paused ? 'Продолжить' : 'Пауза';
    pauseBtn.classList.toggle('is-active', paused);
  }
  if (pauseBtn) {
    pauseBtn.addEventListener('click', e => {
      e.preventDefault();
      if (gameState !== 'playing') return;
      paused = !paused;
      updatePauseUI();
      updateMusicState();
      if (paused) render();
    });
  }
  updatePauseUI();

  const sprintBtn = document.getElementById('dinoSprint');
  function setSprint(v) {
    sprinting = !!v;
    if (sprintBtn) sprintBtn.classList.toggle('is-active', sprinting);
  }
  if (sprintBtn) {
    const onDown = e => { e.preventDefault(); setSprint(true); };
    const onUp = e => { e.preventDefault(); setSprint(false); };
    sprintBtn.addEventListener('pointerdown', onDown);
    sprintBtn.addEventListener('pointerup', onUp);
    sprintBtn.addEventListener('pointerleave', onUp);
    sprintBtn.addEventListener('pointercancel', onUp);
  }
  document.addEventListener('keydown', e => {
    if ((e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') && gameState === 'playing' && !paused) setSprint(true);
  });
  document.addEventListener('keyup', e => {
    if (e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') setSprint(false);
  });
  window.addEventListener('blur', () => setSprint(false));

  const fullscreenBtn = document.getElementById('dinoFullscreen');

  function isNativeFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
  }
  function updateFullscreenUI() {
    if (!fullscreenBtn || !dinoWrap) return;
    const active = dinoWrap.classList.contains('is-fullscreen');
    fullscreenBtn.textContent = active ? 'Свернуть' : 'На весь экран';
    fullscreenBtn.classList.toggle('is-active', active);
  }
  function forceResize() {
    requestAnimationFrame(() => {
      resize();
      setTimeout(resize, 30);
      setTimeout(resize, 80);
      setTimeout(resize, 180);
      setTimeout(resize, 400);
      setTimeout(resize, 700);
    });
  }
  function enterFullscreen() {
    if (!dinoWrap) return;
    dinoWrap.classList.add('is-fullscreen');
    updateFullscreenUI();
    forceResize();
    const req = dinoWrap.requestFullscreen || dinoWrap.webkitRequestFullscreen || dinoWrap.mozRequestFullScreen || dinoWrap.msRequestFullscreen;
    if (req) {
      try { const r = req.call(dinoWrap); if (r && typeof r.catch === 'function') r.catch(() => {}); } catch (err) {}
    }
  }
  function exitFullscreenMode() {
    if (!dinoWrap) return;
    dinoWrap.classList.remove('is-fullscreen');
    updateFullscreenUI();
    forceResize();
    if (isNativeFullscreen()) {
      try {
        if (document.exitFullscreen) { const r = document.exitFullscreen(); if (r && typeof r.catch === 'function') r.catch(() => {}); }
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
        else if (document.msExitFullscreen) document.msExitFullscreen();
      } catch (err) {}
    }
  }
  if (fullscreenBtn && dinoWrap) {
    fullscreenBtn.addEventListener('click', e => {
      e.preventDefault();
      if (dinoWrap.classList.contains('is-fullscreen')) exitFullscreenMode();
      else enterFullscreen();
    });
  }
  function onNativeFullscreenChange() {
    if (!isNativeFullscreen() && dinoWrap && dinoWrap.classList.contains('is-fullscreen')) {
      dinoWrap.classList.remove('is-fullscreen');
      updateFullscreenUI();
      forceResize();
    }
  }
  document.addEventListener('fullscreenchange', onNativeFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onNativeFullscreenChange);
  document.addEventListener('mozfullscreenchange', onNativeFullscreenChange);
  document.addEventListener('MSFullscreenChange', onNativeFullscreenChange);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && dinoWrap && dinoWrap.classList.contains('is-fullscreen') && !isNativeFullscreen()) exitFullscreenMode();
  });
  updateFullscreenUI();

  /* ---------- UI: ЛЕГЕНДА УЛУЧШЕНИЙ ---------- */
  function injectStyles() {
    const css = `
      .dino-overlay-ui { position: absolute; pointer-events: none; z-index: 6; }
      .dino-legend {
        position: absolute;
        top: 6px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        align-items: center;
        gap: 3px 12px;
        max-width: calc(100% - 16px);
        padding: 6px 10px;
        background: rgba(10, 10, 15, 0.72);
        color: #ede8e3;
        font: 10px/1.35 ui-monospace, "SF Mono", Menlo, monospace;
        border-radius: 8px;
        pointer-events: none;
        backdrop-filter: blur(4px);
        -webkit-backdrop-filter: blur(4px);
        border: 1px solid rgba(255,255,255,0.12);
        box-shadow: 0 4px 14px rgba(0,0,0,0.35);
      }
      .dino-legend__row { display: inline-flex; gap: 3px; align-items: baseline; white-space: nowrap; }
      .dino-legend__icon { width: 12px; text-align: center; flex-shrink: 0; font-size: 11px; }
      .dino-legend__name { font-weight: 700; }
      .dino-legend__desc { opacity: 0.72; font-size: 9px; }
      @media (max-width: 640px) {
        .dino-legend { font-size: 9px; padding: 4px 8px; gap: 2px 8px; max-width: calc(100% - 10px); }
        .dino-legend__icon { font-size: 10px; }
        .dino-legend__desc { font-size: 8px; }
      }
    `;
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  function buildOverlayUI() {
    if (!dinoWrap || !canvas) return;
    if (getComputedStyle(dinoWrap).position === 'static') dinoWrap.style.position = 'relative';

    overlayUI = document.createElement('div');
    overlayUI.className = 'dino-overlay-ui';
    overlayUI.style.display = 'none';
    dinoWrap.appendChild(overlayUI);

    legendEl = document.createElement('div');
    legendEl.className = 'dino-legend';
    legendEl.innerHTML =
      '<div class="dino-legend__row"><span class="dino-legend__icon">🛡️</span><span><b style="color:#50c8ff">Щит</b></span></div>' +
      '<div class="dino-legend__row"><span class="dino-legend__icon">⬆️</span><span><b style="color:#4ade80">Прыжок</b></span></div>' +
      '<div class="dino-legend__row"><span class="dino-legend__icon">💰</span><span><b style="color:#ffd700">Очки</b><span class="dino-legend__desc">×2</span></span></div>' +
      '<div class="dino-legend__row"><span class="dino-legend__icon">⚡</span><span><b style="color:#50d8ff">Скорость</b></span></div>' +
      '<div class="dino-legend__row"><span class="dino-legend__icon">🧲</span><span><b style="color:#f472b6">Магнит</b></span></div>' +
      '<div class="dino-legend__row"><span class="dino-legend__icon">🔪</span><span><b style="color:#e2e8f0">Нож</b> <span class="dino-legend__desc">-1 враг</span></span></div>' +
      '<div class="dino-legend__row"><span class="dino-legend__icon">🪓</span><span><b style="color:#f59e0b">Топор</b> <span class="dino-legend__desc">-3 врага</span></span></div>' +
      '<div class="dino-legend__row"><span class="dino-legend__icon">🪙</span><span><b style="color:#f39c12">Монета</b> <span class="dino-legend__desc">+30 очков</span></span></div>';
    overlayUI.appendChild(legendEl);

    syncOverlay();
  }

  function syncOverlay() {
    if (!overlayUI || !canvas || !dinoWrap) return;
    const wrapRect = dinoWrap.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    if (canvasRect.width === 0 || canvasRect.height === 0) return;
    overlayUI.style.top = (canvasRect.top - wrapRect.top) + 'px';
    overlayUI.style.left = (canvasRect.left - wrapRect.left) + 'px';
    overlayUI.style.width = canvasRect.width + 'px';
    overlayUI.style.height = canvasRect.height + 'px';
  }

  function setOverlayVisible(v) {
    if (overlayUI) overlayUI.style.display = v ? '' : 'none';
  }

  injectStyles();
  buildOverlayUI();

  /* ---------- МЕНЮ ---------- */
  const menuRecord = document.getElementById('dinoMenuRecord');
  const playBtn = document.getElementById('dinoPlay');
  const diffButtons = document.querySelectorAll('.dino-diff-btn');

  function updateMenuRecord() { if (menuRecord) menuRecord.textContent = Math.floor(hiScore); }
  function updateDiffButtons() {
    diffButtons.forEach(b => b.classList.toggle('is-active', b.dataset.difficulty === difficulty));
  }
  function showMenu() {
    gameState = 'menu';
    if (dinoWrap) dinoWrap.classList.add('is-menu');
    updateMenuRecord();
    updateDiffButtons();
    updateMusicState();
    obstacles = []; walkers = []; arrows = []; knives = []; axes = [];
    blocks = []; pickups = []; particles = []; effects = []; shatterBlocks = [];
    score = 0; frameCount = 0;
    hamster.x = 40; hamster.y = groundY; hamster.vy = 0; hamster.onGround = true; hamster.legFrame = 0;
    setOverlayVisible(false);
  }
  function hideMenu() {
    if (dinoWrap) dinoWrap.classList.remove('is-menu');
    setOverlayVisible(true);
  }

  diffButtons.forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      if (gameState !== 'menu') return;
      const d = btn.dataset.difficulty;
      if (!DIFFICULTY[d]) return;
      difficulty = d;
      hiScore = loadHiScore(difficulty);
      try { localStorage.setItem('dinoDifficulty', difficulty); } catch (e) {}
      updateDiffButtons();
      updateMenuRecord();
    });
  });

  if (playBtn) {
    playBtn.addEventListener('click', e => {
      e.preventDefault();
      if (gameState === 'menu') startGame();
    });
  }

  function startGame() {
    if (W === 0 || H === 0) {
      resize();
      if (W === 0 || H === 0) return;
    }
    hideMenu();
    hamster.x = 40; hamster.y = groundY; hamster.vy = 0; hamster.onGround = true; hamster.legFrame = 0;
    obstacles = []; walkers = []; arrows = []; knives = []; axes = [];
    blocks = []; pickups = []; particles = []; effects = []; shatterBlocks = [];
    speed = START_SPEED; score = 0; frameCount = 0;
    shieldLevel = 0;
    jumpBoostLevel = 0; jumpBoostFrames = 0;
    scoreBoostLevel = 0; scoreBoostFrames = 0;
    speedBoostLevel = 0; speedBoostFrames = 0;
    magnetLevel = 0; magnetFrames = 0;
    knifeLevel = 0; knifeFrames = 0; knifeCooldown = 0;
    axeLevel = 0; axeFrames = 0; axeCooldown = 0;
    const dcfg = DIFFICULTY[difficulty] || DIFFICULTY.medium;
    nextCactusAt = 60 * dcfg.intervalMul;
    nextBirdAt = 260 * dcfg.intervalMul;
    nextWalkerAt = 420 * dcfg.intervalMul;
    nextSkeletonAt = 700 * dcfg.intervalMul;
    nextBlockAt = 150 * dcfg.intervalMul;
    nextPickupAt = 250 * dcfg.intervalMul;
    scoreSavedThisRun = false;
    paused = false;
    setSprint(false);
    updatePauseUI();
    shuffleBgOrder();
    gameState = 'playing';
    updateMusicState();
  }

  /* ---------- БУСТЫ ---------- */
  function getJumpV() {
    const idx = jumpBoostFrames > 0 ? jumpBoostLevel : 0;
    return JUMP_V[idx] || JUMP_V[0];
  }
  function getScoreRate() {
    let rate = 0.2;
    if (scoreBoostFrames > 0) rate *= (1 + scoreBoostLevel);
    if (speedBoostFrames > 0) rate *= (1 + speedBoostLevel * 0.3);
    return rate;
  }
  function getSpeedMul() {
    let m = 1;
    if (sprinting) m *= SPRINT_MUL;
    if (speedBoostFrames > 0) m *= (1 + speedBoostLevel * 0.15);
    const dcfg = DIFFICULTY[difficulty] || DIFFICULTY.medium;
    m *= dcfg.speedMul;
    return m;
  }
  function applyJumpBoost() {
    if (jumpBoostLevel < MAX_BOOST_LEVEL) jumpBoostLevel++;
    jumpBoostFrames = 300 + (jumpBoostLevel - 1) * 60;
    GameAudio.pickupJump(jumpBoostLevel);
    spawnFlyEffect('jump');
  }
  function applyScoreBoost() {
    if (scoreBoostLevel < MAX_BOOST_LEVEL) scoreBoostLevel++;
    scoreBoostFrames = 360 + (scoreBoostLevel - 1) * 60;
    GameAudio.pickupScore(scoreBoostLevel);
    spawnFlyEffect('score');
  }
  function applySpeedBoost() {
    if (speedBoostLevel < MAX_BOOST_LEVEL) speedBoostLevel++;
    speedBoostFrames = 300 + (speedBoostLevel - 1) * 60;
    GameAudio.pickupSpeed(speedBoostLevel);
    spawnFlyEffect('speed');
  }
  function applyShield() {
    if (shieldLevel < MAX_BOOST_LEVEL) shieldLevel++;
    GameAudio.pickupShield(shieldLevel);
    spawnFlyEffect('shield');
  }
  function applyMagnet() {
    if (magnetLevel < MAX_BOOST_LEVEL) magnetLevel++;
    magnetFrames = 900 + (magnetLevel - 1) * 300;
    GameAudio.pickupMagnet(magnetLevel);
    spawnFlyEffect('magnet');
  }
  function applyKnife() {
    if (knifeLevel < MAX_BOOST_LEVEL) knifeLevel++;
    knifeFrames = 600 + (knifeLevel - 1) * 180;
    knifeCooldown = 0;
    GameAudio.pickupKnife(knifeLevel);
    spawnFlyEffect('knife');
  }
  function applyAxe() {
    if (axeLevel < MAX_BOOST_LEVEL) axeLevel++;
    axeFrames = 600 + (axeLevel - 1) * 180;
    axeCooldown = 0;
    GameAudio.pickupAxe(axeLevel);
    spawnFlyEffect('axe');
  }

  /* ---------- ЛЕТЯЩИЕ ЭФФЕКТЫ ---------- */
  function getHudYFor(type) {
    let y = 10;
    if (sprinting) y += 20;
    if (shieldLevel > 0) { if (type === 'shield') return y; y += 20; }
    if (jumpBoostFrames > 0) { if (type === 'jump') return y; y += 20; }
    if (scoreBoostFrames > 0) { if (type === 'score') return y; y += 20; }
    if (speedBoostFrames > 0) { if (type === 'speed') return y; y += 20; }
    if (magnetFrames > 0) { if (type === 'magnet') return y; y += 20; }
    if (axeFrames > 0) { if (type === 'axe') return y; y += 20; }
    if (knifeFrames > 0) { if (type === 'knife') return y; }
    return y;
  }
  const FLY_COLORS = {
    shield: '#50c8ff', jump: '#4ade80', score: '#ffd700',
    speed: '#50d8ff', magnet: '#f472b6', knife: '#e2e8f0', axe: '#f59e0b'
  };
  function spawnFlyEffect(type) {
    const startX = hamster.x + hamster.w / 2;
    const startY = hamster.y - hamster.h / 2;
    const endX = 22;
    const endY = getHudYFor(type) + 10;
    effects.push({
      type: 'fly',
      x: startX, y: startY,
      startX, startY,
      endX, endY,
      color: FLY_COLORS[type] || '#fff',
      life: 1
    });
  }

  function spawnSpeedTrail() {
    const hx = hamster.x + hamster.w * 0.35;
    const hy = hamster.y - hamster.h * 0.55 + (Math.random() - 0.5) * 12;
    effects.push({ type: 'speed', x: hx, y: hy, vx: -2.5 - Math.random() * 2, vy: (Math.random() - 0.5) * 0.6, life: 1, size: 3 + Math.random() * 3 });
  }
  function spawnJumpArrow() {
    const hx = hamster.x + hamster.w * 0.5 + (Math.random() - 0.5) * 16;
    effects.push({ type: 'jump', x: hx, y: hamster.y + 3, vx: (Math.random() - 0.5) * 0.4, vy: -1.2 - Math.random() * 1, life: 1, size: 3 + Math.random() * 2 });
  }

  function updateEffects() {
    if (gameState === 'playing' && !paused) {
      if (speedBoostFrames > 0 && (frameCount & 1) === 0) spawnSpeedTrail();
      if (jumpBoostFrames > 0 && (frameCount & 3) === 0) spawnJumpArrow();
    }
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      if (e.type === 'fly') {
        e.life -= 0.022;
        if (e.life <= 0) { effects.splice(i, 1); continue; }
        const t = 1 - e.life;
        const eased = 1 - Math.pow(1 - t, 2.5);
        const bump = Math.sin(t * Math.PI) * 20;
        e.x = e.startX + (e.endX - e.startX) * eased;
        e.y = e.startY + (e.endY - e.startY) * eased - bump;
      } else {
        e.x += e.vx;
        e.y += e.vy;
        e.life -= 0.028;
        if (e.life <= 0) effects.splice(i, 1);
      }
    }
  }

  function drawEffects() {
    for (let i = 0; i < effects.length; i++) {
      const e = effects[i];
      const a = e.life;
      if (e.type === 'speed') {
        ctx.globalAlpha = a * 0.55;
        ctx.fillStyle = '#2a9cff';
        ctx.beginPath(); ctx.ellipse(e.x, e.y, e.size * 2.4, e.size * 0.9, 0, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = a * 0.9;
        ctx.fillStyle = '#9ee8ff';
        ctx.beginPath(); ctx.ellipse(e.x, e.y, e.size * 1.2, e.size * 0.5, 0, 0, Math.PI * 2); ctx.fill();
      } else if (e.type === 'jump') {
        const s = e.size;
        ctx.globalAlpha = a * 0.5;
        ctx.fillStyle = '#22c55e';
        ctx.beginPath(); ctx.moveTo(e.x, e.y - s * 3); ctx.lineTo(e.x - s * 1.5, e.y); ctx.lineTo(e.x + s * 1.5, e.y); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = a;
        ctx.fillStyle = '#4ade80';
        ctx.beginPath(); ctx.moveTo(e.x, e.y - s * 2.2); ctx.lineTo(e.x - s, e.y); ctx.lineTo(e.x + s, e.y); ctx.closePath(); ctx.fill();
        ctx.fillRect(e.x - s * 0.35, e.y, s * 0.7, s * 1.4);
        ctx.globalAlpha = a * 0.6;
        ctx.fillStyle = '#a7f3d0';
        ctx.beginPath(); ctx.moveTo(e.x, e.y - s * 1.8); ctx.lineTo(e.x - s * 0.4, e.y - s * 0.6); ctx.lineTo(e.x + s * 0.4, e.y - s * 0.6); ctx.closePath(); ctx.fill();
      } else if (e.type === 'fly') {
        ctx.globalAlpha = Math.min(1, e.life * 3);
        ctx.fillStyle = e.color;
        ctx.beginPath(); ctx.arc(e.x, e.y, 8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  /* ---------- 21 ФОН ---------- */
  function starsInSky(count, baseColor, yMax) {
    const t = frameCount * 0.015;
    const yy = yMax || H * 0.65;
    for (let i = 0; i < count; i++) {
      const sx = ((i * 173 + 37) % 1000) * W / 1000;
      const sy = ((i * 97 + 19) % 600) * yy / 600;
      const tw = 0.35 + Math.abs(Math.sin(t + i * 0.7)) * 0.65;
      ctx.fillStyle = 'rgba(' + baseColor + ',' + tw.toFixed(2) + ')';
      ctx.fillRect(sx, sy, 1.5, 1.5);
    }
  }

  function bg1_stars() {
    fillGrad('#0a0e1a', '#1a1f2e');
    starsInSky(45, '255,255,240');
    ctx.fillStyle = 'rgba(240,235,220,0.85)';
    ctx.beginPath(); ctx.arc(W * 0.82, H * 0.18, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(180,175,160,0.45)';
    ctx.beginPath(); ctx.arc(W * 0.79, H * 0.14, 4, 0, Math.PI * 2); ctx.arc(W * 0.86, H * 0.21, 3, 0, Math.PI * 2); ctx.fill();
  }
  function bg2_cats() {
    fillGrad('#1a1210', '#2a1e15');
    ctx.fillStyle = 'rgba(10,7,5,0.75)';
    for (let i = 0; i < 3; i++) {
      const x = W * (0.2 + i * 0.3), y = groundY;
      ctx.beginPath(); ctx.ellipse(x, y - 20, 22, 20, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x + 15, y - 35, 12, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 8, y - 42); ctx.lineTo(x + 12, y - 55); ctx.lineTo(x + 18, y - 44); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x + 18, y - 44); ctx.lineTo(x + 24, y - 55); ctx.lineTo(x + 26, y - 42); ctx.closePath(); ctx.fill();
    }
    const t = frameCount * 0.02;
    for (let i = 0; i < 6; i++) {
      const x = ((i * 173 + 60) * 5) % W;
      const y = 40 + ((i * 97) % Math.floor(groundY * 0.5));
      const glow = 0.4 + Math.abs(Math.sin(t + i)) * 0.5;
      ctx.fillStyle = 'rgba(255,190,80,' + glow.toFixed(2) + ')';
      ctx.beginPath(); ctx.ellipse(x - 4, y, 2.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x + 4, y, 2.5, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  function bg3_monsters() {
    fillGrad('#1a0e2a', '#251538');
    ctx.fillStyle = 'rgba(70,25,95,0.55)';
    for (let i = 0; i < 4; i++) {
      const x = W * (0.15 + i * 0.22);
      ctx.beginPath(); ctx.ellipse(x, groundY - 10, 30, 22, 0, 0, Math.PI * 2); ctx.fill();
    }
    const t = frameCount * 0.03;
    for (let i = 0; i < 4; i++) {
      const x = W * (0.15 + i * 0.22), y = groundY - 18;
      const glow = 0.55 + Math.abs(Math.sin(t + i)) * 0.45;
      ctx.fillStyle = 'rgba(255,40,40,' + glow.toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(x - 7, y, 3, 0, Math.PI * 2); ctx.arc(x + 7, y, 3, 0, Math.PI * 2); ctx.fill();
    }
  }
  function bg4_forest() {
    fillGrad('#0a1810', '#132318');
    ctx.fillStyle = 'rgba(0,20,0,0.65)';
    for (let i = 0; i < 8; i++) {
      const x = W * (0.05 + i * 0.12), h = 60 + (i % 3) * 30;
      ctx.fillRect(x - 3, groundY - h, 6, h);
      ctx.beginPath(); ctx.moveTo(x, groundY - h - 40); ctx.lineTo(x - 20, groundY - h + 10); ctx.lineTo(x + 20, groundY - h + 10); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x, groundY - h - 20); ctx.lineTo(x - 15, groundY - h + 20); ctx.lineTo(x + 15, groundY - h + 20); ctx.closePath(); ctx.fill();
    }
  }
  function bg5_city() {
    fillGrad('#0e0e18', '#1a1a24');
    for (let i = 0; i < 7; i++) {
      const x = W * (0.05 + i * 0.14), w = 30 + (i % 3) * 15, h = 50 + (i % 4) * 40;
      ctx.fillStyle = 'rgba(20,20,30,0.9)';
      ctx.fillRect(x - w / 2, groundY - h, w, h);
      ctx.fillStyle = 'rgba(255,210,110,0.5)';
      for (let wy = groundY - h + 10; wy < groundY - 10; wy += 14) {
        for (let wx = x - w / 2 + 6; wx < x + w / 2 - 6; wx += 10) {
          if (((wx * 7 + wy * 13 + i * 17) % 5) < 2) continue;
          ctx.fillRect(wx, wy, 3, 4);
        }
      }
    }
  }
  function bg6_space() {
    fillGrad('#0a0a1e', '#1a0a2a');
    starsInSky(50, '200,220,255', H * 0.9);
    ctx.fillStyle = 'rgba(180,100,200,0.7)';
    ctx.beginPath(); ctx.arc(W * 0.75, H * 0.25, 30, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(220,200,255,0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(W * 0.75, H * 0.25, 42, 8, -0.3, 0, Math.PI * 2); ctx.stroke();
  }
  function bg7_sunset() {
    fillGrad('#2a1020', '#8a3a10');
    ctx.fillStyle = 'rgba(255,180,80,0.7)';
    ctx.beginPath(); ctx.arc(W * 0.5, groundY - 60, 40, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(80,30,40,0.5)';
    for (let i = 0; i < 4; i++) {
      const x = W * (0.1 + i * 0.25), y = H * 0.3 + (i % 2) * 20;
      ctx.beginPath(); ctx.ellipse(x, y, 40, 10, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  function bg8_ocean() {
    fillGrad('#0a1a2a', '#1a4a6a');
    const t = frameCount * 0.02;
    for (let y = groundY - 40; y < groundY; y += 15) {
      ctx.strokeStyle = 'rgba(100,180,220,0.35)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let x = 0; x <= W; x += 20) {
        const wy = y + Math.sin(x * 0.02 + t + y * 0.1) * 3;
        if (x === 0) ctx.moveTo(x, wy); else ctx.lineTo(x, wy);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 15; i++) {
      const bx = (i * 211) % W;
      const by = H - ((frameCount * 0.5 + i * 30) % H);
      ctx.fillStyle = 'rgba(180,220,240,0.2)';
      ctx.beginPath(); ctx.arc(bx, by, 2 + i % 3, 0, Math.PI * 2); ctx.fill();
    }
  }
  function bg9_desert() {
    fillGrad('#2a1a0a', '#5a3a1a');
    ctx.fillStyle = 'rgba(255,200,100,0.8)';
    ctx.beginPath(); ctx.arc(W * 0.7, H * 0.25, 35, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(80,50,20,0.7)';
    ctx.beginPath(); ctx.moveTo(0, groundY);
    for (let x = 0; x <= W; x += 40) {
      const y = groundY - 40 - Math.sin(x * 0.01) * 20 - Math.sin(x * 0.02 + 1) * 15;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, groundY); ctx.closePath(); ctx.fill();
  }
  function bg10_snow() {
    fillGrad('#1a2a3a', '#3a5a7a');
    const t = frameCount * 0.02;
    for (let i = 0; i < 40; i++) {
      const sx = ((i * 173 + 37) % 1000) * W / 1000;
      const sy = ((frameCount * 0.5 + i * 60) % (H + 20)) - 10;
      const r = 1 + i % 3;
      ctx.fillStyle = 'rgba(240,248,255,' + (0.5 + Math.abs(Math.sin(t + i)) * 0.5).toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(sx + Math.sin(t + i) * 5, sy, r, 0, Math.PI * 2); ctx.fill();
    }
  }
  function bg11_volcano() {
    fillGrad('#2a0505', '#5a1505');
    ctx.fillStyle = 'rgba(30,10,5,0.9)';
    ctx.beginPath();
    ctx.moveTo(W * 0.2, groundY); ctx.lineTo(W * 0.4, groundY - 180);
    ctx.lineTo(W * 0.5, groundY - 180); ctx.lineTo(W * 0.7, groundY);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,80,20,' + (0.6 + Math.sin(frameCount * 0.05) * 0.2).toFixed(2) + ')';
    ctx.fillRect(W * 0.4, groundY - 180, W * 0.1, 8);
  }
  function bg12_cyber() {
    fillGrad('#0a0018', '#1a0a2a');
    ctx.strokeStyle = 'rgba(255,40,200,0.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 30) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, groundY); }
    for (let y = groundY; y >= 0; y -= 30) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,200,255,0.3)';
    ctx.beginPath();
    for (let x = 0; x <= W; x += 120) { ctx.moveTo(x, groundY - 80); ctx.lineTo(x, groundY); }
    ctx.stroke();
  }
  function bg13_jungle() {
    fillGrad('#0a1a08', '#1a3a15');
    for (let i = 0; i < 10; i++) {
      const x = W * (0.05 + i * 0.1), h = 50 + (i % 4) * 30;
      ctx.fillStyle = 'rgba(10,40,15,0.7)';
      ctx.fillRect(x - 2, 0, 4, groundY - h);
      ctx.beginPath(); ctx.arc(x, groundY - h, 25, 0, Math.PI * 2); ctx.fill();
    }
  }
  function bg14_cave() {
    fillGrad('#0a0a0a', '#1a1510');
    for (let i = 0; i < 8; i++) {
      const x = W * (0.05 + i * 0.12), h = 30 + (i % 3) * 20;
      ctx.fillStyle = 'rgba(40,30,20,0.8)';
      ctx.beginPath(); ctx.moveTo(x - 10, 0); ctx.lineTo(x + 10, 0); ctx.lineTo(x, h); ctx.closePath(); ctx.fill();
    }
  }
  function bg15_aurora() {
    fillGrad('#050510', '#150a25');
    const t = frameCount * 0.01;
    for (let i = 0; i < 4; i++) {
      const yBase = 60 + i * 40;
      ctx.fillStyle = 'rgba(80,220,150,' + (0.15 + i * 0.05).toFixed(2) + ')';
      ctx.beginPath();
      for (let x = 0; x <= W; x += 20) {
        const wy = yBase + Math.sin(x * 0.015 + t + i) * 25;
        if (x === 0) ctx.moveTo(x, wy); else ctx.lineTo(x, wy);
      }
      for (let x = W; x >= 0; x -= 20) {
        const wy = yBase + 40 + Math.sin(x * 0.015 + t + i) * 25;
        ctx.lineTo(x, wy);
      }
      ctx.closePath(); ctx.fill();
    }
    starsInSky(30, '220,230,255', H * 0.6);
  }
  function bg16_rainy() {
    fillGrad('#1a1a20', '#2a2a35');
    const t = frameCount * 0.5;
    ctx.strokeStyle = 'rgba(150,180,220,0.3)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 30; i++) {
      const sx = (i * 173 + 37) % W;
      const sy = (t + i * 40) % (H + 30);
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - 3, sy + 15); ctx.stroke();
    }
  }
  function bg17_abstract() {
    fillGrad('#1a0a1a', '#0a1a1a');
    const t = frameCount * 0.005;
    const colors = ['rgba(255,100,150,0.15)', 'rgba(100,200,255,0.15)', 'rgba(255,220,100,0.15)', 'rgba(150,255,150,0.15)'];
    for (let i = 0; i < 6; i++) {
      const cx = W * (0.15 + (i % 3) * 0.35) + Math.sin(t + i) * 50;
      const cy = H * (0.2 + Math.floor(i / 3) * 0.4) + Math.cos(t + i) * 50;
      ctx.fillStyle = colors[i % colors.length];
      ctx.beginPath(); ctx.arc(cx, cy, 80, 0, Math.PI * 2); ctx.fill();
    }
  }
  function bg18_sakura() {
    fillGrad('#2a1520', '#4a2535');
    const t = frameCount * 0.02;
    for (let i = 0; i < 30; i++) {
      const sx = ((i * 173 + 37) % 1000) * W / 1000;
      const sy = ((frameCount * 0.3 + i * 40) % (H + 20)) - 10;
      ctx.save();
      ctx.translate(sx + Math.sin(t + i) * 15, sy);
      ctx.rotate((frameCount * 0.02 + i) % (Math.PI * 2));
      ctx.fillStyle = 'rgba(255,180,200,0.6)';
      ctx.beginPath(); ctx.ellipse(0, 0, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  function bg19_autumn() {
    fillGrad('#1a0e05', '#3a1e0a');
    const t = frameCount * 0.02;
    const colors = ['rgba(200,100,40,0.5)', 'rgba(180,80,30,0.5)', 'rgba(220,140,50,0.5)'];
    for (let i = 0; i < 25; i++) {
      const sx = ((i * 211 + 37) % 1000) * W / 1000;
      const sy = ((frameCount * 0.4 + i * 30) % (H + 20)) - 10;
      ctx.fillStyle = colors[i % 3];
      ctx.beginPath(); ctx.ellipse(sx + Math.sin(t + i) * 10, sy, 3, 4, Math.sin(t + i) * 0.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  function bg20_nightcity() {
    fillGrad('#050510', '#0a0a18');
    for (let i = 0; i < 8; i++) {
      const x = W * (0.05 + i * 0.12), w = 25 + (i % 3) * 12, h = 40 + (i % 4) * 35;
      ctx.fillStyle = 'rgba(15,15,25,0.95)';
      ctx.fillRect(x - w / 2, groundY - h, w, h);
      ctx.fillStyle = 'rgba(255,220,100,0.7)';
      for (let wy = groundY - h + 10; wy < groundY - 10; wy += 12) {
        for (let wx = x - w / 2 + 5; wx < x + w / 2 - 5; wx += 8) {
          if (((wx * 3 + wy * 7 + i) % 4) < 2) continue;
          ctx.fillRect(wx, wy, 3, 4);
        }
      }
    }
  }
  function bg21_mountain() {
    fillGrad('#0a1525', '#2a3a55');
    ctx.fillStyle = 'rgba(40,50,80,0.9)';
    ctx.beginPath();
    ctx.moveTo(0, groundY); ctx.lineTo(W * 0.15, groundY - 120); ctx.lineTo(W * 0.3, groundY);
    ctx.lineTo(W * 0.45, groundY - 160); ctx.lineTo(W * 0.65, groundY); ctx.lineTo(W * 0.8, groundY - 100);
    ctx.lineTo(W, groundY); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(240,245,255,0.7)';
    ctx.beginPath(); ctx.moveTo(W * 0.15, groundY - 120); ctx.lineTo(W * 0.13, groundY - 100); ctx.lineTo(W * 0.17, groundY - 100); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(W * 0.45, groundY - 160); ctx.lineTo(W * 0.42, groundY - 135); ctx.lineTo(W * 0.48, groundY - 135); ctx.closePath(); ctx.fill();
  }

  const BG_FUNCS = [
    bg1_stars, bg2_cats, bg3_monsters, bg4_forest, bg5_city, bg6_space, bg7_sunset,
    bg8_ocean, bg9_desert, bg10_snow, bg11_volcano, bg12_cyber, bg13_jungle, bg14_cave,
    bg15_aurora, bg16_rainy, bg17_abstract, bg18_sakura, bg19_autumn, bg20_nightcity, bg21_mountain
  ];

  function drawBackgrounds() {
    if (bgTransition < 1) {
      BG_FUNCS[bgPrevious % BG_FUNCS.length]();
      ctx.globalAlpha = bgTransition;
      BG_FUNCS[bgCurrent % BG_FUNCS.length]();
      ctx.globalAlpha = 1;
    } else {
      BG_FUNCS[bgCurrent % BG_FUNCS.length]();
    }
  }

  /* ---------- СЕТКА ---------- */
  function drawGrid() {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += GRID_CELL) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, groundY); }
    for (let y = groundY; y >= 0; y -= GRID_CELL) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
    ctx.stroke();
  }

  /* ---------- ПРЫЖОК / СМЕРТЬ ---------- */
  function jump() {
    if (gameState !== 'playing') return;
    if (paused) return;
    if (hamster.onGround) {
      hamster.vy = getJumpV();
      hamster.onGround = false;
      GameAudio.jump();
    }
  }

  function spawnDeathParticles() {
    const cx = hamster.x + hamster.w / 2;
    const cy = hamster.y - hamster.h / 2;
    for (let i = 0; i < 45; i++) {
      const angle = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 5;
      const p = acquireParticle();
      p.x = cx + (Math.random() - 0.5) * 8;
      p.y = cy + (Math.random() - 0.5) * 8;
      p.vx = Math.cos(angle) * sp;
      p.vy = Math.sin(angle) * sp - 2;
      p.life = 45 + Math.random() * 30;
      p.maxLife = 75;
      p.color = Math.random() < 0.65 ? '#e63946' : '#ff8080';
      p.size = 3 + Math.random() * 4;
      p.shape = 'square';
      particles.push(p);
    }
  }

  function spawnBoneParticles(x, y) {
    for (let i = 0; i < 10; i++) {
      const angle = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 4;
      const p = acquireParticle();
      p.x = x + (Math.random() - 0.5) * 14;
      p.y = y + (Math.random() - 0.5) * 14;
      p.vx = Math.cos(angle) * sp;
      p.vy = Math.sin(angle) * sp - 2;
      p.life = 40 + Math.random() * 25;
      p.maxLife = 65;
      p.color = '#e8e2d8';
      p.size = 2 + Math.random() * 2;
      p.shape = 'bone';
      p.rot = Math.random() * Math.PI * 2;
      p.rotSpeed = (Math.random() - 0.5) * 0.3;
      particles.push(p);
    }
  }

  function spawnFeatherParticles(x, y) {
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3.5;
      const p = acquireParticle();
      p.x = x + (Math.random() - 0.5) * 14;
      p.y = y + (Math.random() - 0.5) * 14;
      p.vx = Math.cos(angle) * sp;
      p.vy = Math.sin(angle) * sp - 1.5;
      p.life = 45 + Math.random() * 30;
      p.maxLife = 75;
      p.color = Math.random() < 0.5 ? '#ede8e3' : '#c8bfb5';
      p.size = 3 + Math.random() * 3;
      p.shape = 'feather';
      p.rot = Math.random() * Math.PI * 2;
      p.rotSpeed = (Math.random() - 0.5) * 0.15;
      particles.push(p);
    }
  }

  function spawnNeedleParticles(x, y) {
    for (let i = 0; i < 14; i++) {
      const angle = Math.random() * Math.PI * 2;
      const sp = 2.5 + Math.random() * 4;
      const p = acquireParticle();
      p.x = x + (Math.random() - 0.5) * 16;
      p.y = y + (Math.random() - 0.5) * 16;
      p.vx = Math.cos(angle) * sp;
      p.vy = Math.sin(angle) * sp - 2;
      p.life = 30 + Math.random() * 25;
      p.maxLife = 55;
      p.color = Math.random() < 0.5 ? '#7dd87d' : '#a8e6a8';
      p.size = 1 + Math.random() * 1.5;
      p.shape = 'needle';
      p.rot = Math.random() * Math.PI * 2;
      p.rotSpeed = (Math.random() - 0.5) * 0.4;
      particles.push(p);
    }
  }

  function spawnParticlesRed(x, y, count) {
    const n = count || 14;
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const sp = 1.5 + Math.random() * 3.5;
      const p = acquireParticle();
      p.x = x + (Math.random() - 0.5) * 10;
      p.y = y + (Math.random() - 0.5) * 10;
      p.vx = Math.cos(angle) * sp;
      p.vy = Math.sin(angle) * sp - 1.5;
      p.life = 30 + Math.random() * 20;
      p.maxLife = 50;
      p.color = Math.random() < 0.5 ? '#e63946' : '#ff8080';
      p.size = 2 + Math.random() * 3;
      p.shape = 'square';
      particles.push(p);
    }
  }

  function killGame() {
    if (gameState !== 'playing') return;
    gameState = 'dying';
    paused = false;
    setSprint(false);
    updatePauseUI();
    GameAudio.death();
    GameAudio.stopMusic();
    const fs = Math.floor(score);
    if (fs > hiScore) {
      hiScore = fs;
      saveHiScore(difficulty, hiScore);
    }
    if (!scoreSavedThisRun) {
      let nick = nickInput && nickInput.value.trim();
      if (!nick) nick = randomNick();
      addScore(nick, fs, difficulty);
      scoreSavedThisRun = true;
    }
    spawnDeathParticles();
    setTimeout(() => {
      if (gameState === 'dying') startShatter();
    }, 300);
  }

  function startShatter() {
    if (gameState !== 'dying') return;
    if (W === 0 || H === 0) { showMenu(); return; }

    const area = W * H;
    const blockSize = Math.max(8, Math.sqrt(area / SHATTER_TARGET_BLOCKS));
    const cols = Math.max(4, Math.ceil(W / blockSize));
    const rows = Math.max(4, Math.ceil(H / blockSize));

    const small = document.createElement('canvas');
    small.width = cols; small.height = rows;
    const sctx = small.getContext('2d');
    if (!sctx) { showMenu(); return; }
    sctx.imageSmoothingEnabled = true;

    try {
      sctx.fillStyle = '#14110d';
      sctx.fillRect(0, 0, cols, rows);
      sctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, cols, rows);
    } catch (e) { showMenu(); return; }

    let data;
    try { data = sctx.getImageData(0, 0, cols, rows).data; }
    catch (e) { showMenu(); return; }

    shatterBlocks = new Array(cols * rows);
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p = (r * cols + c) * 4;
        shatterBlocks[idx++] = {
          x: c * blockSize + blockSize * 0.5,
          y: r * blockSize + blockSize * 0.5,
          w: blockSize + 0.6,
          h: blockSize + 0.6,
          col: 'rgb(' + data[p] + ',' + data[p + 1] + ',' + data[p + 2] + ')',
          vx: (Math.random() - 0.5) * 8,
          vy: -2 - Math.random() * 5,
          life: 1
        };
      }
    }
    shatterFrames = 0;
    gameState = 'shatter';
    setOverlayVisible(false);
    ctx.clearRect(0, 0, W, H);
  }

  function renderShatter() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    let alive = 0;
    for (let i = 0; i < shatterBlocks.length; i++) {
      const b = shatterBlocks[i];
      if (b.life <= 0) continue;
      b.x += b.vx; b.y += b.vy;
      b.vy += 0.6; b.vx *= 0.995;
      b.life -= 0.012;
      if (b.life <= 0) continue;
      if (b.y > H + 100) { b.life = 0; continue; }
      if (b.x < -100 || b.x > W + 100) { b.life = 0; continue; }
      alive++;
      ctx.globalAlpha = b.life < 0.5 ? b.life * 2 : 1;
      ctx.fillStyle = b.col;
      ctx.fillRect(b.x - b.w * 0.5, b.y - b.h * 0.5, b.w, b.h);
    }
    ctx.globalAlpha = 1;
    shatterFrames++;
    if (alive === 0 || shatterFrames > 250) {
      shatterBlocks = [];
      showMenu();
    }
  }

  function updateMusicState() {
    if (gameState === 'playing' && visible && !document.hidden && !GameAudio.isMuted() && !paused) {
      GameAudio.startMusic();
    } else {
      GameAudio.stopMusic();
    }
  }

  function rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }
  function hamsterRect() {
    return { x: hamster.x + 2, y: hamster.y - hamster.h + 6, w: hamster.w - 4, h: hamster.h - 6 };
  }
  function canKillFromAbove(enemyRect, hr) {
    if (hamster.vy <= 0) return false;
    return hr.y + hr.h < enemyRect.y + enemyRect.h * 0.55;
  }

  /* ---------- ХОМЯК ---------- */
  function drawHamster() {
    const x = Math.floor(hamster.x);
    const y = Math.floor(hamster.y);

    if (shieldLevel > 0) {
      const t = frameCount * 0.05;
      const cx = x + hamster.w / 2;
      const cy = y - hamster.h / 2;
      for (let s = 0; s < shieldLevel; s++) {
        const angle = t + (Math.PI * 2 / shieldLevel) * s;
        drawMiniShield(cx + Math.cos(angle) * 34, cy + Math.sin(angle) * 34 * 0.6);
      }
    }
    if (magnetFrames > 0) {
      const t = -frameCount * 0.05;
      const cx = x + hamster.w / 2;
      const cy = y - hamster.h / 2;
      for (let s = 0; s < magnetLevel; s++) {
        const angle = t + (Math.PI * 2 / magnetLevel) * s;
        drawMiniMagnet(cx + Math.cos(angle) * 34, cy + Math.sin(angle) * 34 * 0.6);
      }
    }

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(x + hamster.w / 2, y + 1, hamster.w * 0.4, 3, 0, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#c98a54';
    ctx.beginPath(); ctx.arc(x + 3, y - 7, 2.5, 0, Math.PI * 2); ctx.fill();

    if (hamster.onGround) {
      if (hamster.legFrame === 0) {
        ctx.fillRect(x + 6, y - 4, 6, 4);
        ctx.fillRect(x + 20, y - 6, 6, 4);
      } else {
        ctx.fillRect(x + 8, y - 6, 6, 4);
        ctx.fillRect(x + 22, y - 4, 6, 4);
      }
    } else {
      ctx.fillRect(x + 5, y - 5, 6, 5);
      ctx.fillRect(x + 21, y - 5, 6, 5);
    }

    ctx.fillStyle = '#d9a066';
    ctx.beginPath(); ctx.ellipse(x + 15, y - 12, 13, 12, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f5e0b8';
    ctx.beginPath(); ctx.ellipse(x + 12, y - 10, 8, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d9a066';
    ctx.beginPath(); ctx.arc(x + 22, y - 24, 3.5, 0, Math.PI * 2); ctx.arc(x + 29, y - 24, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f0b7c0';
    ctx.beginPath(); ctx.arc(x + 22, y - 24, 2, 0, Math.PI * 2); ctx.arc(x + 29, y - 24, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f5e0b8';
    ctx.beginPath(); ctx.ellipse(x + 26, y - 19, 5.5, 5.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1c1a18';
    ctx.beginPath(); ctx.arc(x + 23.5, y - 20, 1.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x + 24, y - 20.5, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff6b81';
    ctx.beginPath(); ctx.arc(x + 30, y - 19, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#1c1a18';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x + 30, y - 19); ctx.lineTo(x + 32, y - 21);
    ctx.moveTo(x + 30, y - 19); ctx.lineTo(x + 32, y - 19);
    ctx.moveTo(x + 30, y - 19); ctx.lineTo(x + 32, y - 17);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,130,130,0.55)';
    ctx.beginPath(); ctx.arc(x + 20, y - 17, 2, 0, Math.PI * 2); ctx.fill();
  }

  function drawMiniShield(cx, cy) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = '#50c8ff';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(5, -3); ctx.lineTo(5, 2); ctx.lineTo(0, 6); ctx.lineTo(-5, 2); ctx.lineTo(-5, -3);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, -3); ctx.lineTo(0, 3);
    ctx.moveTo(-2.5, 0); ctx.lineTo(2.5, 0);
    ctx.stroke();
    ctx.restore();
  }

  function drawMiniMagnet(cx, cy) {
    ctx.save();
    ctx.translate(cx, cy);
    const r = 4.5;
    ctx.strokeStyle = '#e63946';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 1, r, Math.PI, 0, true); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r, 1); ctx.lineTo(-r, 4);
    ctx.moveTo(r, 1); ctx.lineTo(r, 4);
    ctx.stroke();
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(-r - 1.5, 4, 3, 2);
    ctx.fillRect(r - 1.5, 4, 3, 2);
    ctx.restore();
  }

  /* ---------- ОБЪЕКТЫ ---------- */
  function drawCactus(o) {
    const cx = Math.floor(o.x + o.w / 2);
    ctx.fillStyle = '#ede8e3';
    ctx.fillRect(cx - 3, o.y - o.h, 6, o.h);
    ctx.fillRect(cx - 9, o.y - o.h + 8, 5, 8);
    ctx.fillRect(cx - 9, o.y - o.h + 8, 6, 5);
    ctx.fillRect(cx + 4, o.y - o.h + 14, 5, 8);
    ctx.fillRect(cx + 4, o.y - o.h + 14, 5, 5);
  }
  function drawBird(o) {
    const cx = Math.floor(o.x + o.w / 2);
    const cy = Math.floor(o.y - o.h / 2);
    const wingUp = Math.floor(frameCount / 8) % 2 === 0;
    ctx.fillStyle = '#ede8e3';
    ctx.fillRect(cx - 10, cy - 3, 18, 6);
    ctx.fillRect(cx + 6, cy - 6, 6, 6);
    ctx.fillRect(cx + 12, cy - 3, 5, 3);
    if (wingUp) ctx.fillRect(cx - 6, cy - 12, 12, 6);
    else ctx.fillRect(cx - 6, cy + 2, 12, 6);
  }
  function drawWalker(w) {
    const x = Math.floor(w.x), y = Math.floor(w.y);
    const phase = Math.floor(frameCount / 8) % 2;
    ctx.fillStyle = '#c1440e';
    ctx.fillRect(x + 2, y - w.h + 6, w.w - 4, w.h - 12);
    ctx.fillRect(x + 4, y - w.h - 2, w.w - 8, 8);
    ctx.fillStyle = '#ffe0b0';
    ctx.fillRect(x + 6, y - w.h + 1, 3, 3);
    ctx.fillRect(x + w.w - 9, y - w.h + 1, 3, 3);
    ctx.fillStyle = '#c1440e';
    if (phase === 0) {
      ctx.fillRect(x + 3, y - 6, 4, 6);
      ctx.fillRect(x + w.w - 7, y - 9, 4, 9);
    } else {
      ctx.fillRect(x + 3, y - 9, 4, 9);
      ctx.fillRect(x + w.w - 7, y - 6, 4, 6);
    }
  }
  function drawSkeleton(s) {
    const x = Math.floor(s.x), y = Math.floor(s.y);
    ctx.globalAlpha = Math.max(0, s.fadeAlpha);
    ctx.fillStyle = '#e8e2d8';
    ctx.fillRect(x + 4, y - s.h - 2, 16, 12);
    ctx.fillStyle = '#1c1a18';
    ctx.fillRect(x + 7, y - s.h + 2, 3, 3);
    ctx.fillRect(x + 14, y - s.h + 2, 3, 3);
    ctx.fillRect(x + 9, y - s.h + 7, 6, 1);
    ctx.fillStyle = '#e8e2d8';
    ctx.fillRect(x + 6, y - s.h + 12, 12, 2);
    ctx.fillRect(x + 6, y - s.h + 17, 12, 2);
    ctx.fillRect(x + 6, y - s.h + 22, 12, 2);
    ctx.fillRect(x + 10, y - s.h + 12, 3, 14);
    const phase = Math.floor(frameCount / 8) % 2;
    if (phase === 0) {
      ctx.fillRect(x + 6, y - 6, 3, 6);
      ctx.fillRect(x + 15, y - 9, 3, 9);
    } else {
      ctx.fillRect(x + 6, y - 9, 3, 9);
      ctx.fillRect(x + 15, y - 6, 3, 6);
    }
    ctx.fillRect(x + 2, y - s.h + 14, 5, 2);
    ctx.fillRect(x + 17, y - s.h + 14, 5, 2);
    ctx.strokeStyle = '#a86b2c';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x - 3, y - s.h + 15, 8, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function drawArrow(a) {
    ctx.fillStyle = '#a86b2c';
    ctx.fillRect(a.x, a.y + 1, a.w - 4, 2);
    ctx.fillStyle = '#ede8e3';
    ctx.beginPath(); ctx.moveTo(a.x, a.y - 2); ctx.lineTo(a.x - 4, a.y + 2); ctx.lineTo(a.x, a.y + 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e63946';
    ctx.fillRect(a.x + a.w - 6, a.y - 2, 3, 2);
    ctx.fillRect(a.x + a.w - 6, a.y + 4, 3, 2);
  }
  function drawKnife(k) {
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(k.x - 9, k.y - 2, 6, 4);
    ctx.fillStyle = '#333';
    ctx.fillRect(k.x - 3, k.y - 4, 2, 8);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(k.x - 1, k.y - 2, 9, 4);
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(k.x - 1, k.y - 2, 9, 1);
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath(); ctx.moveTo(k.x + 8, k.y - 2); ctx.lineTo(k.x + 13, k.y); ctx.lineTo(k.x + 8, k.y + 2); ctx.closePath(); ctx.fill();
  }
  function drawAxe(a) {
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(a.rot);
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(-14, -1.5, 18, 3);
    ctx.fillStyle = '#6b4423';
    ctx.fillRect(-14, 0.5, 18, 1);
    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.moveTo(4, -7);
    ctx.lineTo(11, -5);
    ctx.lineTo(13, 0);
    ctx.lineTo(11, 5);
    ctx.lineTo(4, 7);
    ctx.lineTo(2, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.moveTo(11, -5); ctx.lineTo(13, 0); ctx.lineTo(11, 5); ctx.lineTo(10, 0);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5c3a1a';
    ctx.fillRect(-14, -2, 3, 4);
    ctx.restore();
  }
  function drawBlock(b) {
    ctx.fillStyle = 'rgba(58,46,30,0.9)';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = '#f39c12';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(b.x + 4, b.y + 4); ctx.lineTo(b.x + b.w - 4, b.y + b.h - 4);
    ctx.moveTo(b.x + b.w - 4, b.y + 4); ctx.lineTo(b.x + 4, b.y + b.h - 4);
    ctx.stroke();
  }
  function drawMedkit(p) {
    ctx.fillStyle = '#e63946';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.strokeRect(p.x + 1, p.y + 1, p.w - 2, p.h - 2);
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    ctx.fillStyle = '#fff';
    ctx.fillRect(cx - 6, cy - 2, 12, 4);
    ctx.fillRect(cx - 2, cy - 6, 4, 12);
  }
  function drawCoin(p) {
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2, r = p.w / 2;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#f39c12'; ctx.fill();
    ctx.strokeStyle = '#cf7d0d'; ctx.lineWidth = 2; ctx.stroke();
  }
  function drawSpeedPotion(p) {
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    ctx.fillStyle = '#7ddf7d';
    ctx.beginPath();
    ctx.moveTo(cx - 5, p.y + 2); ctx.lineTo(cx + 5, p.y + 2);
    ctx.lineTo(cx + 7, p.y + p.h - 2); ctx.lineTo(cx - 7, p.y + p.h - 2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#a86b2c';
    ctx.fillRect(cx - 3, p.y - 2, 6, 4);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(cx + 1, cy - 5); ctx.lineTo(cx - 3, cy + 1); ctx.lineTo(cx, cy + 1);
    ctx.lineTo(cx - 1, cy + 6); ctx.lineTo(cx + 3, cy - 1); ctx.lineTo(cx, cy - 1);
    ctx.closePath(); ctx.fill();
  }
  function drawMagnetPickup(p) {
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2 + 2;
    const r = Math.min(p.w, p.h) * 0.32;
    ctx.strokeStyle = '#e63946';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, r, Math.PI, 0, true); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r, cy); ctx.lineTo(cx - r, cy + 5);
    ctx.moveTo(cx + r, cy); ctx.lineTo(cx + r, cy + 5);
    ctx.stroke();
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(cx - r - 3, cy + 4, 6, 4);
    ctx.fillRect(cx + r - 3, cy + 4, 6, 4);
    ctx.strokeStyle = 'rgba(244,114,182,0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy, r + 5, Math.PI * 0.9, Math.PI * 0.1, true); ctx.stroke();
  }
  function drawKnifePickup(p) {
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    for (let i = 0; i < 3; i++) {
      const offsetY = (i - 1) * 4;
      const rot = (i - 1) * 0.12;
      ctx.save();
      ctx.translate(cx, cy + offsetY);
      ctx.rotate(rot);
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(-8, -1, 5, 2);
      ctx.fillStyle = '#333';
      ctx.fillRect(-3, -2, 1.5, 4);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(-1.5, -1.5, 6, 3);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(-1.5, -1.5, 6, 1);
      ctx.fillStyle = '#cbd5e1';
      ctx.beginPath();
      ctx.moveTo(4.5, -1.5); ctx.lineTo(7, 0); ctx.lineTo(4.5, 1.5);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  function drawAxePickup(p) {
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    for (let i = 0; i < 2; i++) {
      const angle = i === 0 ? -0.55 : 0.55;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.fillStyle = '#8b5a2b';
      ctx.fillRect(-10, -1.2, 18, 2.4);
      ctx.fillStyle = '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(4, -5);
      ctx.lineTo(10, -4);
      ctx.lineTo(11, 0);
      ctx.lineTo(10, 4);
      ctx.lineTo(4, 5);
      ctx.lineTo(2, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      ctx.fillStyle = '#e2e8f0';
      ctx.beginPath();
      ctx.moveTo(10, -4); ctx.lineTo(11, 0); ctx.lineTo(10, 4); ctx.lineTo(9, 0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#5c3a1a';
      ctx.fillRect(-10, -1.5, 2, 3);
      ctx.restore();
    }
  }
  function drawGround() {
    ctx.strokeStyle = 'rgba(237,232,227,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, groundY + 1); ctx.lineTo(W, groundY + 1); ctx.stroke();
    ctx.strokeStyle = 'rgba(237,232,227,0.10)';
    const offset = (frameCount * speed) % 24;
    for (let x = -offset; x < W; x += 24) {
      ctx.beginPath(); ctx.moveTo(x, groundY + 5); ctx.lineTo(x + 12, groundY + 5); ctx.stroke();
    }
  }

  /* ---------- HUD ---------- */
  function drawHUD() {
    const isNarrow = W < 500;
    const scoreFont = 'bold ' + (isNarrow ? 16 : 20) + 'px ui-monospace, SFMono-Regular, Menlo, monospace';
    const boostFont = (isNarrow ? 12 : 14) + 'px ui-monospace, SFMono-Regular, Menlo, monospace';

    ctx.textBaseline = 'top';
    ctx.textAlign = 'right';
    ctx.font = scoreFont;
    const hiStr = String(hiScore).padStart(5, '0');
    const scoreStr = String(Math.floor(score)).padStart(5, '0');
    const combined = 'HI ' + hiStr + '  ' + scoreStr;
    const scoreY = isNarrow ? 8 : 10;
    const scoreX = W - 14;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(combined, scoreX + 2, scoreY + 2);
    ctx.fillStyle = '#ffffff'; ctx.fillText(combined, scoreX, scoreY);

    ctx.textAlign = 'left';
    ctx.font = boostFont;
    let y = isNarrow ? 8 : 10;
    const lineHeight = isNarrow ? 18 : 20;
    const bx = 14;
    if (sprinting) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText('СПРИНТ', bx + 1, y + 1);
      ctx.fillStyle = '#ff9a3c'; ctx.fillText('СПРИНТ', bx, y);
      y += lineHeight;
    }
    if (shieldLevel > 0) {
      const text = 'ЩИТ x' + shieldLevel;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(text, bx + 1, y + 1);
      ctx.fillStyle = '#50c8ff'; ctx.fillText(text, bx, y);
      y += lineHeight;
    }
    if (jumpBoostFrames > 0) {
      const text = 'ПРЫЖОК ур.' + jumpBoostLevel + ' ' + Math.ceil(jumpBoostFrames / 60) + 'с';
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(text, bx + 1, y + 1);
      ctx.fillStyle = '#4ade80'; ctx.fillText(text, bx, y);
      y += lineHeight;
    }
    if (scoreBoostFrames > 0) {
      const text = 'x' + (1 + scoreBoostLevel) + ' ОЧКИ ' + Math.ceil(scoreBoostFrames / 60) + 'с';
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(text, bx + 1, y + 1);
      ctx.fillStyle = '#ffd700'; ctx.fillText(text, bx, y);
      y += lineHeight;
    }
    if (speedBoostFrames > 0) {
      const text = 'СКОРОСТЬ ур.' + speedBoostLevel + ' ' + Math.ceil(speedBoostFrames / 60) + 'с';
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(text, bx + 1, y + 1);
      ctx.fillStyle = '#50d8ff'; ctx.fillText(text, bx, y);
      y += lineHeight;
    }
    if (magnetFrames > 0) {
      const text = 'МАГНИТ ур.' + magnetLevel + ' ' + Math.ceil(magnetFrames / 60) + 'с';
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(text, bx + 1, y + 1);
      ctx.fillStyle = '#f472b6'; ctx.fillText(text, bx, y);
      y += lineHeight;
    }
    if (axeFrames > 0) {
      const text = 'ТОПОР ур.' + axeLevel + ' ' + Math.ceil(axeFrames / 60) + 'с';
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(text, bx + 1, y + 1);
      ctx.fillStyle = '#f59e0b'; ctx.fillText(text, bx, y);
      y += lineHeight;
    }
    if (knifeFrames > 0) {
      const text = 'НОЖ ур.' + knifeLevel + ' ' + Math.ceil(knifeFrames / 60) + 'с';
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillText(text, bx + 1, y + 1);
      ctx.fillStyle = '#e2e8f0'; ctx.fillText(text, bx, y);
    }
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ede8e3';
    ctx.font = 'bold 22px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ПАУЗА', W / 2, H / 2 - 8);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(237,232,227,0.75)';
    ctx.fillText('Нажмите Продолжить или пробел', W / 2, H / 2 + 20);
  }

  /* ---------- ПАРТИКЛЫ ---------- */
  function drawParticles() {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      ctx.globalAlpha = p.life / p.maxLife;
      const shape = p.shape;
      if (shape === 'bone') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot || 0);
        ctx.fillStyle = p.color;
        const len = p.size * 2.5;
        ctx.fillRect(-len / 2, -1, len, 2);
        ctx.beginPath(); ctx.arc(-len / 2, 0, 1.6, 0, Math.PI * 2); ctx.arc(len / 2, 0, 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (shape === 'feather') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot || 0);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.ellipse(0, 0, p.size * 1.4, p.size * 0.55, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.lineWidth = 0.6;
        ctx.beginPath(); ctx.moveTo(-p.size * 1.4, 0); ctx.lineTo(p.size * 1.4, 0); ctx.stroke();
        ctx.restore();
      } else if (shape === 'needle') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot || 0);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size * 2, -0.6, p.size * 4, 1.2);
        ctx.restore();
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    ctx.globalAlpha = 1;
  }

  function updateParticlesOnly() {
    let i = 0;
    while (i < particles.length) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy;
      const shape = p.shape;
      if (shape === 'feather') { p.vy += 0.06; p.vx *= 0.985; p.vy *= 0.99; }
      else if (shape === 'bone') { p.vy += 0.22; p.vx *= 0.98; }
      else if (shape === 'needle') { p.vy += 0.18; p.vx *= 0.97; }
      else { p.vy += 0.18; p.vx *= 0.97; }
      if (shape === 'bone' || shape === 'feather' || shape === 'needle') {
        p.rot = (p.rot || 0) + p.rotSpeed;
      }
      p.life--;
      if (p.life <= 0) {
        releaseParticle(p);
        const last = particles.length - 1;
        particles[i] = particles[last];
        particles.pop();
      } else {
        i++;
      }
    }
  }

  /* ---------- ОБНОВЛЕНИЕ ---------- */
  function update() {
    hamster.legFrame = Math.floor(frameCount / (sprinting ? 4 : 6)) % 2;

    if (!hamster.onGround) {
      hamster.vy += GRAVITY;
      hamster.y += hamster.vy;
      if (hamster.y >= groundY) { hamster.y = groundY; hamster.vy = 0; hamster.onGround = true; }
    }

    const speedMul = getSpeedMul();
    const effSpeed = speed * speedMul;
    const dcfg = DIFFICULTY[difficulty] || DIFFICULTY.medium;

    /* --- Ножи (спавн) --- */
    if (knifeFrames > 0) {
      knifeCooldown--;
      if (knifeCooldown <= 0) {
        knives.push({ x: hamster.x + hamster.w / 2 + 10, y: hamster.y - hamster.h * 0.5, vx: 14 });
        knifeCooldown = knifeLevel >= 3 ? 20 : knifeLevel === 2 ? 35 : 50;
      }
    }

    /* --- Топоры (спавн) --- */
    if (axeFrames > 0) {
      axeCooldown--;
      if (axeCooldown <= 0) {
        axes.push({
          x: hamster.x + hamster.w / 2 + 10,
          y: hamster.y - hamster.h * 0.5,
          vx: 14,
          rot: Math.random() * Math.PI * 2,
          rotSpeed: 0.4,
          kills: 0
        });
        axeCooldown = axeLevel >= 3 ? 25 : axeLevel === 2 ? 40 : 60;
      }
    }

    /* --- Спавн по сетке --- */
    const spawnX = spawnCellX();

    if (frameCount >= nextCactusAt && !isRightColumnBusy()) {
      const variants = [{ w: 14, h: 28 }, { w: 18, h: 32 }, { w: 22, h: 28 }];
      const v = variants[Math.floor(Math.random() * variants.length)];
      obstacles.push({ type: 'cactus', x: spawnX, y: groundY, w: v.w, h: v.h });
      const base = Math.max(45, Math.floor(90 / (speed / START_SPEED))) * dcfg.intervalMul;
      nextCactusAt = frameCount + base + Math.floor(Math.random() * 40 * dcfg.intervalMul);
    }
    if (frameCount >= nextBirdAt && !isRightColumnBusy()) {
      const rowsAbove = 2 + Math.floor(Math.random() * 2);
      const cellTopY = groundY - rowsAbove * GRID_CELL;
      const birdCenterY = cellTopY + GRID_CELL / 2;
      const birdH = 14, birdW = 26;
      const baseY = birdCenterY + birdH / 2;
      obstacles.push({
        type: 'bird',
        x: spawnX,
        y: baseY,
        baseY: baseY,
        w: birdW,
        h: birdH,
        oscPhase: Math.random() * Math.PI * 2,
        oscSpeed: 0.035 + Math.random() * 0.02
      });
      nextBirdAt = frameCount + (260 + Math.floor(Math.random() * 150)) * dcfg.intervalMul;
    }
    if (frameCount >= nextWalkerAt && !isRightColumnBusy()) {
      walkers.push({ type: 'walker', x: spawnX, y: groundY, w: 22, h: 30, speed: 1.5 + Math.random() * 1.2 });
      nextWalkerAt = frameCount + (380 + Math.floor(Math.random() * 200)) * dcfg.intervalMul;
    }
    if (frameCount >= nextSkeletonAt && frameCount > 400 && !isRightColumnBusy()) {
      walkers.push({ type: 'skeleton', x: spawnX, y: groundY, w: 24, h: 34, speed: 1.0, fired: false, fadeAlpha: 1 });
      nextSkeletonAt = frameCount + (600 + Math.floor(Math.random() * 300)) * dcfg.intervalMul;
    }
    if (frameCount >= nextBlockAt && !isRightColumnBusy()) {
      const rowsAbove = 2 + Math.floor(Math.random() * 2);
      const cellTopY = groundY - rowsAbove * GRID_CELL;
      const blockSize = 22;
      const blockCenterY = cellTopY + GRID_CELL / 2;
      blocks.push({ x: spawnX + (GRID_CELL - blockSize) / 2, y: blockCenterY - blockSize / 2, w: blockSize, h: blockSize });
      nextBlockAt = frameCount + (220 + Math.floor(Math.random() * 150)) * dcfg.intervalMul;
    }
    if (frameCount >= nextPickupAt && !isRightColumnBusy()) {
      const rowsAbove = 1 + Math.floor(Math.random() * 2);
      const cellTopY = groundY - rowsAbove * GRID_CELL;
      const r = Math.random();
      let type;
      if (r < 0.26) type = 'coin';
      else if (r < 0.44 && shieldLevel < MAX_BOOST_LEVEL) type = 'medkit';
      else if (r < 0.60) type = 'speed';
      else if (r < 0.76) type = 'magnet';
      else if (r < 0.90) type = 'knife';
      else type = 'axe';
      let pw, ph;
      if (type === 'medkit') { pw = 22; ph = 22; }
      else if (type === 'speed') { pw = 18; ph = 22; }
      else if (type === 'magnet') { pw = 22; ph = 20; }
      else if (type === 'knife') { pw = 24; ph = 16; }
      else if (type === 'axe') { pw = 26; ph = 20; }
      else { pw = 16; ph = 16; }
      const centerX = spawnX + GRID_CELL / 2;
      const centerY = cellTopY + GRID_CELL / 2;
      pickups.push({ type, x: centerX - pw / 2, y: centerY - ph / 2, w: pw, h: ph });
      nextPickupAt = frameCount + (260 + Math.floor(Math.random() * 150)) * dcfg.intervalMul;
    }

    const hr = hamsterRect();

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const o = obstacles[i];
      o.x -= effSpeed;
      if (o.type === 'bird') {
        o.oscPhase += o.oscSpeed;
        o.y = o.baseY + Math.sin(o.oscPhase) * BIRD_OSC_AMP;
      }
      const or = o.type === 'cactus'
        ? { x: o.x + 2, y: o.y - o.h, w: o.w - 4, h: o.h }
        : { x: o.x, y: o.y - o.h, w: o.w, h: o.h };
      if (rectsOverlap(hr, or)) {
        if (canKillFromAbove(or, hr)) {
          score += (o.type === 'bird' ? 100 : 80);
          hamster.vy = BOUNCE_V; hamster.onGround = false;
          if (o.type === 'cactus') spawnNeedleParticles(o.x + o.w / 2, o.y - o.h / 2);
          else spawnFeatherParticles(o.x + o.w / 2, o.y - o.h / 2);
          GameAudio.killBird();
          obstacles.splice(i, 1);
          continue;
        }
        if (shieldLevel > 0) {
          shieldLevel--;
          if (o.type === 'cactus') spawnNeedleParticles(o.x + o.w / 2, o.y - o.h / 2);
          else spawnFeatherParticles(o.x + o.w / 2, o.y - o.h / 2);
          GameAudio.expireShield();
          obstacles.splice(i, 1);
          continue;
        } else { killGame(); return; }
      }
      if (o.x + o.w < -20) obstacles.splice(i, 1);
    }

    for (let i = walkers.length - 1; i >= 0; i--) {
      const w = walkers[i];
      const walkerSpeed = (w.type === 'skeleton' ? w.speed : (w.speed + 1)) * speedMul;
      w.x -= (effSpeed * 0.5 + walkerSpeed);
      if (w.type === 'skeleton' && !w.fired && (w.x - (hamster.x + hamster.w)) < 500 && w.x > hamster.x + hamster.w) {
        w.fired = true;
        arrows.push({ x: w.x + 6, y: groundY - 30, w: 16, h: 6, vx: -8 });
        GameAudio.arrow();
      }
      if (w.type === 'skeleton' && w.fired) w.fadeAlpha -= 0.04;
      if (w.fadeAlpha !== undefined && w.fadeAlpha <= 0) { walkers.splice(i, 1); continue; }
      const wr = { x: w.x + 2, y: w.y - w.h, w: w.w - 4, h: w.h };
      if (rectsOverlap(hr, wr)) {
        if (canKillFromAbove(wr, hr)) {
          score += (w.type === 'skeleton' ? 140 : 100);
          hamster.vy = BOUNCE_V; hamster.onGround = false;
          if (w.type === 'skeleton') spawnBoneParticles(w.x + w.w / 2, w.y - w.h / 2);
          else spawnParticlesRed(w.x + w.w / 2, w.y - w.h / 2);
          GameAudio.killBird();
          walkers.splice(i, 1);
          continue;
        }
        if (shieldLevel > 0) {
          shieldLevel--;
          if (w.type === 'skeleton') spawnBoneParticles(w.x + w.w / 2, w.y - w.h / 2);
          else spawnParticlesRed(w.x + w.w / 2, w.y - w.h / 2);
          GameAudio.expireShield();
          walkers.splice(i, 1);
          continue;
        } else { killGame(); return; }
      }
      if (w.x + w.w < -40) walkers.splice(i, 1);
    }

    for (let i = arrows.length - 1; i >= 0; i--) {
      const a = arrows[i];
      a.x += a.vx;
      if (rectsOverlap(hr, { x: a.x - 4, y: a.y, w: a.w, h: a.h })) {
        if (shieldLevel > 0) {
          shieldLevel--;
          spawnParticlesRed(a.x, a.y + 3, 8);
          GameAudio.expireShield();
          arrows.splice(i, 1);
          continue;
        } else { killGame(); return; }
      }
      if (a.x + a.w < -20) arrows.splice(i, 1);
    }

    for (let i = knives.length - 1; i >= 0; i--) {
      const k = knives[i];
      k.x += k.vx;
      const kr = { x: k.x - 9, y: k.y - 4, w: 22, h: 8 };
      let killed = false;

      for (let j = obstacles.length - 1; j >= 0; j--) {
        const o = obstacles[j];
        if (o.type === 'cactus') continue;
        const or = { x: o.x, y: o.y - o.h, w: o.w, h: o.h };
        if (rectsOverlap(kr, or)) {
          score += 100;
          spawnFeatherParticles(o.x + o.w / 2, o.y - o.h / 2);
          GameAudio.killBird();
          obstacles.splice(j, 1);
          killed = true;
          break;
        }
      }
      if (killed) { knives.splice(i, 1); continue; }

      for (let j = walkers.length - 1; j >= 0; j--) {
        const w = walkers[j];
        const wr = { x: w.x + 2, y: w.y - w.h, w: w.w - 4, h: w.h };
        if (rectsOverlap(kr, wr)) {
          score += (w.type === 'skeleton' ? 140 : 100);
          if (w.type === 'skeleton') spawnBoneParticles(w.x + w.w / 2, w.y - w.h / 2);
          else spawnParticlesRed(w.x + w.w / 2, w.y - w.h / 2);
          GameAudio.killBird();
          walkers.splice(j, 1);
          killed = true;
          break;
        }
      }
      if (killed) { knives.splice(i, 1); continue; }

      if (k.x > W + 50 || k.x < -50) knives.splice(i, 1);
    }

    for (let i = axes.length - 1; i >= 0; i--) {
      const a = axes[i];
      a.x += a.vx;
      a.rot += a.rotSpeed;
      const ar = { x: a.x - 12, y: a.y - 12, w: 24, h: 24 };

      for (let j = obstacles.length - 1; j >= 0 && a.kills < AXE_MAX_KILLS; j--) {
        const o = obstacles[j];
        const or = o.type === 'cactus'
          ? { x: o.x + 2, y: o.y - o.h, w: o.w - 4, h: o.h }
          : { x: o.x, y: o.y - o.h, w: o.w, h: o.h };
        if (rectsOverlap(ar, or)) {
          score += (o.type === 'bird' ? 100 : 80);
          if (o.type === 'cactus') spawnNeedleParticles(o.x + o.w / 2, o.y - o.h / 2);
          else spawnFeatherParticles(o.x + o.w / 2, o.y - o.h / 2);
          GameAudio.killBird();
          obstacles.splice(j, 1);
          a.kills++;
        }
      }
      for (let j = walkers.length - 1; j >= 0 && a.kills < AXE_MAX_KILLS; j--) {
        const w = walkers[j];
        const wr = { x: w.x + 2, y: w.y - w.h, w: w.w - 4, h: w.h };
        if (rectsOverlap(ar, wr)) {
          score += (w.type === 'skeleton' ? 140 : 100);
          if (w.type === 'skeleton') spawnBoneParticles(w.x + w.w / 2, w.y - w.h / 2);
          else spawnParticlesRed(w.x + w.w / 2, w.y - w.h / 2);
          GameAudio.killBird();
          walkers.splice(j, 1);
          a.kills++;
        }
      }

      if (a.kills >= AXE_MAX_KILLS || a.x > W + 60 || a.x < -60) {
        axes.splice(i, 1);
      }
    }

    for (let i = blocks.length - 1; i >= 0; i--) {
      const b = blocks[i];
      b.x -= effSpeed;
      if (rectsOverlap(hr, { x: b.x, y: b.y, w: b.w, h: b.h })) {
        score += 100;
        spawnParticlesRed(b.x + b.w / 2, b.y + b.h / 2, 14);
        GameAudio.hitBox();
        const r = Math.random();
        if (r < 0.15) applyJumpBoost();
        else if (r < 0.30) applyScoreBoost();
        else if (r < 0.44) applySpeedBoost();
        else if (r < 0.58) applyMagnet();
        else if (r < 0.74) applyKnife();
        else if (r < 0.88) applyAxe();
        else if (shieldLevel < MAX_BOOST_LEVEL) applyShield();
        blocks.splice(i, 1);
        continue;
      }
      if (b.x + b.w < -20) blocks.splice(i, 1);
    }

    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      if (magnetFrames > 0) {
        const hcx = hamster.x + hamster.w / 2;
        const hcy = hamster.y - hamster.h / 2;
        const pcx = p.x + p.w / 2;
        const pcy = p.y + p.h / 2;
        const dx = hcx - pcx, dy = hcy - pcy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 1) {
          const pull = Math.min(dist, 4 + magnetLevel * 2);
          p.x += (dx / dist) * pull;
          p.y += (dy / dist) * pull;
        }
      } else {
        p.x -= effSpeed;
      }
      if (rectsOverlap(hr, { x: p.x, y: p.y, w: p.w, h: p.h })) {
        if (p.type === 'medkit') { applyShield(); spawnParticlesRed(p.x + p.w / 2, p.y + p.h / 2, 8); }
        else if (p.type === 'speed') { applySpeedBoost(); spawnParticlesRed(p.x + p.w / 2, p.y + p.h / 2, 8); }
        else if (p.type === 'magnet') { applyMagnet(); spawnParticlesRed(p.x + p.w / 2, p.y + p.h / 2, 8); }
        else if (p.type === 'knife') { applyKnife(); spawnParticlesRed(p.x + p.w / 2, p.y + p.h / 2, 8); }
        else if (p.type === 'axe') { applyAxe(); spawnParticlesRed(p.x + p.w / 2, p.y + p.h / 2, 8); }
        else { score += 30; GameAudio.coinPickup(); spawnParticlesRed(p.x + p.w / 2, p.y + p.h / 2, 6); }
        pickups.splice(i, 1);
        continue;
      }
      if (p.x + p.w < -20) pickups.splice(i, 1);
      else if (p.y > H + 100) pickups.splice(i, 1);
    }

    updateParticlesOnly();

    const prevJump = jumpBoostFrames, prevScore = scoreBoostFrames,
          prevSpeed = speedBoostFrames, prevMagnet = magnetFrames,
          prevKnife = knifeFrames, prevAxe = axeFrames;
    if (jumpBoostFrames > 0) jumpBoostFrames--;
    if (scoreBoostFrames > 0) scoreBoostFrames--;
    if (speedBoostFrames > 0) speedBoostFrames--;
    if (magnetFrames > 0) magnetFrames--;
    if (knifeFrames > 0) knifeFrames--;
    if (axeFrames > 0) axeFrames--;
    if (prevJump > 0 && jumpBoostFrames === 0) { jumpBoostLevel = 0; GameAudio.expireJump(); }
    if (prevScore > 0 && scoreBoostFrames === 0) { scoreBoostLevel = 0; GameAudio.expireScore(); }
    if (prevSpeed > 0 && speedBoostFrames === 0) { speedBoostLevel = 0; GameAudio.expireSpeed(); }
    if (prevMagnet > 0 && magnetFrames === 0) { magnetLevel = 0; GameAudio.expireMagnet(); }
    if (prevKnife > 0 && knifeFrames === 0) { knifeLevel = 0; GameAudio.expireKnife(); }
    if (prevAxe > 0 && axeFrames === 0) { axeLevel = 0; GameAudio.expireAxe(); }

    score += getScoreRate();
    speed = Math.min(MAX_SPEED, START_SPEED + Math.floor(score / 200) * 0.4);
    updateBg();
  }

  function render() {
    if (W === 0 || H === 0) return;
    if (gameState === 'shatter') { renderShatter(); return; }

    drawBackgrounds();
    drawGrid();
    drawGround();

    if (gameState === 'menu') { drawHamster(); return; }

    for (let i = 0; i < pickups.length; i++) {
      const p = pickups[i];
      if (p.type === 'medkit') drawMedkit(p);
      else if (p.type === 'speed') drawSpeedPotion(p);
      else if (p.type === 'magnet') drawMagnetPickup(p);
      else if (p.type === 'knife') drawKnifePickup(p);
      else if (p.type === 'axe') drawAxePickup(p);
      else drawCoin(p);
    }
    for (let i = 0; i < blocks.length; i++) drawBlock(blocks[i]);
    for (let i = 0; i < walkers.length; i++) {
      const w = walkers[i];
      if (w.type === 'skeleton') drawSkeleton(w);
      else drawWalker(w);
    }
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      if (o.type === 'cactus') drawCactus(o); else drawBird(o);
    }
    for (let i = 0; i < arrows.length; i++) drawArrow(arrows[i]);
    for (let i = 0; i < knives.length; i++) drawKnife(knives[i]);
    for (let i = 0; i < axes.length; i++) drawAxe(axes[i]);

    drawParticles();
    drawEffects();
    drawHamster();
    drawHUD();

    if (paused) drawPaused();
  }

  function loop() {
    requestAnimationFrame(loop);
    if (!visible) return;
    if (paused) return;
    if (gameState === 'playing') {
      update();
      if (gameState === 'playing') {
        updateEffects();
        frameCount++;
      }
    } else if (gameState === 'dying') {
      updateParticlesOnly();
      updateEffects();
      frameCount++;
    }
    render();
  }

  function isVisible() {
    if (!canvas.isConnected) return false;
    const r = canvas.getBoundingClientRect();
    return r.top < window.innerHeight && r.bottom > 0;
  }

  document.addEventListener('keydown', e => {
    if ((e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') && isVisible()) {
      const tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      if (gameState === 'menu') { startGame(); return; }
      if (paused) { paused = false; updatePauseUI(); updateMusicState(); return; }
      jump();
    }
  });

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (gameState !== 'playing') return;
    if (paused) return;
    jump();
  });

  document.addEventListener('visibilitychange', updateMusicState);

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      entries.forEach(e => {
        visible = e.isIntersecting;
        updateMusicState();
      });
    }, { threshold: 0.25 }).observe(canvas);
  } else {
    visible = true;
  }

  renderLeaderboard();
  updateMenuRecord();
  updateDiffButtons();
  if (dinoWrap) dinoWrap.classList.add('is-menu');
  gameState = 'menu';
  requestAnimationFrame(loop);
})();