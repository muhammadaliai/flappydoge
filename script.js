const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const scoreDisplay = document.getElementById('score-display');
const finalScoreSpan = document.getElementById('final-score');
const bestScoreSpan = document.getElementById('best-score');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');

// Game Variables
let frames = 0;
let score = 0;
let highScore = localStorage.getItem('flappyDogHighScore') || 0;
let gameState = 'START'; // START, PLAYING, GAMEOVER
let gameSpeed = 3;

// Resize Canvas
function resizeCanvas() {
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Input Handling
function handleInput(e) {
    if (e.type === 'keydown' && e.code !== 'Space') return;
    if (e.type === 'keydown') e.preventDefault(); // Prevent scrolling

    switch (gameState) {
        case 'START':
            startGame();
            break;
        case 'PLAYING':
            dog.flap();
            break;
        case 'GAMEOVER':
            // Optional: restart on click if game over screen is visible? 
            // Better to rely on the button to prevent accidental restarts
            break;
    }
}

window.addEventListener('keydown', handleInput);
canvas.addEventListener('mousedown', handleInput);
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault(); // Prevent default touch behavior
    handleInput(e);
}, { passive: false });

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', resetGame);

function startGame() {
    gameState = 'PLAYING';
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    scoreDisplay.classList.remove('hidden');
    score = 0;
    scoreDisplay.innerText = score;
    frames = 0;
    dog.reset();
    pipes.reset();
    gameLoop();
}

function resetGame() {
    startGame();
}

function gameOver() {
    gameState = 'GAMEOVER';
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('flappyDogHighScore', highScore);
    }
    finalScoreSpan.innerText = score;
    bestScoreSpan.innerText = highScore;
    scoreDisplay.classList.add('hidden');
    gameOverScreen.classList.remove('hidden');
}

// Dog Object
const dog = {
    x: 50,
    y: 150,
    width: 40,
    height: 30,
    velocity: 0,
    gravity: 0.25,
    jumpStrength: -4.5,
    radius: 15,
    rotation: 0,

    draw: function() {
        ctx.save();
        ctx.translate(this.x, this.y);
        // Rotate based on velocity
        this.rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, (this.velocity * 0.1)));
        ctx.rotate(this.rotation);

        // Draw Dog (Simple shapes)
        // Body
        ctx.fillStyle = '#D2691E'; // Chocolate color
        ctx.beginPath();
        ctx.ellipse(0, 0, 20, 15, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.beginPath();
        ctx.arc(12, -8, 12, 0, Math.PI * 2);
        ctx.fill();

        // Ear (Flapping)
        ctx.fillStyle = '#8B4513'; // Darker brown
        ctx.beginPath();
        if (this.velocity < 0) {
            // Flapping up
            ctx.ellipse(5, -18, 5, 12, -0.2, 0, Math.PI * 2);
        } else {
            // Falling down
            ctx.ellipse(5, -12, 5, 12, 0.5, 0, Math.PI * 2);
        }
        ctx.fill();

        // Eye
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(16, -10, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(18, -10, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Nose
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(22, -6, 2, 0, Math.PI * 2);
        ctx.fill();

        // Tail
        ctx.strokeStyle = '#D2691E';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-15, 0);
        ctx.quadraticCurveTo(-25, -5, -22 + Math.sin(frames * 0.2) * 5, -10);
        ctx.stroke();

        // Cape (Flying Dog!)
        ctx.fillStyle = '#E53935'; // Red cape
        ctx.beginPath();
        ctx.moveTo(-5, -5);
        ctx.lineTo(-25, 5);
        ctx.lineTo(-25, -5);
        ctx.fill();

        ctx.restore();
    },

    update: function() {
        this.velocity += this.gravity;
        this.y += this.velocity;

        // Floor collision
        if (this.y + this.radius >= canvas.height) {
            this.y = canvas.height - this.radius;
            gameOver();
        }
        
        // Ceiling collision (optional, but good for gameplay)
        if (this.y - this.radius <= 0) {
            this.y = this.radius;
            this.velocity = 0;
        }
    },

    flap: function() {
        this.velocity = this.jumpStrength;
    },

    reset: function() {
        this.x = canvas.width * 0.2; // 20% from left
        this.y = canvas.height / 2;
        this.velocity = 0;
        this.rotation = 0;
    }
};

// Pipes Object
const pipes = {
    items: [],
    width: 50,
    gap: 150,
    dx: 3,
    spawnTimer: 0,

    draw: function() {
        ctx.fillStyle = '#4CAF50'; // Green pipe color
        ctx.strokeStyle = '#388E3C'; // Darker border
        ctx.lineWidth = 2;

        for (let i = 0; i < this.items.length; i++) {
            let p = this.items[i];
            
            // Top Pipe
            ctx.fillRect(p.x, 0, this.width, p.top);
            ctx.strokeRect(p.x, 0, this.width, p.top);
            
            // Bottom Pipe
            ctx.fillRect(p.x, canvas.height - p.bottom, this.width, p.bottom);
            ctx.strokeRect(p.x, canvas.height - p.bottom, this.width, p.bottom);

            // Pipe Cap details (optional for better look)
            ctx.fillStyle = '#66BB6A'; // Lighter green for highlight
            ctx.fillRect(p.x + 5, 0, 5, p.top);
            ctx.fillRect(p.x + 5, canvas.height - p.bottom, 5, p.bottom);
            ctx.fillStyle = '#4CAF50'; // Reset
        }
    },

    update: function() {
        // Spawning
        // Spawn every 100 frames (adjust based on width/speed)
        // Dynamic spawn rate based on canvas width to keep consistent difficulty
        const spawnRate = Math.floor(canvas.width / (this.dx * 60) * 100); 
        
        if (frames % 120 === 0) { // Fixed interval for now, easier to tune
            // Calculate random heights
            // Minimum pipe height
            const minHeight = 50;
            // Available space for pipes (height - gap - 2*minHeight)
            const availableSpace = canvas.height - this.gap - minHeight * 2;
            const randomY = Math.random() * availableSpace;
            
            this.items.push({
                x: canvas.width,
                top: minHeight + randomY,
                bottom: canvas.height - (minHeight + randomY + this.gap),
                passed: false
            });
        }

        // Moving and Collision
        for (let i = 0; i < this.items.length; i++) {
            let p = this.items[i];
            p.x -= this.dx;

            // Collision Detection
            // Simple AABB (Axis-Aligned Bounding Box) logic
            // Dog hitbox is roughly a circle/box at dog.x, dog.y
            
            // Check X overlap
            if (dog.x + 15 > p.x && dog.x - 15 < p.x + this.width) {
                // Check Y overlap (Top pipe OR Bottom pipe)
                if ((dog.y - 10 < p.top) || (dog.y + 10 > canvas.height - p.bottom)) {
                    gameOver();
                }
            }

            // Score update
            if (p.x + this.width < dog.x && !p.passed) {
                score++;
                scoreDisplay.innerText = score;
                p.passed = true;
                // Increase difficulty slightly?
                // if (score % 5 === 0) this.dx += 0.1;
            }

            // Remove off-screen pipes
            if (p.x + this.width < 0) {
                this.items.shift();
                i--;
            }
        }
    },

    reset: function() {
        this.items = [];
    }
};

// Background (Clouds)
const background = {
    clouds: [],
    
    draw: function() {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        for (let cloud of this.clouds) {
            ctx.beginPath();
            ctx.arc(cloud.x, cloud.y, cloud.r, 0, Math.PI * 2);
            ctx.arc(cloud.x + cloud.r * 0.6, cloud.y - cloud.r * 0.5, cloud.r * 0.7, 0, Math.PI * 2);
            ctx.arc(cloud.x + cloud.r * 1.2, cloud.y, cloud.r * 0.8, 0, Math.PI * 2);
            ctx.fill();
        }
    },

    update: function() {
        // Spawn clouds
        if (frames % 150 === 0) {
            this.clouds.push({
                x: canvas.width + 50,
                y: Math.random() * (canvas.height / 2),
                r: 20 + Math.random() * 30,
                speed: 0.5 + Math.random() * 0.5
            });
        }

        // Move clouds
        for (let i = 0; i < this.clouds.length; i++) {
            let cloud = this.clouds[i];
            cloud.x -= cloud.speed;
            if (cloud.x + cloud.r * 2 < 0) {
                this.clouds.shift();
                i--;
            }
        }
    }
};

function gameLoop() {
    if (gameState !== 'PLAYING') return;

    // Clear Canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update & Draw
    background.update();
    background.draw();

    pipes.update();
    pipes.draw();

    dog.update();
    dog.draw();

    frames++;
    requestAnimationFrame(gameLoop);
}

// Initial Draw (Background only)
function initialDraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    background.draw(); // Just draw empty sky or some static clouds
    dog.y = canvas.height / 2;
    dog.x = canvas.width * 0.2;
    dog.draw();
}

// Start animation loop for background even when not playing? 
// Maybe just a simple loop for the menu screen
function menuLoop() {
    if (gameState === 'PLAYING') return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    background.update();
    background.draw();
    
    // Bobbing dog effect
    if (gameState === 'START') {
        dog.y = canvas.height / 2 + Math.sin(Date.now() / 300) * 10;
        dog.x = canvas.width * 0.2;
        dog.draw();
    }

    requestAnimationFrame(menuLoop);
    frames++;
}

// Initialize
resizeCanvas();
menuLoop();
