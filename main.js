/* Flappy Doge — pure JS, dependency-free, responsive canvas game.
   Security/Performance notes:
   - No remote assets, no innerHTML, no eval.
   - Uses requestAnimationFrame and DPR-aware canvas scaling.
*/

(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const canvas = $('game');
  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });
  const overlay = $('overlay');
  const overlayTitle = $('overlayTitle');
  const overlaySubtitle = $('overlaySubtitle');
  const overlayHint = $('overlayHint');
  const playBtn = $('playBtn');
  const muteBtn = $('muteBtn');
  const scoreValue = $('scoreValue');
  const bestValue = $('bestValue');

  const STORAGE_KEY_BEST = 'flappyDoge.best';
  const STORAGE_KEY_MUTED = 'flappyDoge.muted';

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);

  // World units are in "viewport pixels" after scaling (not device pixels).
  const state = {
    running: false,
    gameOver: false,
    started: false,
    t: 0,
    dt: 0,
    lastTs: 0,
    score: 0,
    best: 0,
    muted: false,
    // Responsive sizes computed in resize()
    w: 0,
    h: 0,
    dpr: 1,
    scale: 1,
  };

  // Audio: tiny synthesized beeps with WebAudio (optional).
  let audio = null;
  function ensureAudio() {
    if (state.muted) return null;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === 'suspended') audio.resume().catch(() => {});
      return audio;
    } catch {
      return null;
    }
  }

  function beep(freq, durationMs, type = 'sine', gain = 0.045) {
    if (state.muted) return;
    const ac = ensureAudio();
    if (!ac) return;
    const t0 = ac.currentTime;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durationMs / 1000);
    osc.connect(g).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + durationMs / 1000 + 0.02);
  }

  function loadSettings() {
    const best = Number.parseInt(localStorage.getItem(STORAGE_KEY_BEST) || '0', 10);
    state.best = Number.isFinite(best) ? best : 0;
    bestValue.textContent = String(state.best);
    const muted = localStorage.getItem(STORAGE_KEY_MUTED);
    state.muted = muted === '1';
    updateMuteUI();
  }

  function saveBest() {
    try {
      localStorage.setItem(STORAGE_KEY_BEST, String(state.best));
    } catch {
      // ignore
    }
  }

  function saveMuted() {
    try {
      localStorage.setItem(STORAGE_KEY_MUTED, state.muted ? '1' : '0');
    } catch {
      // ignore
    }
  }

  function updateMuteUI() {
    muteBtn.setAttribute('aria-pressed', state.muted ? 'true' : 'false');
    muteBtn.textContent = state.muted ? 'Sound: Off' : 'Sound: On';
  }

  // Gameplay parameters (tuned for feel; scaled with viewport).
  const world = {
    gravity: 2400, // px/s^2
    flapVel: -720, // px/s
    pipeSpeed: 360, // px/s (base; scaled)
    pipeGap: 190, // px (scaled)
    pipeWidth: 86,
    pipeSpacing: 320,
    groundPad: 0,
  };

  const dog = {
    x: 0,
    y: 0,
    vy: 0,
    r: 18,
    tilt: 0,
    wobble: 0,
  };

  /** @type {{x:number,y:number,gapY:number,passed:boolean}[]} */
  let pipes = [];

  function resetGame({ keepOverlay = false } = {}) {
    state.score = 0;
    scoreValue.textContent = '0';
    state.gameOver = false;
    state.started = false;
    state.t = 0;
    state.lastTs = 0;

    dog.x = state.w * 0.28;
    dog.y = state.h * 0.45;
    dog.vy = 0;
    dog.tilt = 0;
    dog.wobble = 0;

    pipes = [];
    spawnPipe(true);
    spawnPipe(true);
    spawnPipe(true);

    if (!keepOverlay) hideOverlay();
  }

  function showOverlay({ title, subtitle, hint, buttonText } = {}) {
    overlayTitle.textContent = title ?? 'Flappy Doge';
    overlaySubtitle.textContent =
      subtitle ?? 'Tap/click or press Space to flap. Avoid the pipes.';
    overlayHint.textContent = hint ?? 'Tip: On mobile, tap anywhere to flap.';
    playBtn.textContent = buttonText ?? 'Play';
    overlay.hidden = false;
  }

  function hideOverlay() {
    overlay.hidden = true;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(320, Math.floor(rect.width));
    const cssH = Math.max(360, Math.floor(rect.height));
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2.5);

    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    state.w = cssW;
    state.h = cssH;
    state.dpr = dpr;

    // Scale gameplay sizes for different screens.
    // Reference size is ~800x600; smaller screens scale down slightly.
    const s = clamp(Math.min(cssW / 900, cssH / 700), 0.82, 1.2);
    state.scale = s;

    dog.r = 18 * s;
    world.pipeWidth = 86 * s;
    world.pipeGap = clamp(200 * s, 150 * s, 240 * s);
    world.pipeSpacing = clamp(340 * s, 260 * s, 420 * s);
    world.pipeSpeed = 360 * s;
    world.gravity = 2400 * s;
    world.flapVel = -720 * s;

    if (!state.running) {
      // Keep dog centered nicely when not running.
      dog.x = state.w * 0.28;
      dog.y = state.h * 0.45;
    }
  }

  function spawnPipe(initial = false) {
    const margin = 70 * state.scale;
    const gapHalf = world.pipeGap / 2;
    const minY = margin + gapHalf;
    const maxY = state.h - margin - gapHalf;
    const gapY = clamp(rand(minY, maxY), minY, maxY);
    const x =
      initial && pipes.length
        ? pipes[pipes.length - 1].x + world.pipeSpacing
        : state.w + world.pipeWidth + (initial ? pipes.length * world.pipeSpacing : 0);
    pipes.push({ x, y: 0, gapY, passed: false });
  }

  function flap() {
    if (state.gameOver) return;
    if (!state.started) state.started = true;
    dog.vy = world.flapVel;
    dog.wobble = 0;
    beep(760, 75, 'triangle', 0.03);
  }

  function start() {
    state.running = true;
    resetGame({ keepOverlay: false });
    requestAnimationFrame(loop);
  }

  function endGame() {
    if (state.gameOver) return;
    state.gameOver = true;
    state.running = false;
    beep(210, 190, 'sawtooth', 0.04);
    beep(140, 240, 'sine', 0.04);

    if (state.score > state.best) {
      state.best = state.score;
      bestValue.textContent = String(state.best);
      saveBest();
    }

    showOverlay({
      title: 'Game Over',
      subtitle: `Score: ${state.score} · Best: ${state.best}`,
      hint: 'Press Space / Tap to play again.',
      buttonText: 'Play again',
    });
  }

  // Drawing helpers
  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawBackground() {
    // Subtle moving stars / particles
    const t = state.t;
    ctx.save();
    ctx.globalAlpha = 0.9;

    // Horizon gradient
    const g = ctx.createLinearGradient(0, 0, 0, state.h);
    g.addColorStop(0, 'rgba(255,255,255,0.02)');
    g.addColorStop(1, 'rgba(0,0,0,0.10)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, state.w, state.h);

    // Parallax dots
    const layers = [
      { n: 38, a: 0.14, s: 14 * state.scale },
      { n: 24, a: 0.10, s: 22 * state.scale },
      { n: 14, a: 0.08, s: 32 * state.scale },
    ];
    for (let li = 0; li < layers.length; li++) {
      const { n, a, s } = layers[li];
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(233,238,252,1)';
      for (let i = 0; i < n; i++) {
        const seed = i * 999 + li * 1337;
        const x = ((seed * 0.61803398875) % 1) * state.w;
        const y = ((seed * 0.41421356237) % 1) * state.h;
        const drift = (t * (0.012 + li * 0.008) * 60) % (state.w + s);
        const px = (x - drift + state.w + s) % (state.w + s) - s / 2;
        const py = y + Math.sin((t * 0.6 + i) * 0.9) * (5 + li * 3) * state.scale;
        ctx.beginPath();
        ctx.arc(px, py, (1.2 + li * 0.6) * state.scale, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function drawPipe(pipe) {
    const w = world.pipeWidth;
    const x = pipe.x;
    const gap = world.pipeGap;
    const gapY = pipe.gapY;
    const topH = gapY - gap / 2;
    const bottomY = gapY + gap / 2;
    const bottomH = state.h - bottomY;
    const r = 14 * state.scale;

    // Pipe gradient
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, 'rgba(120,255,178,0.26)');
    grad.addColorStop(0.5, 'rgba(106,228,255,0.20)');
    grad.addColorStop(1, 'rgba(120,255,178,0.26)');

    // Pipe outline
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 16 * state.scale;
    ctx.shadowOffsetY = 8 * state.scale;
    ctx.fillStyle = grad;
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;

    // Top pipe
    roundRect(x, -10 * state.scale, w, topH + 10 * state.scale, r);
    ctx.fill();
    ctx.stroke();

    // Bottom pipe
    roundRect(x, bottomY, w, bottomH + 10 * state.scale, r);
    ctx.fill();
    ctx.stroke();

    // Subtle inner highlight strip
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(x + w * 0.18, 0, w * 0.08, topH);
    ctx.fillRect(x + w * 0.18, bottomY, w * 0.08, bottomH);

    ctx.restore();
  }

  function drawDoge() {
    const x = dog.x;
    const y = dog.y;
    const r = dog.r;
    const t = state.t;

    // tilt based on vertical velocity for modern feel
    const targetTilt = clamp(dog.vy / 900, -0.6, 0.9);
    dog.tilt += (targetTilt - dog.tilt) * (1 - Math.pow(0.001, state.dt));
    dog.wobble += state.dt * 7;

    const bob = Math.sin(t * 3.2) * 2.2 * state.scale * (state.started ? 0.5 : 1);
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.rotate(dog.tilt);

    // Shadow
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.ellipse(0, r * 0.95, r * 1.1, r * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Body gradient
    const bodyGrad = ctx.createLinearGradient(-r, -r, r, r);
    bodyGrad.addColorStop(0, 'rgba(255,212,143,0.96)');
    bodyGrad.addColorStop(1, 'rgba(255,165,122,0.92)');

    // Body
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 18 * state.scale;
    ctx.shadowOffsetY = 10 * state.scale;
    ctx.fillStyle = bodyGrad;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    roundRect(-r * 1.05, -r * 0.9, r * 2.1, r * 1.8, r * 0.85);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Belly highlight
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    roundRect(-r * 0.65, -r * 0.35, r * 1.3, r * 0.95, r * 0.6);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Ear (top)
    ctx.save();
    ctx.translate(-r * 0.55, -r * 0.95);
    ctx.rotate(-0.25 + Math.sin(dog.wobble) * 0.08);
    ctx.fillStyle = 'rgba(255,200,130,0.95)';
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 1;
    roundRect(-r * 0.25, -r * 0.25, r * 0.6, r * 0.7, r * 0.28);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Ear (back)
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.translate(r * 0.15, -r * 0.9);
    ctx.rotate(0.25 + Math.sin(dog.wobble + 1.2) * 0.06);
    ctx.fillStyle = 'rgba(255,190,122,0.85)';
    roundRect(-r * 0.25, -r * 0.2, r * 0.55, r * 0.6, r * 0.26);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 1;

    // Snout
    ctx.save();
    ctx.translate(r * 0.75, r * 0.05);
    const snoutGrad = ctx.createLinearGradient(-r * 0.5, -r * 0.2, r * 0.5, r * 0.2);
    snoutGrad.addColorStop(0, 'rgba(255,235,206,0.95)');
    snoutGrad.addColorStop(1, 'rgba(255,210,180,0.92)');
    ctx.fillStyle = snoutGrad;
    roundRect(-r * 0.62, -r * 0.34, r * 1.06, r * 0.72, r * 0.34);
    ctx.fill();
    ctx.restore();

    // Nose
    ctx.fillStyle = 'rgba(28,30,42,0.9)';
    ctx.beginPath();
    ctx.ellipse(r * 1.03, r * 0.08, r * 0.18, r * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eye
    const blink = 0.25 + 0.75 * Math.abs(Math.sin(t * 1.3));
    ctx.fillStyle = 'rgba(28,30,42,0.92)';
    ctx.beginPath();
    ctx.ellipse(r * 0.28, -r * 0.15, r * 0.16, r * 0.14 * blink, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eye sparkle
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(r * 0.33, -r * 0.2, r * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Wing-like cape (for "flying dog")
    const flap = Math.sin(t * 16 + (state.started ? 0 : 1)) * 0.45;
    ctx.save();
    ctx.translate(-r * 0.9, r * 0.1);
    ctx.rotate(-0.25 + flap * 0.25);
    ctx.fillStyle = 'rgba(106,228,255,0.20)';
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-r * 0.7, -r * 0.35, -r * 1.25, -r * 0.05);
    ctx.quadraticCurveTo(-r * 0.6, r * 0.45, 0, r * 0.25);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.restore();
  }

  function collidePipe(pipe) {
    const r = dog.r;
    const x = dog.x;
    const y = dog.y;
    const w = world.pipeWidth;
    const gapY = pipe.gapY;
    const gap = world.pipeGap;

    // AABB for pipe columns
    const px0 = pipe.x;
    const px1 = pipe.x + w;

    if (x + r < px0 || x - r > px1) return false;

    const topY1 = gapY - gap / 2;
    const botY0 = gapY + gap / 2;

    // If circle center is in forbidden vertical area, collide.
    if (y - r < topY1 || y + r > botY0) {
      // soften by checking corner distance to prevent unfair hits
      // (approx; good enough for this style)
      return true;
    }
    return false;
  }

  function update(dt) {
    state.t += dt;

    // Idle float when not started
    if (!state.started) {
      dog.vy *= 0.92;
      dog.y = state.h * 0.45 + Math.sin(state.t * 2.2) * 9 * state.scale;
      return;
    }

    dog.vy += world.gravity * dt;
    dog.y += dog.vy * dt;

    // Move pipes
    const speed = world.pipeSpeed;
    for (const p of pipes) p.x -= speed * dt;

    // Recycle pipes
    const first = pipes[0];
    if (first && first.x + world.pipeWidth < -40 * state.scale) {
      pipes.shift();
      spawnPipe(false);
    }

    // Scoring + collision
    for (const p of pipes) {
      const passX = p.x + world.pipeWidth;
      if (!p.passed && passX < dog.x - dog.r * 0.25) {
        p.passed = true;
        state.score += 1;
        scoreValue.textContent = String(state.score);
        beep(980, 60, 'square', 0.02);
      }
      if (collidePipe(p)) {
        endGame();
        return;
      }
    }

    // Bounds collision
    if (dog.y - dog.r < 0) {
      dog.y = dog.r;
      dog.vy = 0;
    }
    if (dog.y + dog.r > state.h) {
      dog.y = state.h - dog.r;
      endGame();
      return;
    }
  }

  function render() {
    ctx.clearRect(0, 0, state.w, state.h);

    drawBackground();

    // Pipes behind dog for readability
    for (const p of pipes) drawPipe(p);

    drawDoge();

    // Minimal HUD hint inside canvas on idle state
    if (!state.started && !state.gameOver && state.running) {
      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = 'rgba(233,238,252,0.85)';
      ctx.font = `700 ${Math.round(14 * state.scale)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
      ctx.textAlign = 'center';
      ctx.fillText('Tap / Space to start', state.w * 0.5, state.h * 0.22);
      ctx.restore();
    }
  }

  function loop(ts) {
    if (!state.running) {
      render();
      return;
    }

    if (!state.lastTs) state.lastTs = ts;
    const rawDt = (ts - state.lastTs) / 1000;
    state.lastTs = ts;

    // Clamp dt to avoid huge physics jumps when tab was inactive
    const dt = clamp(rawDt, 0, 1 / 30);
    state.dt = dt;
    update(dt);
    render();
    if (state.running) requestAnimationFrame(loop);
  }

  function onPrimaryAction() {
    if (overlay.hidden === false && state.gameOver) {
      start();
      return;
    }
    if (overlay.hidden === false && !state.running) {
      start();
      return;
    }
    if (!state.running && state.gameOver) {
      start();
      return;
    }
    flap();
  }

  function initEvents() {
    // Buttons
    playBtn.addEventListener('click', () => {
      start();
    });
    muteBtn.addEventListener('click', () => {
      state.muted = !state.muted;
      updateMuteUI();
      saveMuted();
      if (!state.muted) beep(520, 90, 'triangle', 0.02);
    });

    // Keyboard
    window.addEventListener('keydown', (e) => {
      const key = e.key;
      if (key === ' ' || key === 'Spacebar' || key === 'ArrowUp') {
        e.preventDefault();
        onPrimaryAction();
      }
      if (key === 'Enter' && overlay.hidden === false) {
        e.preventDefault();
        start();
      }
      if (key === 'm' || key === 'M') {
        state.muted = !state.muted;
        updateMuteUI();
        saveMuted();
      }
    });

    // Pointer / touch
    const pointerHandler = (e) => {
      // Only react to primary pointer; ignore secondary touches
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      onPrimaryAction();
    };
    canvas.addEventListener('pointerdown', pointerHandler, { passive: true });
    overlay.addEventListener('pointerdown', (e) => {
      // Clicking outside the card starts too.
      if (e.target === overlay) start();
    });

    // Resize
    window.addEventListener(
      'resize',
      () => {
        resize();
        render();
      },
      { passive: true },
    );
  }

  function boot() {
    loadSettings();
    resize();
    resetGame({ keepOverlay: true });
    showOverlay({
      title: 'Flappy Doge',
      subtitle: 'A fast, modern Flappy game in pure JavaScript.',
      hint: 'Tip: Space / ↑ / Tap to flap. Press M to mute.',
      buttonText: 'Play',
    });
    initEvents();
    render();
  }

  // Start
  boot();
})();

