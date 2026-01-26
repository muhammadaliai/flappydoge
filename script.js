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

// Game Constants
const GRAVITY = 0.25;
const JUMP_STRENGTH = -4.5; // Reduced jump strength for better control
const PIPE_SPEED = 2; // Reduced speed for better playability
const PIPE_SPAWN_RATE = 120; // Frames between pipes
const PIPE_GAP = 150; // Gap size

// Game State
let gameState = 'start'; // start, playing, gameover
let frames = 0;
let score = 0;
let bestScore = localStorage.getItem('flappyDogBestScore') || 0;

// Assets
const dogImg = new Image();
dogImg.src = 'dog.svg';

// Game Objects
const dog = {
    x: 50,
    y: 150,
    width: 30,
    height: 24,
    velocity: 0,
    rotation: 0,
    
    draw: function() {
        ctx.save();
        ctx.translate(this.x + this.width/2, this.y + this.height/2);
        // Rotate based on velocity
        this.rotation = Math.min(Math.PI / 4, Math.max(-Math.PI / 4, (this.velocity * 0.1)));
        ctx.rotate(this.rotation);
        
        if (dogImg.complete) {
            ctx.drawImage(dogImg, -this.width/2, -this.height/2, this.width, this.height);
        } else {
            // Fallback if image fails or hasn't loaded
            ctx.fillStyle = '#D2691E';
            ctx.beginPath();
            ctx.ellipse(0, 0, this.width/2, this.height/2, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    },
    
    update: function() {
        this.velocity += GRAVITY;
        this.y += this.velocity;
        
        // Floor collision
        if (this.y + this.height >= canvas.height) {
            this.y = canvas.height - this.height;
            gameOver();
        }
        
        // Ceiling collision (optional, but good for gameplay)
        if (this.y < 0) {
            this.y = 0;
            this.velocity = 0;
        }
    },
    
    jump: function() {
        this.velocity = JUMP_STRENGTH;
    },
    
    reset: function() {
        this.y = canvas.height / 2;
        this.velocity = 0;
        this.rotation = 0;
    }
};

const pipes = {
    items: [],
    
    draw: function() {
        ctx.fillStyle = '#75c075'; // Pipe color
        ctx.strokeStyle = '#558a55';
        ctx.lineWidth = 2;

        for (let i = 0; i < this.items.length; i++) {
            let p = this.items[i];
            
            // Top Pipe
            ctx.fillRect(p.x, 0, p.width, p.top);
            ctx.strokeRect(p.x, 0, p.width, p.top);
            
            // Bottom Pipe
            ctx.fillRect(p.x, canvas.height - p.bottom, p.width, p.bottom);
            ctx.strokeRect(p.x, canvas.height - p.bottom, p.width, p.bottom);
        }
    },
    
    update: function() {
        // Add new pipe
        if (frames % PIPE_SPAWN_RATE === 0) {
            // Calculate random heights
            // Ensure gap is always traversable
            const minPipeHeight = 50;
            const availableHeight = canvas.height - PIPE_GAP - (minPipeHeight * 2);
            const randomShift = Math.random() * availableHeight;
            
            this.items.push({
                x: canvas.width,
                width: 50, // Pipe width
                top: minPipeHeight + randomShift,
                bottom: canvas.height - (minPipeHeight + randomShift + PIPE_GAP),
                passed: false
            });
        }
        
        // Move pipes
        for (let i = 0; i < this.items.length; i++) {
            let p = this.items[i];
            p.x -= PIPE_SPEED;
            
            // Collision Detection
            // Horizontal overlap
            if (dog.x + dog.width > p.x && dog.x < p.x + p.width) {
                // Vertical overlap (Top pipe OR Bottom pipe)
                if (dog.y < p.top || dog.y + dog.height > canvas.height - p.bottom) {
                    gameOver();
                }
            }
            
            // Score update
            if (p.x + p.width < dog.x && !p.passed) {
                score++;
                scoreDisplay.innerText = score;
                p.passed = true;
            }
            
            // Remove off-screen pipes
            if (p.x + p.width < 0) {
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
        ctx.fillStyle = '#fff';
        for(let cloud of this.clouds) {
            ctx.beginPath();
            ctx.arc(cloud.x, cloud.y, cloud.size, 0, Math.PI * 2);
            ctx.arc(cloud.x + cloud.size * 0.8, cloud.y - cloud.size * 0.5, cloud.size * 0.9, 0, Math.PI * 2);
            ctx.arc(cloud.x + cloud.size * 1.6, cloud.y, cloud.size * 0.8, 0, Math.PI * 2);
            ctx.fill();
        }
    },
    
    update: function() {
        if (frames % 100 === 0) {
            this.clouds.push({
                x: canvas.width + 50,
                y: Math.random() * (canvas.height / 2),
                size: 20 + Math.random() * 30,
                speed: 0.5 + Math.random() * 0.5
            });
        }
        
        for (let i = 0; i < this.clouds.length; i++) {
            let c = this.clouds[i];
            c.x -= c.speed;
            if (c.x < -100) {
                this.clouds.shift();
                i--;
            }
        }
    }
};

// Game Loop
function loop() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw Background
    background.draw();
    background.update();
    
    if (gameState === 'playing') {
        pipes.update();
        pipes.draw();
        
        dog.update();
        dog.draw();
        
        frames++;
        requestAnimationFrame(loop);
    } else if (gameState === 'start') {
        dog.y = canvas.height / 2 + Math.sin(Date.now() / 300) * 10; // Bobbing animation
        dog.draw();
        background.update(); // Animate clouds in start screen
        requestAnimationFrame(loop);
    }
}

// Controls
function startGame() {
    gameState = 'playing';
    startScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    scoreDisplay.classList.remove('hidden');
    scoreDisplay.innerText = '0';
    
    dog.reset();
    pipes.reset();
    score = 0;
    frames = 0;
    
    loop();
}

function gameOver() {
    gameState = 'gameover';
    scoreDisplay.classList.add('hidden');
    gameOverScreen.classList.remove('hidden');
    
    finalScoreSpan.innerText = score;
    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem('flappyDogBestScore', bestScore);
    }
    bestScoreSpan.innerText = bestScore;
}

function handleInput(e) {
    if (e.type === 'keydown' && e.code !== 'Space') return;
    if (e.type === 'keydown') e.preventDefault(); // Prevent scrolling
    
    if (gameState === 'start') {
        startGame();
    } else if (gameState === 'playing') {
        dog.jump();
    } else if (gameState === 'gameover') {
        // Optional: Restart on input
        // startGame();
    }
}

// Event Listeners
window.addEventListener('keydown', handleInput);
window.addEventListener('touchstart', (e) => {
    e.preventDefault(); // Prevent default touch actions
    handleInput(e);
}, { passive: false });
window.addEventListener('mousedown', handleInput);

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

// Resize handling
function resize() {
    // Get the computed style of the container to match its size
    const container = document.getElementById('game-container');
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    
    // Adjust dog start position if needed
    if (gameState === 'start') {
        dog.y = canvas.height / 2;
    }
}

window.addEventListener('resize', resize);
resize(); // Initial resize
loop(); // Start the loop (in start state)
