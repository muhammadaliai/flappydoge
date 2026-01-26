const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const scoreHud = document.getElementById('score-hud');
const scoreDisplay = document.getElementById('score-display');
const bestScoreDisplay = document.getElementById('best-score-display');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');

// Game State
let frames = 0;
let score = 0;
let highScore = localStorage.getItem('flappyDogHighScore') || 0;
let gameState = 'START'; // START, PLAYING, GAMEOVER
let gameSpeed = 3;
let lastTime = 0;

// Resize handling
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// Input Handling
function handleInput(e) {
    if (e.type === 'keydown' && e.code !== 'Space') return;
    if (e.type === 'touchstart') e.preventDefault(); // Prevent double firing on some devices

    switch (gameState) {
        case 'START':
            startGame();
            break;
        case 'PLAYING':
            dog.flap();
            break;
        case 'GAMEOVER':
            // Optional: restart on tap if game over screen is up (handled by button mostly)
            break;
    }
}

window.addEventListener('keydown', handleInput);
window.addEventListener('mousedown', handleInput);
window.addEventListener('touchstart', handleInput, { passive: false });

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', resetGame);

// Game Objects
const dog = {
    x: 50,
    y: 150,
    radius: 20,
    velocity: 0,
    gravity: 0.25,
    jumpStrength: -6, // Adjusted for smoother feel
    rotation: 0,
    
    draw: function() {
        ctx.save();
        ctx.translate(this.x, this.y);
        // Rotation based on velocity
        this.rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, (this.velocity * 0.1)));
        ctx.rotate(this.rotation);

        // Draw Dog
        // Body (Cape)
        ctx.fillStyle = '#D32F2F'; // Red cape
        ctx.beginPath();
        ctx.moveTo(-10, 5);
        ctx.lineTo(-30, 0);
        ctx.lineTo(-30, 10);
        ctx.fill();

        // Body (Main)
        ctx.fillStyle = '#8D6E63'; // Brown
        ctx.beginPath();
        ctx.ellipse(0, 5, 20, 12, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.beginPath();
        ctx.arc(12, -5, 12, 0, Math.PI * 2);
        ctx.fill();

        // Ear
        ctx.fillStyle = '#5D4037'; // Darker brown
        ctx.beginPath();
        ctx.ellipse(12, -12, 4, 8, -0.2, 0, Math.PI * 2);
        ctx.fill();

        // Eye
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(16, -7, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(17, -7, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Nose
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(22, -5, 2, 0, Math.PI * 2);
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
        this.x = canvas.width * 0.15; // Responsive X position
        this.y = canvas.height / 2;
        this.velocity = 0;
        this.rotation = 0;
    }
};

const pipes = {
    items: [],
    width: 60, // Slightly wider pipes
    gap: 170,  // Generous gap
    dx: 3,     // Speed

    draw: function() {
        ctx.fillStyle = '#4CAF50'; // Pipe color
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

            // Cap details (optional visual flair)
            ctx.fillStyle = '#81C784'; // Lighter highlight
            ctx.fillRect(p.x + 5, 0, 5, p.top);
            ctx.fillRect(p.x + 5, canvas.height - p.bottom, 5, p.bottom);
            ctx.fillStyle = '#4CAF50'; // Reset
        }
    },

    update: function() {
        // Add new pipe
        if (frames % 120 === 0) { // Spawn rate
            // Calculate random heights
            // Minimum pipe height to ensure playability
            const minHeight = 50;
            const availableHeight = canvas.height - this.gap - (minHeight * 2);
            const randomShift = Math.random() * availableHeight;
            
            this.items.push({
                x: canvas.width,
                top: minHeight + randomShift,
                bottom: canvas.height - (minHeight + randomShift + this.gap),
                passed: false
            });
        }

        for (let i = 0; i < this.items.length; i++) {
            let p = this.items[i];
            p.x -= this.dx;

            // Collision Detection
            // Horizontal check
            if (dog.x + dog.radius > p.x && dog.x - dog.radius < p.x + this.width) {
                // Vertical check
                if (dog.y - dog.radius < p.top || dog.y + dog.radius > canvas.height - p.bottom) {
                    gameOver();
                }
            }

            // Score update
            if (p.x + this.width < dog.x && !p.passed) {
                score++;
                scoreHud.innerText = score;
                p.passed = true;
                // Increase difficulty slightly
                if (score % 5 === 0) {
                     this.dx += 0.2;
                }
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
        this.dx = 3; // Reset speed
    }
};

const background = {
    clouds: [],
    
    draw: function() {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        for(let c of this.clouds) {
            ctx.beginPath();
            ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2);
            ctx.arc(c.x + c.r * 0.7, c.y - c.r * 0.5, c.r * 0.8, 0, Math.PI * 2);
            ctx.arc(c.x + c.r * 1.4, c.y, c.r * 0.9, 0, Math.PI * 2);
            ctx.fill();
        }
    },
    
    update: function() {
        if (frames % 100 === 0) {
            this.clouds.push({
                x: canvas.width + 50,
                y: Math.random() * (canvas.height / 2),
                r: 20 + Math.random() * 30,
                speed: 0.5 + Math.random() * 1
            });
        }
        
        for(let i = 0; i < this.clouds.length; i++) {
            this.clouds[i].x -= this.clouds[i].speed;
            if(this.clouds[i].x < -100) {
                this.clouds.shift();
                i--;
            }
        }
    }
}


// Game Loop
function loop() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Update and Draw Background
    background.update();
    background.draw();

    if (gameState === 'PLAYING') {
        pipes.update();
        pipes.draw();
        dog.update();
        dog.draw();
        frames++;
    } else if (gameState === 'GAMEOVER') {
        pipes.draw(); // Keep pipes visible
        dog.draw();   // Keep dog visible
    } else if (gameState === 'START') {
        // Show a preview or idle animation?
        dog.y = canvas.height / 2 + Math.sin(Date.now() / 300) * 10;
        dog.draw();
        background.update(); // Keep clouds moving
    }

    requestAnimationFrame(loop);
}

function startGame() {
    if (gameState === 'PLAYING') return;
    
    gameState = 'PLAYING';
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    scoreHud.classList.remove('hidden');
    
    dog.reset();
    pipes.reset();
    score = 0;
    frames = 0;
    scoreHud.innerText = score;
}

function gameOver() {
    gameState = 'GAMEOVER';
    if (score > highScore) {
        highScore = score;
        localStorage.setItem('flappyDogHighScore', highScore);
    }
    
    scoreDisplay.innerText = score;
    bestScoreDisplay.innerText = highScore;
    
    scoreHud.classList.add('hidden');
    gameOverScreen.classList.remove('hidden');
}

function resetGame() {
    startGame();
}

// Initial Setup
dog.reset();
loop();
