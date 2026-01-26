"use strict";

// Flappy Dog - dependency-free, responsive canvas game.
// Security note: no dynamic code execution, no external resources.

/** @typedef {{x:number,y:number,w:number,h:number,passed?:boolean}} Rect */

(function () {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("game"));
  const scoreEl = /** @type {HTMLElement} */ (document.getElementById("score"));
  const bestEl = /** @type {HTMLElement} */ (document.getElementById("best"));
  const overlay = /** @type {HTMLElement} */ (document.getElementById("overlay"));
  const messageEl = /** @type {HTMLElement} */ (document.getElementById("message"));
  const startBtn = /** @type {HTMLButtonElement} */ (document.getElementById("start"));
  const howBtn = /** @type {HTMLButtonElement} */ (document.getElementById("how"));
  const howText = /** @type {HTMLElement} */ (document.getElementById("howText"));
  const muteBtn = /** @type {HTMLButtonElement} */ (document.getElementById("mute"));

  /** @type {CanvasRenderingContext2D} */
  const ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!ctx) return;

  // --- Responsive rendering ---
  const VIEW_W = 1000;
  const VIEW_H = 700;
  let dpr = 1;
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    scale = Math.min(canvas.width / VIEW_W, canvas.height / VIEW_H);
    offsetX = (canvas.width - VIEW_W * scale) * 0.5;
    offsetY = (canvas.height - VIEW_H * scale) * 0.5;
  }

  // --- Game state ---
  const STATE = { MENU: 0, PLAY: 1, DEAD: 2 };
  let state = STATE.MENU;

  const rng = (() => {
    // Deterministic-ish seed from crypto if available (not required).
    let s = 0x12345678;
    try {
      const a = new Uint32Array(1);
      crypto.getRandomValues(a);
      s = a[0] ^ 0x9e3779b9;
    } catch {
      s = (Date.now() >>> 0) ^ 0x9e3779b9;
    }
    return () => {
      // xorshift32
      s ^= s << 13;
      s ^= s >>> 17;
      s ^= s << 5;
      return ((s >>> 0) / 4294967296);
    };
  })();

  const storageKey = "flappyDog.best.v1";
  const bestScore = (() => {
    try {
      const v = localStorage.getItem(storageKey);
      const n = v ? Number(v) : 0;
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
    } catch {
      return 0;
    }
  })();
  let best = bestScore;
  bestEl.textContent = String(best);

  let score = 0;
  let time = 0;
  let lastTs = 0;

  const dog = {
    x: 260,
    y: 340,
    vy: 0,
    r: 22,
    flap: -440, // px/s impulse
    maxVy: 820,
  };

  /** @type {Rect[]} */
  let pipes = [];
  let spawnTimer = 0;

  const world = {
    gravity: 1400, // px/s^2
    speed: 280, // px/s
    pipeW: 86,
    gap: 170,
    pipeEvery: 1.28, // seconds
    basePipeSpacing: 420, // px at base speed
    floorH: 90,
  };

  const visuals = {
    skyA: "#0b1020",
    skyB: "#060912",
    accentA: "#7c5cff",
    accentB: "#25e6d7",
    grass: "#0b2a1f",
    grass2: "#0f3a2a",
    pipe: "#163f38",
    pipeEdge: "rgba(255,255,255,0.20)",
    pipeGlow: "rgba(37,230,215,0.18)",
  };

  // --- Sound (very lightweight, optional) ---
  /** @type {AudioContext | null} */
  let audioCtx = null;
  let muted = false;

  function setMuted(next) {
    muted = !!next;
    muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    muteBtn.title = muted ? "Sound off" : "Sound on";
    try {
      localStorage.setItem("flappyDog.muted.v1", muted ? "1" : "0");
    } catch {
      // ignore
    }
  }

  (function restoreMuted() {
    try {
      const v = localStorage.getItem("flappyDog.muted.v1");
      setMuted(v === "1");
    } catch {
      setMuted(false);
    }
  })();

  function beep(freq, dur, type = "sine", gain = 0.06) {
    if (muted) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      // On iOS, resume requires a gesture; if blocked, just skip.
      if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});

      const t0 = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(audioCtx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    } catch {
      // ignore
    }
  }

  function sFlap() {
    beep(560, 0.08, "triangle", 0.05);
  }
  function sScore() {
    beep(820, 0.06, "sine", 0.05);
    beep(1040, 0.05, "sine", 0.04);
  }
  function sHit() {
    beep(140, 0.12, "square", 0.05);
  }

  // --- UI helpers ---
  function showOverlay(text, showButtons = true) {
    overlay.style.display = "grid";
    messageEl.textContent = text;
    startBtn.style.display = showButtons ? "inline-flex" : "none";
    howBtn.style.display = showButtons ? "inline-flex" : "none";
  }
  function hideOverlay() {
    overlay.style.display = "none";
  }

  function reset(runIntoPlay = false) {
    score = 0;
    scoreEl.textContent = "0";
    time = 0;
    dog.x = 260;
    dog.y = 340;
    dog.vy = 0;
    pipes = [];
    spawnTimer = 0;
    const gap0 = gapForScore(0);
    const startX = VIEW_W + 350;
    for (let i = 0; i < 4; i++) spawnPipe(startX + i * world.basePipeSpacing, gap0);
    state = runIntoPlay ? STATE.PLAY : STATE.MENU;
    if (state === STATE.MENU) {
      showOverlay("Press Space or tap to start.");
    } else {
      hideOverlay();
    }
  }

  function setBest(next) {
    best = next;
    bestEl.textContent = String(best);
    try {
      localStorage.setItem(storageKey, String(best));
    } catch {
      // ignore
    }
  }

  function spawnPipe(x, gap) {
    const marginTop = 90;
    const marginBottom = world.floorH + 80;
    const g = clamp(gap + (rng() - 0.5) * 18, 135, 210);
    const centerMin = marginTop + g * 0.5;
    const centerMax = VIEW_H - marginBottom - g * 0.5;
    const center = lerp(centerMin, centerMax, rng());
    const topH = Math.max(0, center - g * 0.5);
    const botY = center + g * 0.5;
    const botH = Math.max(0, VIEW_H - world.floorH - botY);

    // Represent as two rects, but share passed marker on the "pair" via the first rect.
    pipes.push({ x, y: 0, w: world.pipeW, h: topH, passed: false });
    pipes.push({ x, y: botY, w: world.pipeW, h: botH });
  }

  function flap() {
    if (state === STATE.MENU) {
      reset(true);
      sFlap();
      dog.vy = dog.flap;
      return;
    }
    if (state === STATE.DEAD) {
      reset(true);
      sFlap();
      dog.vy = dog.flap;
      return;
    }
    if (state !== STATE.PLAY) return;
    dog.vy = dog.flap;
    sFlap();
  }

  // --- Input ---
  function onKeyDown(e) {
    if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
      e.preventDefault();
      flap();
    } else if (e.code === "Enter") {
      e.preventDefault();
      if (state !== STATE.PLAY) reset(true);
      else flap();
    } else if (e.code === "KeyM") {
      setMuted(!muted);
    }
  }

  function onPointerDown(e) {
    // Only left click / primary touch
    if ("button" in e && e.button !== 0) return;
    flap();
  }

  window.addEventListener("keydown", onKeyDown, { passive: false });
  canvas.addEventListener("pointerdown", onPointerDown, { passive: true });

  startBtn.addEventListener("click", () => reset(true));
  howBtn.addEventListener("click", () => {
    howText.hidden = !howText.hidden;
  });
  muteBtn.addEventListener("click", () => setMuted(!muted));

  // --- Math ---
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }
  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function gapForScore(s) {
    const targetGap = world.gap - Math.min(34, s * 1.25);
    return clamp(targetGap, 138, 192);
  }

  function circleRectCollides(cx, cy, cr, rx, ry, rw, rh) {
    const x = clamp(cx, rx, rx + rw);
    const y = clamp(cy, ry, ry + rh);
    const dx = cx - x;
    const dy = cy - y;
    return dx * dx + dy * dy <= cr * cr;
  }

  // --- Rendering ---
  function withViewport(fn) {
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
    fn();
    ctx.restore();
  }

  function drawBackground(t) {
    // Sky gradient
    const g = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    g.addColorStop(0, visuals.skyA);
    g.addColorStop(1, visuals.skyB);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // Aurora-ish soft bands
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.translate(0, 0);
    for (let i = 0; i < 5; i++) {
      const y = 60 + i * 38 + Math.sin(t * 0.4 + i) * 6;
      const band = ctx.createLinearGradient(0, y, VIEW_W, y + 1);
      band.addColorStop(0, "rgba(124,92,255,0.00)");
      band.addColorStop(0.25, "rgba(124,92,255,0.10)");
      band.addColorStop(0.55, "rgba(37,230,215,0.10)");
      band.addColorStop(1, "rgba(37,230,215,0.00)");
      ctx.fillStyle = band;
      ctx.fillRect(0, y, VIEW_W, 60);
    }
    ctx.restore();

    // Distant hills
    drawHills(t);
  }

  function drawHills(t) {
    const baseY = VIEW_H - world.floorH - 40;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    for (let x = 0; x <= VIEW_W + 20; x += 40) {
      const y = baseY + Math.sin((x * 0.008) + t * 0.25) * 18 + Math.sin((x * 0.015) + t * 0.18) * 8;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(VIEW_W, VIEW_H);
    ctx.lineTo(0, VIEW_H);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawFloor(t) {
    const y = VIEW_H - world.floorH;
    const g = ctx.createLinearGradient(0, y, 0, VIEW_H);
    g.addColorStop(0, visuals.grass2);
    g.addColorStop(1, visuals.grass);
    ctx.fillStyle = g;
    ctx.fillRect(0, y, VIEW_W, world.floorH);

    // subtle moving stripes for motion
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    const stripeW = 52;
    const off = ((t * 80) % stripeW);
    for (let x = -stripeW; x < VIEW_W + stripeW; x += stripeW) {
      ctx.fillRect(x - off, y + 16, 20, 4);
    }
    ctx.restore();
  }

  function drawPipeRect(r, isTop) {
    const x = r.x;
    const y = r.y;
    const w = r.w;
    const h = r.h;
    if (h <= 0) return;

    // body
    const body = ctx.createLinearGradient(x, y, x + w, y);
    body.addColorStop(0, "rgba(22,63,56,0.95)");
    body.addColorStop(0.55, "rgba(37,230,215,0.14)");
    body.addColorStop(1, "rgba(22,63,56,0.92)");
    ctx.fillStyle = body;
    roundRect(x, y, w, h, 16);
    ctx.fill();

    // edge highlight
    ctx.strokeStyle = visuals.pipeEdge;
    ctx.lineWidth = 2;
    ctx.stroke();

    // rim
    const rimH = 18;
    const rimY = isTop ? (y + h - rimH) : y;
    const rim = ctx.createLinearGradient(x, rimY, x + w, rimY);
    rim.addColorStop(0, "rgba(255,255,255,0.12)");
    rim.addColorStop(0.5, "rgba(37,230,215,0.22)");
    rim.addColorStop(1, "rgba(255,255,255,0.10)");
    ctx.fillStyle = rim;
    roundRect(x - 4, rimY, w + 8, rimH, 16);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // glow
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.shadowColor = visuals.pipeGlow;
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = "rgba(37,230,215,0.22)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawDog(t) {
    const x = dog.x;
    const y = dog.y;
    const r = dog.r;
    const tilt = clamp(dog.vy / 900, -0.55, 0.75);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);

    // Shadow
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath();
    ctx.ellipse(-8, r + 18, r * 0.95, r * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Body gradient
    const body = ctx.createLinearGradient(-r, -r, r, r);
    body.addColorStop(0, "#f7d9a2");
    body.addColorStop(0.5, "#f1b95f");
    body.addColorStop(1, "#d9832a");

    // Body (rounded blob)
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.05, r * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();

    // Belly highlight
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.ellipse(-6, 3, r * 0.52, r * 0.40, 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Ear (back)
    ctx.fillStyle = "#c46c20";
    roundRect(-r * 0.75, -r * 0.95, r * 0.52, r * 0.72, 10);
    ctx.fill();

    // Ear (front) w/ flap wiggle
    const wig = Math.sin(t * 10) * 0.08 + (dog.vy < 0 ? 0.08 : -0.02);
    ctx.save();
    ctx.translate(-r * 0.55, -r * 0.85);
    ctx.rotate(wig);
    ctx.fillStyle = "#cc7524";
    roundRect(-r * 0.1, -r * 0.1, r * 0.58, r * 0.8, 10);
    ctx.fill();
    ctx.restore();

    // Snout
    ctx.fillStyle = "#f7e7cf";
    roundRect(r * 0.18, -r * 0.18, r * 0.72, r * 0.52, 14);
    ctx.fill();

    // Nose
    ctx.fillStyle = "#1b1c22";
    ctx.beginPath();
    ctx.ellipse(r * 0.80, -r * 0.03, r * 0.12, r * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eye
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.ellipse(r * 0.18, -r * 0.28, r * 0.18, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#13151b";
    ctx.beginPath();
    ctx.ellipse(r * 0.23, -r * 0.28, r * 0.08, r * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tail
    ctx.save();
    const tailWig = Math.sin(t * 9) * 0.25;
    ctx.translate(-r * 0.95, r * 0.05);
    ctx.rotate(-0.4 + tailWig);
    ctx.fillStyle = "#d9832a";
    roundRect(-r * 0.18, -r * 0.18, r * 0.62, r * 0.34, 10);
    ctx.fill();
    ctx.restore();

    // Tiny jetpack puff (just for "flying dog" vibes)
    ctx.save();
    ctx.globalAlpha = 0.55;
    const puffX = -r * 1.05;
    const puffY = r * 0.15;
    for (let i = 0; i < 3; i++) {
      const px = puffX - i * 10 - (t * 90) % 18;
      const py = puffY + Math.sin(t * 8 + i) * 3;
      ctx.fillStyle = i === 1 ? "rgba(37,230,215,0.35)" : "rgba(124,92,255,0.28)";
      ctx.beginPath();
      ctx.ellipse(px, py, 7 - i * 1.2, 5 - i * 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Outline
    ctx.strokeStyle = "rgba(0,0,0,0.26)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.05, r * 0.95, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  // --- Simulation ---
  function update(dt) {
    time += dt;
    if (state !== STATE.PLAY) return;

    // difficulty scales mildly with score
    const speed = world.speed + Math.min(120, score * 5);
    const gapNow = gapForScore(score);
    const spawnEvery = clamp(world.basePipeSpacing / speed, 0.9, 1.55);

    // dog physics
    dog.vy += world.gravity * dt;
    dog.vy = clamp(dog.vy, -900, dog.maxVy);
    dog.y += dog.vy * dt;

    // pipes
    for (let i = 0; i < pipes.length; i++) {
      pipes[i].x -= speed * dt;
    }

    // spawn: time-based, spacing stays consistent as speed changes
    spawnTimer += dt;
    if (spawnTimer >= spawnEvery) {
      spawnTimer = 0;
      spawnPipe(VIEW_W + 320, gapNow);
    }

    // cleanup (remove pairs offscreen)
    while (pipes.length && pipes[0].x + pipes[0].w < -120) {
      pipes.shift();
      pipes.shift();
    }

    // scoring: when dog passes pipe centerline
    for (let i = 0; i < pipes.length; i += 2) {
      const top = pipes[i];
      if (!top.passed && top.x + top.w < dog.x - dog.r) {
        top.passed = true;
        score += 1;
        scoreEl.textContent = String(score);
        sScore();
      }
    }

    // collisions
    const floorY = VIEW_H - world.floorH;
    if (dog.y + dog.r > floorY) {
      dog.y = floorY - dog.r;
      die();
      return;
    }
    if (dog.y - dog.r < 0) {
      dog.y = dog.r;
      dog.vy = 0;
    }

    for (let i = 0; i < pipes.length; i++) {
      const r = pipes[i];
      if (circleRectCollides(dog.x, dog.y, dog.r, r.x, r.y, r.w, r.h)) {
        die();
        return;
      }
    }
  }

  function die() {
    if (state !== STATE.PLAY) return;
    state = STATE.DEAD;
    sHit();
    if (score > best) setBest(score);
    showOverlay(`Game over. Score: ${score}. Press Space/tap to retry.`);
  }

  function render() {
    // clear full canvas in device pixels
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    withViewport(() => {
      drawBackground(time);

      // pipes behind dog
      for (let i = 0; i < pipes.length; i += 2) {
        drawPipeRect(pipes[i], true);
        drawPipeRect(pipes[i + 1], false);
      }

      drawFloor(time);
      drawDog(time);

      // vignette
      ctx.save();
      const vg = ctx.createRadialGradient(VIEW_W * 0.5, VIEW_H * 0.45, 120, VIEW_W * 0.5, VIEW_H * 0.45, 760);
      vg.addColorStop(0, "rgba(0,0,0,0.00)");
      vg.addColorStop(1, "rgba(0,0,0,0.35)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.restore();

      if (state === STATE.MENU) {
        // subtle dog bobbing on menu
        // (dog.y already at default; no physics in menu)
      }
    });
  }

  // --- Loop ---
  function tick(ts) {
    if (!lastTs) lastTs = ts;
    const dt = clamp((ts - lastTs) / 1000, 0, 0.035);
    lastTs = ts;
    update(dt);
    render();
    requestAnimationFrame(tick);
  }

  // init
  resize();
  window.addEventListener("resize", resize, { passive: true });
  reset(false);
  requestAnimationFrame(tick);
})();

