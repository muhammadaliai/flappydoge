"use strict";

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d", { alpha: true });

const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlayMessage = document.getElementById("overlay-message");
const startButton = document.getElementById("start-button");
const scoreValue = document.getElementById("score-value");
const bestValue = document.getElementById("best-value");

const state = {
  mode: "ready",
  score: 0,
  best: 0,
  lastTime: 0,
  elapsed: 0,
};

const view = {
  width: 0,
  height: 0,
  ratio: 1,
};

const settings = {
  gravity: 1900,
  flap: -650,
  terminal: 1300,
  pipeSpeed: 280,
  pipeSpacing: 360,
  pipeWidth: 80,
  pipeGap: 200,
  groundHeight: 72,
  dogRadius: 24,
  bob: 12,
};

const dog = {
  x: 0,
  y: 0,
  velocity: 0,
  rotation: 0,
};

const pipes = [];
const clouds = [];
let spawnTimer = 0;

const storageKey = "flappyDogBest";

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function computeSettings() {
  const minDim = Math.min(view.width, view.height);
  settings.dogRadius = clamp(minDim * 0.045, 16, 30);
  settings.pipeWidth = clamp(minDim * 0.13, 50, 120);
  settings.groundHeight = clamp(view.height * 0.12, 56, 120);
  settings.pipeSpeed = clamp(view.width * 0.38, 200, 430);
  settings.pipeSpacing = clamp(view.width * 0.7, 260, 520);
  settings.bob = clamp(minDim * 0.02, 8, 16);
  settings.gravity = 1900 * (minDim / 700);
  settings.flap = -650 * (minDim / 700);
  settings.terminal = 1300 * (minDim / 700);
  settings.pipeGap = clamp(minDim * 0.34, 150, 280);
  const available = view.height - settings.groundHeight - 80;
  settings.pipeGap = Math.min(settings.pipeGap, Math.max(120, available));
}

function resetDogPosition() {
  dog.x = view.width * 0.28;
  dog.y = view.height * 0.5;
  dog.velocity = 0;
  dog.rotation = 0;
}

function createClouds() {
  clouds.length = 0;
  const count = clamp(Math.round(view.width / 220), 5, 10);
  for (let i = 0; i < count; i += 1) {
    const scale = randomRange(0.6, 1.2);
    clouds.push({
      x: randomRange(0, view.width),
      y: randomRange(30, view.height * 0.45),
      scale,
      speed: randomRange(12, 26),
    });
  }
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const newWidth = Math.max(1, rect.width);
  const newHeight = Math.max(1, rect.height);
  const oldWidth = view.width || newWidth;
  const oldHeight = view.height || newHeight;

  view.width = newWidth;
  view.height = newHeight;
  view.ratio = Math.max(window.devicePixelRatio || 1, 1);

  canvas.width = Math.round(newWidth * view.ratio);
  canvas.height = Math.round(newHeight * view.ratio);
  ctx.setTransform(view.ratio, 0, 0, view.ratio, 0, 0);

  computeSettings();

  if (state.mode === "playing" || state.mode === "gameover") {
    const scaleX = newWidth / oldWidth;
    const scaleY = newHeight / oldHeight;
    dog.x *= scaleX;
    dog.y *= scaleY;
    pipes.forEach((pipe) => {
      pipe.x *= scaleX;
      pipe.gapY *= scaleY;
    });
    clouds.forEach((cloud) => {
      cloud.x *= scaleX;
      cloud.y *= scaleY;
    });
  } else {
    resetDogPosition();
  }

  dog.x = view.width * 0.28;
  createClouds();
}

function updateOverlay() {
  if (state.mode === "playing") {
    overlay.classList.add("hidden");
    return;
  }

  overlay.classList.remove("hidden");

  if (state.mode === "gameover") {
    overlayTitle.textContent = "Nice try!";
    overlayMessage.textContent = `Score: ${state.score} | Best: ${state.best}`;
    startButton.textContent = "Play again";
  } else {
    overlayTitle.textContent = "Flappy Dog";
    overlayMessage.textContent = "Tap, click, or press Space to flap.";
    startButton.textContent = "Start";
  }
}

function updateScoreUI() {
  scoreValue.textContent = `${state.score}`;
  bestValue.textContent = `${state.best}`;
}

function loadBestScore() {
  try {
    const stored = Number.parseInt(localStorage.getItem(storageKey) || "0", 10);
    state.best = Number.isNaN(stored) ? 0 : stored;
  } catch (error) {
    state.best = 0;
  }
  updateScoreUI();
}

function saveBestScore() {
  try {
    localStorage.setItem(storageKey, `${state.best}`);
  } catch (error) {
    // Ignore storage errors in restricted environments.
  }
}

function spawnPipe() {
  const gap = settings.pipeGap;
  const topLimit = gap * 0.5 + 40;
  const bottomLimit = view.height - settings.groundHeight - gap * 0.5 - 20;
  const safeBottom = Math.max(topLimit + 20, bottomLimit);
  const gapY = randomRange(topLimit, safeBottom);

  pipes.push({
    x: view.width + settings.pipeWidth,
    gapY,
    scored: false,
  });
}

function startGame() {
  state.mode = "playing";
  state.score = 0;
  spawnTimer = 0;
  pipes.length = 0;
  resetDogPosition();
  updateScoreUI();
  updateOverlay();
}

function endGame() {
  state.mode = "gameover";
  state.best = Math.max(state.best, state.score);
  saveBestScore();
  updateScoreUI();
  updateOverlay();
}

function flap() {
  if (state.mode === "playing") {
    dog.velocity = settings.flap;
    return;
  }

  if (state.mode === "ready" || state.mode === "gameover") {
    startGame();
    dog.velocity = settings.flap;
  }
}

function updateDog(dt) {
  dog.velocity += settings.gravity * dt;
  dog.velocity = Math.min(dog.velocity, settings.terminal);
  dog.y += dog.velocity * dt;
  dog.rotation = clamp(dog.velocity / settings.terminal, -0.6, 1.1);
}

function updatePipes(dt) {
  spawnTimer -= dt;
  if (spawnTimer <= 0) {
    spawnPipe();
    spawnTimer = settings.pipeSpacing / settings.pipeSpeed;
  }

  for (let i = pipes.length - 1; i >= 0; i -= 1) {
    const pipe = pipes[i];
    pipe.x -= settings.pipeSpeed * dt;

    if (!pipe.scored && pipe.x + settings.pipeWidth < dog.x) {
      pipe.scored = true;
      state.score += 1;
      updateScoreUI();
    }

    if (pipe.x + settings.pipeWidth < -20) {
      pipes.splice(i, 1);
    }
  }
}

function checkCollisions() {
  if (dog.y - settings.dogRadius <= 0) {
    return true;
  }

  if (dog.y + settings.dogRadius >= view.height - settings.groundHeight) {
    return true;
  }

  for (let i = 0; i < pipes.length; i += 1) {
    const pipe = pipes[i];
    const withinX =
      dog.x + settings.dogRadius > pipe.x &&
      dog.x - settings.dogRadius < pipe.x + settings.pipeWidth;
    if (!withinX) {
      continue;
    }

    const gapTop = pipe.gapY - settings.pipeGap * 0.5;
    const gapBottom = pipe.gapY + settings.pipeGap * 0.5;
    if (dog.y - settings.dogRadius < gapTop) {
      return true;
    }
    if (dog.y + settings.dogRadius > gapBottom) {
      return true;
    }
  }

  return false;
}

function updateClouds(dt) {
  const cloudRange = view.width + 200;
  clouds.forEach((cloud) => {
    cloud.x -= cloud.speed * dt;
    if (cloud.x < -200) {
      cloud.x = cloudRange;
      cloud.y = randomRange(30, view.height * 0.45);
    }
  });
}

function update(dt) {
  state.elapsed += dt;
  updateClouds(dt);

  if (state.mode === "ready") {
    dog.y = view.height * 0.5 + Math.sin(state.elapsed * 2) * settings.bob;
    dog.rotation = Math.sin(state.elapsed * 2) * 0.1;
    return;
  }

  if (state.mode !== "playing") {
    return;
  }

  updateDog(dt);
  updatePipes(dt);

  if (checkCollisions()) {
    endGame();
  }
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, view.height);
  gradient.addColorStop(0, "#74d4ff");
  gradient.addColorStop(0.6, "#cceeff");
  gradient.addColorStop(1, "#f8fbff");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, view.width, view.height);

  ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
  ctx.beginPath();
  ctx.arc(view.width * 0.15, view.height * 0.18, 36, 0, Math.PI * 2);
  ctx.fill();
}

function drawCloud(cloud) {
  const base = 26 * cloud.scale;
  ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
  ctx.beginPath();
  ctx.arc(cloud.x, cloud.y, base, 0, Math.PI * 2);
  ctx.arc(cloud.x + base * 0.9, cloud.y + base * 0.2, base * 0.8, 0, Math.PI * 2);
  ctx.arc(cloud.x - base * 0.9, cloud.y + base * 0.2, base * 0.75, 0, Math.PI * 2);
  ctx.arc(cloud.x, cloud.y + base * 0.4, base * 0.9, 0, Math.PI * 2);
  ctx.fill();
}

function drawClouds() {
  clouds.forEach(drawCloud);
}

function drawPipeSection(x, y, height, isTop) {
  const width = settings.pipeWidth;
  ctx.fillStyle = "#21c476";
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
  ctx.fillRect(x + width * 0.12, y, width * 0.18, height);

  const lipHeight = Math.max(8, width * 0.15);
  ctx.fillStyle = "#1aa864";
  if (isTop) {
    ctx.fillRect(x - 4, y + height - lipHeight, width + 8, lipHeight);
  } else {
    ctx.fillRect(x - 4, y, width + 8, lipHeight);
  }
}

function drawPipes() {
  pipes.forEach((pipe) => {
    const gapTop = pipe.gapY - settings.pipeGap * 0.5;
    const gapBottom = pipe.gapY + settings.pipeGap * 0.5;
    drawPipeSection(pipe.x, 0, gapTop, true);
    drawPipeSection(
      pipe.x,
      gapBottom,
      view.height - gapBottom - settings.groundHeight,
      false
    );
  });
}

function drawGround() {
  const y = view.height - settings.groundHeight;
  const gradient = ctx.createLinearGradient(0, y, 0, view.height);
  gradient.addColorStop(0, "#ffd166");
  gradient.addColorStop(1, "#f28f3b");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, y, view.width, settings.groundHeight);

  ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
  for (let i = 0; i < view.width; i += 32) {
    ctx.fillRect(i, y + settings.groundHeight * 0.25, 14, 6);
  }
}

function drawDog() {
  const x = dog.x;
  const y = dog.y;
  const r = settings.dogRadius;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(dog.rotation);

  ctx.fillStyle = "#ff6b6b";
  ctx.beginPath();
  ctx.moveTo(-r * 0.2, r * 0.15);
  ctx.lineTo(-r * 1.4, r * 0.45);
  ctx.lineTo(-r * 0.2, r * 0.7);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "#d4874a";
  ctx.lineWidth = Math.max(2, r * 0.18);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-r * 1.0, -r * 0.1);
  ctx.quadraticCurveTo(-r * 1.4, -r * 0.2, -r * 1.2, -r * 0.6);
  ctx.stroke();

  ctx.fillStyle = "#f6c18b";
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.05, r * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f9e1c8";
  ctx.beginPath();
  ctx.ellipse(0.1 * r, 0.2 * r, r * 0.55, r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#e2a36c";
  ctx.beginPath();
  ctx.ellipse(-r * 0.35, -r * 0.9, r * 0.32, r * 0.25, -0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffd7b5";
  ctx.beginPath();
  ctx.ellipse(-r * 0.32, -r * 0.95, r * 0.16, r * 0.12, -0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f6c18b";
  ctx.beginPath();
  ctx.ellipse(r * 0.7, r * 0.15, r * 0.45, r * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1f2937";
  ctx.beginPath();
  ctx.arc(r * 0.3, -r * 0.15, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(r * 0.32, -r * 0.18, r * 0.04, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#1f2937";
  ctx.beginPath();
  ctx.arc(r * 0.86, r * 0.2, r * 0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, view.width, view.height);
  drawBackground();
  drawClouds();
  drawPipes();
  drawGround();
  drawDog();
}

function loop(timestamp) {
  if (!state.lastTime) {
    state.lastTime = timestamp;
  }
  const delta = clamp((timestamp - state.lastTime) / 1000, 0, 0.033);
  state.lastTime = timestamp;
  update(delta);
  draw();
  window.requestAnimationFrame(loop);
}

function init() {
  loadBestScore();
  resizeCanvas();
  updateOverlay();
  window.requestAnimationFrame(loop);
}

window.addEventListener("resize", resizeCanvas);

document.addEventListener(
  "pointerdown",
  (event) => {
    if (event.target && event.target.closest("button")) {
      return;
    }
    event.preventDefault();
    flap();
  },
  { passive: false }
);

document.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code === "ArrowUp") {
    event.preventDefault();
    flap();
  }
});

startButton.addEventListener("click", () => {
  flap();
});

init();
