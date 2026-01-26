// Flappy Dog - vanilla JS, fast & responsive (no external assets)

const $ = (sel) => {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
};

const canvas = /** @type {HTMLCanvasElement} */ ($("#game"));
const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d", { alpha: false }));

const elScore = $("#score");
const elBest = $("#best");
const elPanel = $("#panel");
const elTitle = elPanel.querySelector(".panel__title");
const elSub = elPanel.querySelector(".panel__sub");
const elHow = $("#how");
const btnStart = $("#btnStart");
const btnHow = $("#btnHow");
const btnPause = $("#btnPause");
const btnRestart = $("#btnRestart");

/** @typedef {"menu" | "playing" | "paused" | "gameover"} GameState */

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);

const storageKey = "flappyDogBest_v1";
const loadBest = () => {
  const n = Number.parseInt(localStorage.getItem(storageKey) ?? "0", 10);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
};
const saveBest = (n) => {
  try {
    localStorage.setItem(storageKey, String(n));
  } catch {
    // ignore (private mode, blocked storage, etc.)
  }
};

const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;

let cssW = 0;
let cssH = 0;
let dpr = 1;

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  cssW = Math.max(320, Math.floor(rect.width));
  cssH = Math.max(320, Math.floor(rect.height));
  dpr = clamp(window.devicePixelRatio || 1, 1, 2);

  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
}

window.addEventListener("resize", resizeCanvas, { passive: true });
window.addEventListener("orientationchange", resizeCanvas, { passive: true });
resizeCanvas();

// World tuning (scaled per screen size)
function world() {
  const s = Math.min(cssW, cssH);
  const unit = s / 600; // ~1.0 around 600px min dimension
  return {
    unit,
    gravity: 2600 * unit, // px/s^2
    flapImpulse: 760 * unit, // px/s
    maxFall: 1400 * unit,
    baseSpeed: 310 * unit, // px/s
    gap: clamp(190 * unit, 140 * unit, 240 * unit),
    pipeW: clamp(76 * unit, 62 * unit, 92 * unit),
    dogR: clamp(18 * unit, 14 * unit, 26 * unit),
    marginTop: 76 * unit,
    marginBottom: 98 * unit,
  };
}

/** @type {GameState} */
let state = "menu";
let time = 0;
let lastTs = 0;

let score = 0;
let best = loadBest();
elBest.textContent = String(best);

const dog = {
  x: 0,
  y: 0,
  vy: 0,
  rot: 0,
  flapCooldown: 0,
};

/** @typedef {{x:number, gapY:number, gapH:number, w:number, passed:boolean}} Obstacle */
/** @type {Obstacle[]} */
let obstacles = [];

const bg = {
  stars: [],
  clouds: [],
  ready: false,
};

function initBg() {
  const nStars = prefersReducedMotion ? 60 : 110;
  const nClouds = prefersReducedMotion ? 4 : 7;
  bg.stars = Array.from({ length: nStars }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: rand(0.6, 1.6),
    a: rand(0.35, 0.9),
    tw: rand(0.7, 1.5),
  }));
  bg.clouds = Array.from({ length: nClouds }, () => ({
    x: Math.random(),
    y: rand(0.08, 0.55),
    s: rand(0.55, 1.2),
    sp: rand(0.010, 0.022),
  }));
  bg.ready = true;
}
initBg();

function resetGame(alsoStart = false) {
  const w = world();
  score = 0;
  elScore.textContent = "0";

  dog.x = cssW * 0.34;
  dog.y = cssH * 0.5;
  dog.vy = 0;
  dog.rot = 0;
  dog.flapCooldown = 0;

  obstacles = [];
  const startX = cssW + w.pipeW;
  for (let i = 0; i < 4; i++) {
    obstacles.push(spawnObstacle(startX + i * (cssW * 0.44)));
  }

  if (alsoStart) setState("playing");
}

function spawnObstacle(x) {
  const w = world();
  const top = w.marginTop;
  const bot = cssH - w.marginBottom;
  const gapH = w.gap;
  const gapY = rand(top + gapH * 0.4, bot - gapH * 0.4);
  return { x, gapY, gapH, w: w.pipeW, passed: false };
}

function setState(next) {
  state = next;
  btnPause.textContent = state === "paused" ? "Resume" : "Pause";

  if (state === "menu") {
    elPanel.hidden = false;
    if (elTitle) elTitle.textContent = "Flappy Dog";
    if (elSub) elSub.textContent = "Tap / click / press Space to flap. Avoid the towers.";
    btnStart.textContent = "Start";
  } else if (state === "gameover") {
    elPanel.hidden = false;
    if (elTitle) elTitle.textContent = "Game Over";
    if (elSub) elSub.textContent = "Tap / click / Space to try again.";
    btnStart.textContent = "Play again";
  } else {
    elPanel.hidden = true;
  }
}

function flap() {
  if (state !== "playing") return;
  const w = world();
  if (dog.flapCooldown > 0) return;
  dog.vy = -w.flapImpulse;
  dog.flapCooldown = 0.04;
}

function togglePause() {
  if (state === "playing") setState("paused");
  else if (state === "paused") setState("playing");
}

function handleStartOrRestart() {
  if (state === "menu") {
    resetGame(true);
    return;
  }
  if (state === "gameover") {
    resetGame(true);
  }
}

btnStart.addEventListener("click", () => handleStartOrRestart());
btnRestart.addEventListener("click", () => {
  resetGame(state !== "menu");
  if (state !== "menu") setState("playing");
});
btnPause.addEventListener("click", () => togglePause());
btnHow.addEventListener("click", () => {
  const isHidden = elHow.hasAttribute("hidden");
  if (isHidden) elHow.removeAttribute("hidden");
  else elHow.setAttribute("hidden", "");
});

// Tap/click anywhere (except buttons) to flap / start
window.addEventListener(
  "pointerdown",
  (e) => {
    const target = /** @type {HTMLElement} */ (e.target);
    if (target?.closest?.("button, a, input, textarea, select, label")) return;
    if (state === "menu" || state === "gameover") {
      handleStartOrRestart();
      return;
    }
    flap();
  },
  { passive: true },
);

window.addEventListener("keydown", (e) => {
  const code = e.code;
  if (code === "Space" || code === "ArrowUp" || code === "KeyW") {
    e.preventDefault();
    if (state === "menu" || state === "gameover") handleStartOrRestart();
    else flap();
    return;
  }
  if (code === "KeyP") {
    e.preventDefault();
    togglePause();
    return;
  }
  if (code === "KeyR") {
    e.preventDefault();
    resetGame(state !== "menu");
    if (state !== "menu") setState("playing");
  }
});

function circleRectHit(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

function update(dt) {
  time += dt;
  if (!bg.ready) initBg();

  const w = world();

  if (state !== "playing") return;

  dog.flapCooldown = Math.max(0, dog.flapCooldown - dt);

  dog.vy = clamp(dog.vy + w.gravity * dt, -w.flapImpulse * 1.15, w.maxFall);
  dog.y += dog.vy * dt;

  const targetRot = clamp(dog.vy / 1000, -0.8, 1.1);
  dog.rot = lerp(dog.rot, targetRot, 1 - Math.pow(0.001, dt));

  const speed = w.baseSpeed * (1 + Math.min(0.55, score * 0.022));

  // Move / recycle obstacles
  let farthestX = -Infinity;
  for (const o of obstacles) farthestX = Math.max(farthestX, o.x);
  for (const o of obstacles) {
    o.x -= speed * dt;

    // score on pass
    if (!o.passed && o.x + o.w < dog.x) {
      o.passed = true;
      score += 1;
      elScore.textContent = String(score);
      if (score > best) {
        best = score;
        elBest.textContent = String(best);
        saveBest(best);
      }
    }

    // recycle offscreen
    if (o.x + o.w < -40) {
      o.x = farthestX + cssW * 0.44;
      const top = w.marginTop;
      const bot = cssH - w.marginBottom;
      o.gapH = w.gap;
      o.gapY = rand(top + o.gapH * 0.4, bot - o.gapH * 0.4);
      o.passed = false;
      farthestX = o.x;
    }
  }

  // Bounds
  if (dog.y < w.marginTop - 8) {
    dog.y = w.marginTop - 8;
    dog.vy = 0;
  }
  if (dog.y > cssH - w.marginBottom) {
    dog.y = cssH - w.marginBottom;
    gameOver();
    return;
  }

  // Collisions
  const r = w.dogR;
  for (const o of obstacles) {
    const gapTop = o.gapY - o.gapH * 0.5;
    const gapBot = o.gapY + o.gapH * 0.5;
    const x = o.x;
    const wPipe = o.w;

    // top tower
    if (circleRectHit(dog.x, dog.y, r, x, w.marginTop - 2000, wPipe, gapTop - (w.marginTop - 2000))) {
      gameOver();
      return;
    }
    // bottom tower
    if (circleRectHit(dog.x, dog.y, r, x, gapBot, wPipe, cssH - w.marginBottom - gapBot)) {
      gameOver();
      return;
    }
  }
}

function gameOver() {
  setState("gameover");
}

function drawRoundedRect(x, y, w, h, r) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawBackground() {
  // Base gradient
  const g = ctx.createLinearGradient(0, 0, 0, cssH);
  g.addColorStop(0, "#070b18");
  g.addColorStop(0.6, "#0b1220");
  g.addColorStop(1, "#050816");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cssW, cssH);

  // Soft blobs
  if (!prefersReducedMotion) {
    const t = time * 0.08;
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = "#7c3aed";
    ctx.beginPath();
    ctx.ellipse(cssW * (0.25 + 0.03 * Math.sin(t)), cssH * 0.22, cssW * 0.24, cssH * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#22c55e";
    ctx.beginPath();
    ctx.ellipse(cssW * (0.78 + 0.03 * Math.cos(t * 1.1)), cssH * 0.78, cssW * 0.26, cssH * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Stars
  const tw = prefersReducedMotion ? 0 : Math.sin(time * 1.2) * 0.35 + 0.65;
  for (const s of bg.stars) {
    const a = s.a * (prefersReducedMotion ? 1 : (0.6 + 0.4 * Math.sin(time * s.tw + s.x * 10) * 0.5 + 0.5)) * tw;
    ctx.globalAlpha = a;
    ctx.fillStyle = "#dbeafe";
    const x = s.x * cssW;
    const y = s.y * cssH;
    ctx.beginPath();
    ctx.arc(x, y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Clouds (simple soft shapes)
  const baseSpeed = prefersReducedMotion ? 0 : 0.06;
  for (const c of bg.clouds) {
    c.x = (c.x - baseSpeed * c.sp) % 1;
    const x = (c.x < 0 ? c.x + 1 : c.x) * cssW;
    const y = c.y * cssH;
    const w = cssW * 0.28 * c.s;
    const h = cssH * 0.06 * c.s;
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = "#e5e7eb";
    ctx.beginPath();
    ctx.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
    ctx.ellipse(x + w * 0.35, y + h * 0.2, w * 0.65, h * 0.9, 0, 0, Math.PI * 2);
    ctx.ellipse(x - w * 0.42, y + h * 0.14, w * 0.55, h * 0.82, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Ground glow
  const grd = ctx.createLinearGradient(0, cssH, 0, cssH * 0.72);
  grd.addColorStop(0, "rgba(0,0,0,0.35)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, cssH * 0.72, cssW, cssH * 0.28);
}

function drawObstacles() {
  const w = world();
  for (const o of obstacles) {
    const gapTop = o.gapY - o.gapH * 0.5;
    const gapBot = o.gapY + o.gapH * 0.5;

    // Tower paint (bone-ish pastel gradient)
    const grad = ctx.createLinearGradient(o.x, 0, o.x + o.w, 0);
    grad.addColorStop(0, "#e5e7eb");
    grad.addColorStop(0.5, "#f8fafc");
    grad.addColorStop(1, "#cbd5e1");

    const capGrad = ctx.createLinearGradient(o.x, 0, o.x + o.w, 0);
    capGrad.addColorStop(0, "rgba(124,58,237,0.55)");
    capGrad.addColorStop(1, "rgba(34,197,94,0.55)");

    // Top tower
    const topY = w.marginTop - 2000;
    const topH = gapTop - topY;
    ctx.fillStyle = grad;
    drawRoundedRect(o.x, topY, o.w, topH, 18 * w.unit);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Cap
    ctx.fillStyle = capGrad;
    drawRoundedRect(o.x - 6 * w.unit, gapTop - 18 * w.unit, o.w + 12 * w.unit, 22 * w.unit, 14 * w.unit);
    ctx.fill();

    // Bottom tower
    const botY = gapBot;
    const botH = cssH - w.marginBottom - botY;
    ctx.fillStyle = grad;
    drawRoundedRect(o.x, botY, o.w, botH, 18 * w.unit);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Cap
    ctx.fillStyle = capGrad;
    drawRoundedRect(o.x - 6 * w.unit, gapBot - 4 * w.unit, o.w + 12 * w.unit, 22 * w.unit, 14 * w.unit);
    ctx.fill();
  }
}

function drawDog() {
  const w = world();
  const r = w.dogR;
  const x = dog.x;
  const y = dog.y;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(dog.rot);

  // Shadow
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = "black";
  ctx.beginPath();
  ctx.ellipse(-r * 0.1, r * 1.1, r * 1.2, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // Body gradient
  const bodyGrad = ctx.createLinearGradient(-r, -r, r, r);
  bodyGrad.addColorStop(0, "#f59e0b"); // amber
  bodyGrad.addColorStop(1, "#f97316"); // orange

  // Belly
  const bellyGrad = ctx.createLinearGradient(-r, -r, r, r);
  bellyGrad.addColorStop(0, "#fde68a");
  bellyGrad.addColorStop(1, "#fdba74");

  // Ears
  ctx.fillStyle = "#7c2d12";
  ctx.beginPath();
  ctx.moveTo(-r * 0.75, -r * 0.65);
  ctx.quadraticCurveTo(-r * 1.2, -r * 0.2, -r * 0.85, r * 0.1);
  ctx.quadraticCurveTo(-r * 0.55, -r * 0.15, -r * 0.75, -r * 0.65);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(-r * 0.2, -r * 0.75);
  ctx.quadraticCurveTo(-r * 0.5, -r * 0.15, -r * 0.15, r * 0.05);
  ctx.quadraticCurveTo(r * 0.1, -r * 0.2, -r * 0.2, -r * 0.75);
  ctx.fill();

  // Tail
  ctx.strokeStyle = "#7c2d12";
  ctx.lineWidth = Math.max(2, 3.5 * w.unit);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-r * 1.05, r * 0.25);
  ctx.quadraticCurveTo(-r * 1.45, r * 0.05, -r * 1.25, -r * 0.25);
  ctx.stroke();

  // Body
  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.05, r * 0.92, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = Math.max(1.5, 2.2 * w.unit);
  ctx.stroke();

  // Belly patch
  ctx.fillStyle = bellyGrad;
  ctx.beginPath();
  ctx.ellipse(r * 0.1, r * 0.18, r * 0.65, r * 0.55, 0.35, 0, Math.PI * 2);
  ctx.fill();

  // Snout
  ctx.fillStyle = "#ffedd5";
  ctx.beginPath();
  ctx.ellipse(r * 0.65, r * 0.1, r * 0.55, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  // Nose
  ctx.fillStyle = "#111827";
  ctx.beginPath();
  ctx.arc(r * 0.98, r * 0.02, r * 0.12, 0, Math.PI * 2);
  ctx.fill();

  // Eye
  ctx.fillStyle = "#0b1220";
  ctx.beginPath();
  ctx.arc(r * 0.25, -r * 0.12, r * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.arc(r * 0.285, -r * 0.145, r * 0.05, 0, Math.PI * 2);
  ctx.fill();

  // Harness accent
  const harness = ctx.createLinearGradient(-r, 0, r, 0);
  harness.addColorStop(0, "rgba(124,58,237,0.9)");
  harness.addColorStop(1, "rgba(34,197,94,0.9)");
  ctx.strokeStyle = harness;
  ctx.lineWidth = Math.max(2.2, 3.2 * w.unit);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.75, -0.3, Math.PI * 0.9);
  ctx.stroke();

  ctx.restore();
}

function draw() {
  // Clear via background fill
  drawBackground();

  // Obstacles & dog
  drawObstacles();
  drawDog();

  // Helpful hint (subtle) while paused
  if (state === "paused") {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.84)";
    ctx.font = `600 ${Math.round(16 * world().unit + 10)}px ui-sans-serif, system-ui`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Paused", cssW * 0.5, cssH * 0.5 - 8);
    ctx.fillStyle = "rgba(255,255,255,0.62)";
    ctx.font = `500 ${Math.round(12 * world().unit + 8)}px ui-sans-serif, system-ui`;
    ctx.fillText("Press P or tap Pause to resume", cssW * 0.5, cssH * 0.5 + 18);
    ctx.restore();
  }
}

function frame(ts) {
  if (!lastTs) lastTs = ts;
  const rawDt = (ts - lastTs) / 1000;
  lastTs = ts;
  const dt = clamp(rawDt, 0, 1 / 30);

  // In case of resize between frames
  const rect = canvas.getBoundingClientRect();
  if (Math.floor(rect.width) !== cssW || Math.floor(rect.height) !== cssH) resizeCanvas();

  if (state !== "paused") update(dt);
  draw();

  requestAnimationFrame(frame);
}

// Boot
resetGame(false);
setState("menu");
requestAnimationFrame(frame);

