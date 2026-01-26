(() => {
  "use strict";

  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const scoreEl = document.getElementById("score");
  const bestEl = document.getElementById("best");
  const overlayEl = document.getElementById("overlay");
  const startBtn = document.getElementById("startBtn");
  const titleEl = document.getElementById("title");
  const messageEl = document.getElementById("message");
  const hintEl = document.getElementById("hint");

  let width = 0;
  let height = 0;
  let dpr = 1;
  let lastTime = 0;
  let running = false;
  let gameOver = true;
  let score = 0;
  let best = Number(localStorage.getItem("flappyDogBest") || 0);

  const dog = {
    x: 0,
    y: 0,
    vy: 0,
    radius: 0,
    rotation: 0,
  };

  const pipes = [];
  const clouds = [];

  let spawnTimer = 0;
  let pipeSpacing = 0;
  let pipeSpeed = 0;
  let pipeWidth = 0;
  let gapSize = 0;
  let gravity = 0;
  let flapStrength = 0;
  let groundHeight = 0;
  let wingFlap = 0;

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  ).matches;
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;

  bestEl.textContent = `Best: ${best}`;

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const rand = (min, max) => Math.random() * (max - min) + min;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width || window.innerWidth;
    height = rect.height || window.innerHeight;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;

    dog.radius = clamp(height * 0.04, 16, 30);
    dog.x = width * 0.28;
    dog.y = height * 0.5;

    pipeWidth = clamp(height * 0.12, 60, 110);
    groundHeight = Math.min(clamp(height * 0.12, 40, 120), height * 0.25);
    const verticalSpace = Math.max(60, height - groundHeight - 40);
    gapSize = clamp(height * 0.28, 110, 260);
    gapSize = Math.min(Math.max(gapSize, 60), verticalSpace);
    pipeSpacing = Math.max(240, width * 0.6);
    pipeSpeed = Math.max(160, width * 0.35);
    gravity = height * 3.2;
    flapStrength = height * 0.9;

    initClouds();
  }

  function initClouds() {
    clouds.length = 0;
    const count = prefersReducedMotion ? 3 : 6;
    for (let i = 0; i < count; i += 1) {
      clouds.push(createCloud(rand(0, width)));
    }
  }

  function createCloud(x) {
    const size = rand(height * 0.08, height * 0.18);
    return {
      x,
      y: rand(height * 0.08, height * 0.55),
      size,
      speed: rand(8, 22),
      opacity: rand(0.15, 0.35),
    };
  }

  function resetGame() {
    running = true;
    gameOver = false;
    score = 0;
    spawnTimer = 0;
    pipes.length = 0;
    dog.y = height * 0.5;
    dog.vy = 0;
    updateScore();
    showOverlay(false);
    hintEl.style.opacity = "0.7";
  }

  function endGame() {
    if (gameOver) return;
    running = false;
    gameOver = true;
    hintEl.style.opacity = "0.4";
    if (score > best) {
      best = score;
      localStorage.setItem("flappyDogBest", String(best));
      bestEl.textContent = `Best: ${best}`;
    }
    titleEl.textContent = "Nice try!";
    messageEl.textContent = "Tap, click, or press Space to try again.";
    startBtn.textContent = "Restart";
    showOverlay(true);
  }

  function updateScore() {
    scoreEl.textContent = String(score);
  }

  function showOverlay(show) {
    overlayEl.classList.toggle("hidden", !show);
  }

  function handleFlap() {
    if (!running) {
      titleEl.textContent = "Flappy Dog";
      messageEl.textContent = "Tap, click, or press Space to flap.";
      startBtn.textContent = "Start";
      resetGame();
      return;
    }
    dog.vy = -flapStrength;
  }

  function addPipe() {
    const margin = Math.max(20, height * 0.12);
    const minY = margin + gapSize / 2;
    const maxY = height - groundHeight - margin - gapSize / 2;
    const gapY =
      minY >= maxY ? (height - groundHeight) / 2 : rand(minY, maxY);
    pipes.push({
      x: width + pipeWidth,
      gapY,
      passed: false,
    });
  }

  function update(dt, time) {
    if (!running) {
      dog.y = height * 0.5 + Math.sin(time * 2.2) * dog.radius * 0.4;
      dog.rotation = Math.sin(time * 2.2) * 0.08;
      return;
    }

    dog.vy += gravity * dt;
    dog.y += dog.vy * dt;
    dog.rotation = clamp(dog.vy / (height * 1.6), -0.6, 0.8);

    spawnTimer += pipeSpeed * dt;
    if (spawnTimer > pipeSpacing) {
      addPipe();
      spawnTimer = 0;
    }

    for (let i = pipes.length - 1; i >= 0; i -= 1) {
      pipes[i].x -= pipeSpeed * dt;
      if (pipes[i].x + pipeWidth < -20) {
        pipes.splice(i, 1);
      }
    }

    for (const pipe of pipes) {
      if (!pipe.passed && dog.x > pipe.x + pipeWidth) {
        pipe.passed = true;
        score += 1;
        updateScore();
      }
    }

    const floorY = height - groundHeight;
    if (dog.y + dog.radius > floorY || dog.y - dog.radius < 0) {
      endGame();
      return;
    }

    for (const pipe of pipes) {
      const inX =
        dog.x + dog.radius > pipe.x && dog.x - dog.radius < pipe.x + pipeWidth;
      if (!inX) continue;
      const gapTop = pipe.gapY - gapSize / 2;
      const gapBottom = pipe.gapY + gapSize / 2;
      if (dog.y - dog.radius < gapTop || dog.y + dog.radius > gapBottom) {
        endGame();
        break;
      }
    }

    for (const cloud of clouds) {
      cloud.x -= cloud.speed * dt;
      if (cloud.x + cloud.size * 1.2 < 0) {
        Object.assign(cloud, createCloud(width + cloud.size));
      }
    }

    wingFlap = prefersReducedMotion ? 0 : Math.sin(time * 10) * 0.2;
  }

  function drawBackground() {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#1e3a8a");
    sky.addColorStop(0.5, "#0ea5e9");
    sky.addColorStop(1, "#7dd3fc");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "rgba(255, 255, 255, 0.18)";
    ctx.beginPath();
    ctx.arc(width * 0.78, height * 0.18, height * 0.12, 0, Math.PI * 2);
    ctx.fill();

    for (const cloud of clouds) {
      drawCloud(cloud);
    }
  }

  function drawCloud(cloud) {
    const { x, y, size, opacity } = cloud;
    ctx.fillStyle = `rgba(248, 250, 252, ${opacity})`;
    ctx.beginPath();
    ctx.ellipse(x, y, size * 0.55, size * 0.35, 0, 0, Math.PI * 2);
    ctx.ellipse(x + size * 0.4, y - size * 0.15, size * 0.45, size * 0.3, 0, 0, Math.PI * 2);
    ctx.ellipse(x - size * 0.45, y - size * 0.1, size * 0.4, size * 0.25, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGround() {
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, height - groundHeight, width, groundHeight);
    ctx.fillStyle = "#22c55e";
    ctx.fillRect(0, height - groundHeight, width, groundHeight * 0.12);

    const hillY = height - groundHeight;
    ctx.fillStyle = "rgba(34, 197, 94, 0.25)";
    for (let i = 0; i < width; i += 140) {
      ctx.beginPath();
      ctx.arc(i, hillY, 80, Math.PI, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPipe(pipe) {
    const topHeight = pipe.gapY - gapSize / 2;
    const bottomY = pipe.gapY + gapSize / 2;
    const bottomHeight = height - groundHeight - bottomY;

    ctx.fillStyle = "#22c55e";
    ctx.fillRect(pipe.x, 0, pipeWidth, topHeight);
    ctx.fillRect(pipe.x, bottomY, pipeWidth, bottomHeight);

    ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
    ctx.fillRect(pipe.x + pipeWidth * 0.12, 0, pipeWidth * 0.18, topHeight);
    ctx.fillRect(pipe.x + pipeWidth * 0.12, bottomY, pipeWidth * 0.18, bottomHeight);

    const rimHeight = pipeWidth * 0.18;
    ctx.fillStyle = "#16a34a";
    ctx.fillRect(pipe.x - pipeWidth * 0.08, topHeight - rimHeight, pipeWidth * 1.16, rimHeight);
    ctx.fillRect(pipe.x - pipeWidth * 0.08, bottomY, pipeWidth * 1.16, rimHeight);
  }

  function drawDog(time) {
    const r = dog.radius;
    ctx.save();
    ctx.translate(dog.x, dog.y);
    ctx.rotate(dog.rotation);

    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.6, r * 1.05, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fde68a";
    ctx.beginPath();
    ctx.ellipse(r * 0.2, r * 0.35, r * 0.9, r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.arc(r * 1.5, -r * 0.4, r * 0.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#d97706";
    ctx.beginPath();
    ctx.moveTo(r * 1.25, -r * 1.2);
    ctx.lineTo(r * 0.95, -r * 0.55);
    ctx.lineTo(r * 1.65, -r * 0.6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#1f2937";
    ctx.beginPath();
    ctx.arc(r * 1.75, -r * 0.45, r * 0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(r * 2.05, -r * 0.35, r * 0.14, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#f59e0b";
    ctx.lineWidth = r * 0.3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-r * 1.6, -r * 0.1);
    ctx.quadraticCurveTo(-r * 2.2, -r * 0.6, -r * 2.4, -r * 1.1);
    ctx.stroke();

    ctx.save();
    ctx.translate(-r * 0.15, -r * 0.65);
    ctx.rotate(wingFlap + Math.sin(time * 4) * 0.03);
    ctx.fillStyle = "rgba(248, 250, 252, 0.85)";
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.85, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  function render(time) {
    drawBackground();
    for (const pipe of pipes) {
      drawPipe(pipe);
    }
    drawGround();
    drawDog(time);
  }

  function loop(timestamp) {
    const time = timestamp / 1000;
    if (!lastTime) lastTime = timestamp;
    const dt = Math.min(0.033, (timestamp - lastTime) / 1000);
    lastTime = timestamp;

    update(dt, time);
    render(time);

    requestAnimationFrame(loop);
  }

  function onPointerDown(event) {
    event.preventDefault();
    handleFlap();
  }

  function onKeyDown(event) {
    if (event.code === "Space" || event.code === "ArrowUp") {
      event.preventDefault();
      handleFlap();
    }
  }

  window.addEventListener("resize", resize);
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("keydown", onKeyDown);
  startBtn.addEventListener("click", handleFlap);

  resize();
  hintEl.textContent = coarsePointer ? "Tap to flap" : "Press Space to flap";
  showOverlay(true);
  requestAnimationFrame(loop);
})();
