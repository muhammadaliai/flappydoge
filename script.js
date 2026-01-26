const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// Game State
let gameState = 'START'; // START, PLAYING, GAMEOVER
let score = 0;
let bestScore = localStorage.getItem('flappyDogBestScore') || 0;
let frames = 0;
let gameSpeed = 3; // Initial speed

// UI Elements
const startScreen = document.getElementById('start-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const scoreDisplay = document.getElementById('score-display');
const finalScoreSpan = document.getElementById('final-score');
const bestScoreSpan = document.getElementById('best-score');
const startBtn = document.getElementById('start-btn');
const restartBtn = document.getElementById('restart-btn');

// Responsive Canvas
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// Game Objects
const dog = {
    x: 50,
    y: 150,
    width: 40,
    height: 30,
    velocity: 0,
    gravity: 0.25,
    jumpStrength: -6, // Reduced jump strength for smoother feel
    rotation: 0,
    
    draw: function() {
        ctx.save();
        ctx.translate(this.x, this.y);
        // Rotate based on velocity
        this.rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, (this.velocity * 0.1)));
        ctx.rotate(this.rotation);

        // Draw Dog (Lightweight Vector Art)
        
        // Body
        ctx.fillStyle = '#D2691E'; // Chocolate color
        ctx.beginPath();
        ctx.ellipse(0, 0, 20, 15, 0, 0, Math.PI * 2);
        ctx.fill();

        // Head
        ctx.beginPath();
        ctx.arc(15, -10, 12, 0, Math.PI * 2);
        ctx.fill();

        // Eye
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(18, -12, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(20, -12, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Ear (Flappy)
        ctx.fillStyle = '#8B4513'; // Darker brown
        ctx.beginPath();
        ctx.ellipse(10, -18, 5, 10, -Math.PI/4, 0, Math.PI * 2);
        ctx.fill();

        // Wing (Flapping animation)
        ctx.fillStyle = '#F4A460'; // Sandy brown
        ctx.beginPath();
        const wingY = Math.sin(frames * 0.2) * 5;
        ctx.ellipse(-5, -5 + wingY, 8, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8B4513';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Tail
        ctx.strokeStyle = '#D2691E';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-20, 0);
        ctx.quadraticCurveTo(-30, -5, -35, Math.sin(frames * 0.1) * 5);
        ctx.stroke();

        // Cape (Flying Dog needs a cape!)
        ctx.fillStyle = '#FF4500'; // Orange Red
        ctx.beginPath();
        ctx.moveTo(-10, -5);
        ctx.lineTo(-35, 5 + Math.sin(frames * 0.2) * 3);
        ctx.lineTo(-35, 15 + Math.sin(frames * 0.2) * 3);
        ctx.lineTo(-10, 5);
        ctx.fill();

        ctx.restore();
    },

    update: function() {
        this.velocity += this.gravity;
        this.y += this.velocity;

        // Floor collision
        if (this.y + this.height/2 >= canvas.height) {
            this.y = canvas.height - this.height/2;
            gameOver();
        }
        
        // Ceiling collision
        if (this.y - this.height/2 <= 0) {
            this.y = this.height/2;
            this.velocity = 0;
        }
    },

    jump: function() {
        this.velocity = this.jumpStrength;
    }
};

const pipes = {
    items: [],
    width: 60,
    gap: 170, // Increased gap for better playability
    dx: 3, // Speed of pipes

    draw: function() {
        ctx.fillStyle = '#75C043'; // Classic pipe green
        ctx.strokeStyle = '#558C2F';
        ctx.lineWidth = 2;

        for (let i = 0; i < this.items.length; i++) {
            let p = this.items[i];
            
            // Top Pipe
            ctx.fillRect(p.x, 0, this.width, p.top);
            ctx.strokeRect(p.x, 0, this.width, p.top);
            
            // Cap for Top Pipe
            ctx.fillRect(p.x - 2, p.top - 20, this.width + 4, 20);
            ctx.strokeRect(p.x - 2, p.top - 20, this.width + 4, 20);

            // Bottom Pipe
            ctx.fillRect(p.x, canvas.height - p.bottom, this.width, p.bottom);
            ctx.strokeRect(p.x, canvas.height - p.bottom, this.width, p.bottom);

            // Cap for Bottom Pipe
            ctx.fillRect(p.x - 2, canvas.height - p.bottom, this.width + 4, 20);
            ctx.strokeRect(p.x - 2, canvas.height - p.bottom, this.width + 4, 20);
        }
    },

    update: function() {
        // Add new pipe
        if (frames % 120 === 0) { // Every 120 frames
            // Calculate random heights
            // Ensure minimum pipe height
            const minPipeHeight = 50;

            // Dynamic gap for smaller screens
            let currentGap = this.gap;
            if (canvas.height < 600) {
                currentGap = Math.max(130, canvas.height * 0.3);
            }

            const availableHeight = canvas.height - currentGap - minPipeHeight * 2;
            
            let topHeight, bottomHeight;

            if (availableHeight <= 0) {
                 // Fallback for extremely small screens
                 topHeight = (canvas.height - currentGap) / 2;
                 bottomHeight = topHeight;
            } else {
                topHeight = Math.random() * availableHeight + minPipeHeight;
                bottomHeight = canvas.height - currentGap - topHeight;
            }

            this.items.push({
                x: canvas.width,
                top: topHeight,
                bottom: bottomHeight,
                passed: false
            });
        }

        for (let i = 0; i < this.items.length; i++) {
            let p = this.items[i];
            p.x -= this.dx;

            // Collision Detection
            // Simple AABB collision
            // Dog hitbox is roughly centered
            const dogLeft = dog.x - 15;
            const dogRight = dog.x + 15;
            const dogTop = dog.y - 10;
            const dogBottom = dog.y + 10;

            // Pipe collision logic
            if (dogRight > p.x && dogLeft < p.x + this.width) {
                // Inside pipe horizontal area
                if (dogTop < p.top || dogBottom > canvas.height - p.bottom) {
                    gameOver();
                }
            }

            // Score update
            if (p.x + this.width < dogLeft && !p.passed) {
                score++;
                scoreDisplay.innerText = score;
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
        this.dx = 3;
    }
};

const background = {
    clouds: [],
    
    draw: function() {
        // Sky gradient
        // Already handled by CSS background-color, but let's add some clouds
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        this.clouds.forEach(cloud => {
            ctx.beginPath();
            ctx.arc(cloud.x, cloud.y, cloud.size, 0, Math.PI * 2);
            ctx.arc(cloud.x + cloud.size * 0.8, cloud.y - cloud.size * 0.5, cloud.size * 0.9, 0, Math.PI * 2);
            ctx.arc(cloud.x + cloud.size * 1.6, cloud.y, cloud.size * 0.8, 0, Math.PI * 2);
            ctx.fill();
        });
    },
    
    update: function() {
        if (frames % 100 === 0) {
            this.clouds.push({
                x: canvas.width + 50,
                y: Math.random() * (canvas.height / 2),
                size: Math.random() * 20 + 20,
                speed: Math.random() * 0.5 + 0.5
            });
        }
        
        this.clouds.forEach((cloud, index) => {
            cloud.x -= cloud.speed;
            if (cloud.x < -100) {
                this.clouds.splice(index, 1);
            }
        });
    },

    reset: function() {
        this.clouds = [];
    }
};


// Game Loop
function loop() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Background
    background.draw();
    if (gameState === 'PLAYING') {
        background.update();
    }

    // Draw Pipes
    pipes.draw();
    if (gameState === 'PLAYING') {
        pipes.update();
    }

    // Draw Dog
    dog.draw();
    if (gameState === 'PLAYING') {
        dog.update();
        frames++;
    } else if (gameState === 'START') {
        // Hover animation
        dog.y = 150 + Math.sin(Date.now() / 300) * 10;
        dog.rotation = 0;
    }

    requestAnimationFrame(loop);
}

// Controls
function jump() {
    if (gameState === 'START') {
        gameState = 'PLAYING';
        startScreen.classList.remove('active');
        scoreDisplay.style.display = 'block';
        dog.jump();
    } else if (gameState === 'PLAYING') {
        dog.jump();
    }
}

function gameOver() {
    gameState = 'GAMEOVER';
    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem('flappyDogBestScore', bestScore);
    }
    finalScoreSpan.innerText = score;
    bestScoreSpan.innerText = bestScore;
    gameOverScreen.classList.add('active');
    scoreDisplay.style.display = 'none';
}

function resetGame() {
    gameState = 'START';
    dog.y = 150;
    dog.velocity = 0;
    dog.rotation = 0;
    pipes.reset();
    score = 0;
    frames = 0;
    scoreDisplay.innerText = score;
    gameOverScreen.classList.remove('active');
    startScreen.classList.add('active');
}

// Event Listeners
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        jump();
    }
});

window.addEventListener('touchstart', (e) => {
    e.preventDefault(); // Prevent scrolling
    jump();
}, { passive: false });

window.addEventListener('mousedown', (e) => {
    if (e.target.tagName !== 'BUTTON') {
        jump();
    }
});

startBtn.addEventListener('click', () => {
    jump();
});

restartBtn.addEventListener('click', () => {
    resetGame();
});

// Start Loop
loop();
