/**
 * NEON REFLEX - Game Engine Script
 * Core features:
 * - HTML5 Canvas rendering at 60fps with CRT/neon glow aesthetics.
 * - Dynamic particle systems and screenshake on hits.
 * - Timing-based speed amplification.
 * - Web Audio API procedural synthesizer for retro sound effects.
 */

// --- Audio Synthesizer Configuration ---
class SoundEngine {
    constructor() {
        this.ctx = null;
        this.enabled = true;
    }

    init() {
        if (!this.ctx) {
            // Support both standard and webkit audio context
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                this.ctx = new AudioContextClass();
            }
        }
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    toggle() {
        this.enabled = !this.enabled;
        this.init();
        return this.enabled;
    }

    playOscillator(freqStart, freqEnd, duration, type = 'sine', volume = 0.1, sweep = true) {
        if (!this.enabled) return;
        this.init();
        if (!this.ctx) return;

        const now = this.ctx.currentTime;
        
        // Create nodes
        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, now);
        
        if (sweep) {
            osc.frequency.exponentialRampToValueAtTime(freqEnd, now + duration);
        } else {
            osc.frequency.setValueAtTime(freqEnd, now + duration);
        }
        
        // Envelope: smooth start and fade out
        gainNode.gain.setValueAtTime(0.001, now);
        gainNode.gain.linearRampToValueAtTime(volume, now + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, now + duration);
        
        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination);
        
        osc.start(now);
        osc.stop(now + duration);
    }

    playHit(speedRatio) {
        // Higher speed ratios generate higher pitches
        const pitch = 300 + (speedRatio * 200);
        this.playOscillator(pitch, pitch * 1.5, 0.15, 'triangle', 0.15);
    }

    playPerfectHit() {
        // Fast upward sci-fi sweep
        this.playOscillator(150, 1200, 0.35, 'sawtooth', 0.12);
        
        // Add a secondary resonance layer for extra punch
        setTimeout(() => {
            this.playOscillator(600, 900, 0.2, 'sine', 0.15);
        }, 30);
    }

    playScore() {
        // Uplifting arpeggio sound effect
        const now = this.ctx ? this.ctx.currentTime : 0;
        const notes = [440, 554.37, 659.25, 880]; // A major chord
        notes.forEach((freq, idx) => {
            setTimeout(() => {
                this.playOscillator(freq, freq, 0.25, 'sine', 0.1, false);
            }, idx * 80);
        });
    }

    playLoss() {
        // Descending warning buzzer
        this.playOscillator(220, 80, 0.45, 'sawtooth', 0.2);
    }

    playGameOver(isWinnerPlayer1) {
        // Melodic game over sequence
        const majorMelody = [523.25, 587.33, 659.25, 783.99, 1046.50]; // Upbeat C major
        const minorMelody = [392.00, 349.23, 311.13, 293.66, 261.63]; // Descending C minor
        const melody = isWinnerPlayer1 ? majorMelody : minorMelody;
        
        melody.forEach((freq, idx) => {
            setTimeout(() => {
                this.playOscillator(freq, freq * 0.95, 0.35, 'triangle', 0.15);
            }, idx * 150);
        });
    }
}

const sounds = new SoundEngine();

// --- Game Engine Class ---
class Game {
    constructor() {
        // Canvas configurations
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.width = this.canvas.width;
        this.height = this.canvas.height;

        // Game States
        this.STATE_MENU = 'MENU';
        this.STATE_PLAYING = 'PLAYING';
        this.STATE_PAUSED = 'PAUSED';
        this.STATE_GAMEOVER = 'GAMEOVER';
        this.state = this.STATE_MENU;

        // Player configuration
        this.scores = { p1: 0, p2: 0 };
        this.streaks = { p1: 0, p2: 0 };
        this.maxStreak = 0;
        this.winScore = 5;

        // Ball physics
        this.ball = {
            x: this.width / 2,
            y: this.height / 2,
            vx: 0,
            vy: 0,
            radius: 12,
            baseSpeed: 6.5,
            currentSpeed: 6.5,
            speedMultiplier: 1.0,
            trail: []
        };
        this.maxSpeedReached = 0;

        // Hit zone specifications (distance from left/right walls)
        this.hitZoneWidth = 160; 
        // Subdivisions of the Hit Zone
        this.zones = {
            good: 160,       // Outer edge
            great: 80,       // Middle
            perfect: 30      // Close to the wall (high risk!)
        };

        // Key bindings and active press flags for anti-spam
        this.keys = {
            p1: ['ArrowLeft', 'KeyA'],
            p2: ['ArrowRight', 'KeyL']
        };
        this.spamCooldown = { p1: 0, p2: 0 }; // cooldown timestamp in ms
        this.cooldownDuration = 350; // duration in ms to penalize bad hit attempts

        // Visual effects variables
        this.particles = [];
        this.shakeStrength = 0;
        this.screenFlashTime = 0;
        this.screenFlashType = ''; // 'hit' or 'score'

        // Frame timing
        this.lastTime = 0;
        this.ballWasReset = false;

        // UI Element References
        this.menus = {
            start: document.getElementById('start-menu'),
            pause: document.getElementById('pause-menu'),
            gameOver: document.getElementById('game-over-screen')
        };
        
        this.statsUI = {
            p1Score: document.getElementById('p1-score'),
            p2Score: document.getElementById('p2-score'),
            p1Streak: document.getElementById('p1-streak'),
            p2Streak: document.getElementById('p2-streak'),
            p1StreakContainer: document.getElementById('p1-streak-container'),
            p2StreakContainer: document.getElementById('p2-streak-container'),
            winnerAnnounce: document.getElementById('winner-announcement'),
            finalScore: document.getElementById('final-score-val'),
            maxStreak: document.getElementById('max-streak-val'),
            maxSpeed: document.getElementById('max-speed-val'),
            flashOverlay: document.getElementById('screen-flash')
        };

        this.initEventListeners();
    }

    initEventListeners() {
        // Key down handler
        window.addEventListener('keydown', (e) => this.handleKeyDown(e));

        // Pointer down (mouse click & touch event helper) on canvas
        this.canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e));

        // Start button
        document.getElementById('btn-start-game').addEventListener('click', () => this.startGame());

        // Toggle sound
        const btnSound = document.getElementById('btn-toggle-sound');
        btnSound.addEventListener('click', () => {
            const enabled = sounds.toggle();
            btnSound.textContent = `靜音音效 SOUND: ${enabled ? 'ON' : 'OFF'}`;
            btnSound.classList.toggle('btn-secondary', !enabled);
            btnSound.classList.toggle('btn-primary', enabled);
        });

        // Pause menu actions
        document.getElementById('btn-resume').addEventListener('click', () => this.resumeGame());
        document.getElementById('btn-quit').addEventListener('click', () => this.quitToMenu());

        // Game Over menu actions
        document.getElementById('btn-restart').addEventListener('click', () => this.startGame());
        document.getElementById('btn-menu').addEventListener('click', () => this.quitToMenu());

        // Handle canvas resize / responsive alignment if needed
        window.addEventListener('resize', () => this.resizeCanvas());
        this.resizeCanvas();
    }

    resizeCanvas() {
        // We render at 1024x576 internal coordinate space. CSS handles scaling.
        // No extra JS scale is needed since CSS maintains aspect ratio.
    }

    startGame() {
        sounds.init();
        this.scores.p1 = 0;
        this.scores.p2 = 0;
        this.streaks.p1 = 0;
        this.streaks.p2 = 0;
        this.maxStreak = 0;
        this.maxSpeedReached = 0;
        
        this.updateHUD();
        this.resetBall(1); // Serve towards Player 1 or 2
        this.showPanel('none');
        this.state = this.STATE_PLAYING;
    }

    pauseGame() {
        if (this.state === this.STATE_PLAYING) {
            this.state = this.STATE_PAUSED;
            this.showPanel('pause');
        }
    }

    resumeGame() {
        if (this.state === this.STATE_PAUSED) {
            this.showPanel('none');
            this.state = this.STATE_PLAYING;
            // Reset lastTime to avoid huge physics delta jump
            this.lastTime = performance.now();
        }
    }

    quitToMenu() {
        this.state = this.STATE_MENU;
        this.showPanel('start');
    }

    gameOver(winner) {
        this.state = this.STATE_GAMEOVER;
        sounds.playGameOver(winner === 'p1');

        // Populate Game Over Stats
        this.statsUI.winnerAnnounce.textContent = winner === 'p1' ? 'PLAYER 1 (LEFT) 獲勝！' : 'PLAYER 2 (RIGHT) 獲勝！';
        this.statsUI.winnerAnnounce.style.color = winner === 'p1' ? 'var(--color-p1)' : 'var(--color-p2)';
        this.statsUI.winnerAnnounce.style.filter = winner === 'p1' ? 
            'drop-shadow(0 0 15px rgba(0, 240, 255, 0.4))' : 
            'drop-shadow(0 0 15px rgba(255, 0, 127, 0.4))';
            
        this.statsUI.finalScore.textContent = `${this.scores.p1} - ${this.scores.p2}`;
        this.statsUI.maxStreak.textContent = `${this.maxStreak} Hits`;
        this.statsUI.maxSpeed.textContent = `${Math.round(this.maxSpeedReached * 10)} km/h`;

        this.showPanel('gameOver');
    }

    showPanel(panelName) {
        Object.keys(this.menus).forEach(key => {
            if (key === panelName) {
                this.menus[key].classList.add('active');
            } else {
                this.menus[key].classList.remove('active');
            }
        });
    }

    resetBall(serveDir) {
        this.ball.x = this.width / 2;
        this.ball.y = this.height / 2 + (Math.random() * 100 - 50); // slight random offset
        this.ball.speedMultiplier = 1.0;
        this.ball.currentSpeed = this.ball.baseSpeed;
        
        // Angle of serving: between -20 to 20 degrees
        const angle = (Math.random() * 40 - 20) * Math.PI / 180;
        this.ball.vx = Math.cos(angle) * this.ball.currentSpeed * serveDir;
        this.ball.vy = Math.sin(angle) * this.ball.currentSpeed;
        
        this.ball.trail = [];
        this.ballWasReset = true; // Set flag to break sub-stepping and prevent speed restore
    }

    handleKeyDown(e) {
        if (e.code === 'Escape') {
            if (this.state === this.STATE_PLAYING) {
                this.pauseGame();
            } else if (this.state === this.STATE_PAUSED) {
                this.resumeGame();
            }
            return;
        }

        if (this.state !== this.STATE_PLAYING) return;

        const now = performance.now();

        // Player 1 input
        if (this.keys.p1.includes(e.code)) {
            // Anti-spam check
            if (now < this.spamCooldown.p1) return;
            this.attemptDeflection('p1', now);
        }

        // Player 2 input
        if (this.keys.p2.includes(e.code)) {
            // Anti-spam check
            if (now < this.spamCooldown.p2) return;
            this.attemptDeflection('p2', now);
        }
    }

    handlePointerDown(e) {
        if (this.state !== this.STATE_PLAYING) return;

        const rect = this.canvas.getBoundingClientRect();
        // Calculate horizontal position relative to the canvas bounding rectangle
        const clickX = e.clientX - rect.left;
        const now = performance.now();

        // Left half tap -> Player 1
        if (clickX < rect.width / 2) {
            if (now < this.spamCooldown.p1) return;
            this.attemptDeflection('p1', now);
        } 
        // Right half tap -> Player 2
        else {
            if (now < this.spamCooldown.p2) return;
            this.attemptDeflection('p2', now);
        }
    }

    attemptDeflection(player, timestamp) {
        // If ball is traveling AWAY from player, hit fails immediately
        if (player === 'p1' && this.ball.vx > 0) return;
        if (player === 'p2' && this.ball.vx < 0) return;

        // Calculate distance from player's wall (left wall: x=0, right wall: x=width)
        const dist = player === 'p1' ? this.ball.x : this.width - this.ball.x;

        // Check if ball is inside the maximum hit zone (good boundary)
        if (dist <= this.zones.good && dist >= 0) {
            // Success! Determine hit accuracy rating
            let rating = 'GOOD';
            let speedAmp = 1.15; // default good
            let particleColor = player === 'p1' ? 'var(--color-p1)' : 'var(--color-p2)';
            
            if (dist <= this.zones.perfect) {
                rating = 'PERFECT';
                speedAmp = 2.0; // Huge speed boost
                particleColor = 'var(--color-gold)';
            } else if (dist <= this.zones.great) {
                rating = 'GREAT';
                speedAmp = 1.5;
            }

            // Deflect ball: increase speed, reverse X, add variance to Y
            this.ball.speedMultiplier *= speedAmp;
            this.ball.currentSpeed = this.ball.baseSpeed * this.ball.speedMultiplier;
            
            // Record max speed
            if (this.ball.currentSpeed > this.maxSpeedReached) {
                this.maxSpeedReached = this.ball.currentSpeed;
            }

            // Reverse X velocity
            const dirX = player === 'p1' ? 1 : -1;
            
            // Calculate rebound angle: y-distance from canvas center can influence it,
            // adding a bit of variation based on timing and positioning.
            const centerOffsetRatio = (this.ball.y - this.height / 2) / (this.height / 2);
            const reboundAngle = (centerOffsetRatio * 25 + (Math.random() * 10 - 5)) * Math.PI / 180;
            
            this.ball.vx = Math.cos(reboundAngle) * this.ball.currentSpeed * dirX;
            this.ball.vy = Math.sin(reboundAngle) * this.ball.currentSpeed;

            // Increment streak
            this.streaks[player]++;
            const opponent = player === 'p1' ? 'p2' : 'p1';
            this.streaks[opponent] = 0; // Break opponent's streak

            if (this.streaks[player] > this.maxStreak) {
                this.maxStreak = this.streaks[player];
            }

            // Trigger visual & audio feedback
            this.triggerScreenShake(rating);
            this.triggerScreenFlash('hit');
            this.triggerFeedbackText(player, rating);
            this.createHitParticles(this.ball.x, this.ball.y, dirX, rating, particleColor);
            
            if (rating === 'PERFECT') {
                sounds.playPerfectHit();
            } else {
                sounds.playHit(this.ball.speedMultiplier);
            }

            this.updateHUD();
        } else {
            // Missed / Pressed too early -> Trigger anti-spam penalty
            this.spamCooldown[player] = timestamp + this.cooldownDuration;
            
            // Generate visual "fail warning" (small warning particle burst at player's wall)
            const wallX = player === 'p1' ? 10 : this.width - 10;
            this.createSpamWarningParticles(wallX, this.ball.y, player);
            
            // Low feedback buzz sound
            sounds.playOscillator(150, 100, 0.1, 'sine', 0.08);
        }
    }

    triggerScreenShake(rating) {
        if (rating === 'PERFECT') {
            this.shakeStrength = 14;
        } else if (rating === 'GREAT') {
            this.shakeStrength = 7;
        } else {
            this.shakeStrength = 3;
        }
    }

    triggerScreenFlash(type) {
        this.screenFlashType = type;
        this.screenFlashTime = 6; // Active for 6 frames
    }

    triggerFeedbackText(player, rating) {
        const elementId = player === 'p1' ? 'hit-feedback-left' : 'hit-feedback-right';
        const el = document.getElementById(elementId);
        
        el.textContent = `${rating}!`;
        el.className = 'feedback-text'; // reset class list
        
        // Remove and force reflow to restart CSS animation
        void el.offsetWidth; 
        el.classList.add('feedback-trigger');

        // Style based on rating
        if (rating === 'PERFECT') {
            el.style.color = 'var(--color-gold)';
            el.style.textShadow = '0 0 15px rgba(255, 183, 0, 0.8)';
        } else if (rating === 'GREAT') {
            el.style.color = player === 'p1' ? 'var(--color-p1)' : 'var(--color-p2)';
            el.style.textShadow = player === 'p1' ? 
                '0 0 12px rgba(0, 240, 255, 0.7)' : 
                '0 0 12px rgba(255, 0, 127, 0.7)';
        } else {
            el.style.color = '#ffffff';
            el.style.textShadow = '0 0 8px rgba(255, 255, 255, 0.4)';
        }
    }

    createHitParticles(x, y, dirX, rating, color) {
        const count = rating === 'PERFECT' ? 35 : rating === 'GREAT' ? 20 : 10;
        const baseSpeed = rating === 'PERFECT' ? 10 : rating === 'GREAT' ? 6 : 4;
        
        for (let i = 0; i < count; i++) {
            const angle = (Math.random() * 80 - 40) * Math.PI / 180; // Cone distribution
            const speed = (0.4 + Math.random() * 0.8) * baseSpeed;
            
            this.particles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed * dirX + (dirX * 2), // blast direction
                vy: Math.sin(angle) * speed,
                radius: Math.random() * 3 + 1,
                color: color,
                alpha: 1.0,
                decay: 0.02 + Math.random() * 0.03,
                perfect: rating === 'PERFECT'
            });
        }
    }

    createSpamWarningParticles(x, y, player) {
        const color = player === 'p1' ? 'var(--color-p1)' : 'var(--color-p2)';
        // 5 red/player-colored error dots drifting downwards
        for (let i = 0; i < 6; i++) {
            this.particles.push({
                x: x,
                y: y + (Math.random() * 40 - 20),
                vx: player === 'p1' ? Math.random() * 2 : -Math.random() * 2,
                vy: Math.random() * 2 - 1,
                radius: 2,
                color: 'rgba(255, 56, 56, 0.8)',
                alpha: 0.8,
                decay: 0.05
            });
        }
    }

    updateHUD() {
        this.statsUI.p1Score.textContent = this.scores.p1;
        this.statsUI.p2Score.textContent = this.scores.p2;
        
        // P1 Combo Display
        if (this.streaks.p1 >= 2) {
            this.statsUI.p1Streak.textContent = this.streaks.p1;
            this.statsUI.p1StreakContainer.classList.add('active');
        } else {
            this.statsUI.p1StreakContainer.classList.remove('active');
        }

        // P2 Combo Display
        if (this.streaks.p2 >= 2) {
            this.statsUI.p2Streak.textContent = this.streaks.p2;
            this.statsUI.p2StreakContainer.classList.add('active');
        } else {
            this.statsUI.p2StreakContainer.classList.remove('active');
        }
    }

    updateBallPhysics() {
        // Ball movement
        this.ball.x += this.ball.vx;
        this.ball.y += this.ball.vy;

        // Ceiling and Floor collision
        if (this.ball.y - this.ball.radius <= 0) {
            this.ball.y = this.ball.radius;
            this.ball.vy = -this.ball.vy;
            sounds.playOscillator(200, 200, 0.08, 'sine', 0.08, false);
            this.shakeStrength = Math.max(this.shakeStrength, 2);
        } else if (this.ball.y + this.ball.radius >= this.height) {
            this.ball.y = this.height - this.ball.radius;
            this.ball.vy = -this.ball.vy;
            sounds.playOscillator(200, 200, 0.08, 'sine', 0.08, false);
            this.shakeStrength = Math.max(this.shakeStrength, 2);
        }

        // Goal/Wall collisions (Left / Right boundaries)
        // If ball collides with Player 1's wall (x = 0)
        if (this.ball.x - this.ball.radius <= 0) {
            this.scores.p2++;
            this.streaks.p1 = 0;
            this.streaks.p2 = 0;
            this.triggerScreenFlash('score');
            sounds.playLoss();
            this.updateHUD();
            
            if (this.scores.p2 >= this.winScore) {
                this.gameOver('p2');
            } else {
                this.resetBall(1); // Serve towards P1
            }
        } 
        // If ball collides with Player 2's wall (x = width)
        else if (this.ball.x + this.ball.radius >= this.width) {
            this.scores.p1++;
            this.streaks.p1 = 0;
            this.streaks.p2 = 0;
            this.triggerScreenFlash('score');
            sounds.playLoss();
            this.updateHUD();
            
            if (this.scores.p1 >= this.winScore) {
                this.gameOver('p1');
            } else {
                this.resetBall(-1); // Serve towards P2
            }
        }
    }

    updateVisuals() {
        // Record ball trail once per frame
        this.ball.trail.push({ x: this.ball.x, y: this.ball.y });
        if (this.ball.trail.length > 15) {
            this.ball.trail.shift();
        }

        // Update particles once per frame
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= p.decay;
            
            if (p.alpha <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // Decay screen shake once per frame
        if (this.shakeStrength > 0) {
            this.shakeStrength *= 0.88;
            if (this.shakeStrength < 0.2) this.shakeStrength = 0;
        }
    }

    draw() {
        this.ctx.save();

        // Clean slate
        this.ctx.fillStyle = '#06070d';
        this.ctx.fillRect(0, 0, this.width, this.height);

        // Apply Screen Shake
        if (this.shakeStrength > 0) {
            const dx = (Math.random() - 0.5) * this.shakeStrength;
            const dy = (Math.random() - 0.5) * this.shakeStrength;
            this.ctx.translate(dx, dy);
        }

        // Draw Retro Grid Lines
        this.drawBackgroundGrid();

        // Draw Player Hit Zones (Visual reference of Defense Lines)
        this.drawHitZones();

        // Draw Ball Trail
        this.drawBallTrail();

        // Draw Ball
        this.drawBall();

        // Draw Particles
        this.drawParticles();

        // Draw Midfield net / dividing neon line
        this.drawMidfieldLine();

        this.ctx.restore();

        // Process Screen Flash overlays
        if (this.screenFlashTime > 0) {
            this.screenFlashTime--;
            if (this.screenFlashType === 'hit') {
                this.statsUI.flashOverlay.className = 'flash-overlay active-hit';
            } else {
                this.statsUI.flashOverlay.className = 'flash-overlay active-score';
            }
        } else {
            this.statsUI.flashOverlay.className = 'flash-overlay';
        }
    }

    drawBackgroundGrid() {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
        this.ctx.lineWidth = 1;

        // Draw horizontal lines
        const horizGap = 36;
        for (let y = 0; y < this.height; y += horizGap) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.width, y);
            this.ctx.stroke();
        }

        // Draw vertical lines
        const vertGap = 40;
        for (let x = 0; x < this.width; x += vertGap) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.height);
            this.ctx.stroke();
        }
    }

    drawHitZones() {
        // Player 1 (Left Side) Hit Zone
        const gradL = this.ctx.createLinearGradient(0, 0, this.hitZoneWidth, 0);
        gradL.addColorStop(0, 'rgba(0, 240, 255, 0.22)');
        gradL.addColorStop(0.2, 'rgba(0, 240, 255, 0.1)');
        gradL.addColorStop(0.5, 'rgba(0, 240, 255, 0.05)');
        gradL.addColorStop(1, 'rgba(0, 240, 255, 0)');
        this.ctx.fillStyle = gradL;
        this.ctx.fillRect(0, 0, this.hitZoneWidth, this.height);

        // Player 1 Outer Boundaries (Perfect, Great boundaries)
        this.ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
        this.ctx.setLineDash([6, 6]);
        this.ctx.beginPath();
        this.ctx.moveTo(this.zones.good, 0);
        this.ctx.lineTo(this.zones.good, this.height);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Player 1 Goal energy barrier (Wall at x=5)
        this.ctx.strokeStyle = 'rgba(0, 240, 255, 0.8)';
        this.ctx.shadowColor = 'rgba(0, 240, 255, 0.8)';
        this.ctx.shadowBlur = 10;
        this.ctx.lineWidth = 4;
        this.ctx.beginPath();
        this.ctx.moveTo(4, 0);
        this.ctx.lineTo(4, this.height);
        this.ctx.stroke();
        this.ctx.shadowBlur = 0; // reset glow

        // Player 2 (Right Side) Hit Zone
        const gradR = this.ctx.createLinearGradient(this.width, 0, this.width - this.hitZoneWidth, 0);
        gradR.addColorStop(0, 'rgba(255, 0, 127, 0.22)');
        gradR.addColorStop(0.2, 'rgba(255, 0, 127, 0.1)');
        gradR.addColorStop(0.5, 'rgba(255, 0, 127, 0.05)');
        gradR.addColorStop(1, 'rgba(255, 0, 127, 0)');
        this.ctx.fillStyle = gradR;
        this.ctx.fillRect(this.width - this.hitZoneWidth, 0, this.hitZoneWidth, this.height);

        // Player 2 Outer Boundaries
        this.ctx.strokeStyle = 'rgba(255, 0, 127, 0.15)';
        this.ctx.setLineDash([6, 6]);
        this.ctx.beginPath();
        this.ctx.moveTo(this.width - this.zones.good, 0);
        this.ctx.lineTo(this.width - this.zones.good, this.height);
        this.ctx.stroke();
        this.ctx.setLineDash([]);

        // Player 2 Goal energy barrier (Wall at x=width-5)
        this.ctx.strokeStyle = 'rgba(255, 0, 127, 0.8)';
        this.ctx.shadowColor = 'rgba(255, 0, 127, 0.8)';
        this.ctx.shadowBlur = 10;
        this.ctx.lineWidth = 4;
        this.ctx.beginPath();
        this.ctx.moveTo(this.width - 4, 0);
        this.ctx.lineTo(this.width - 4, this.height);
        this.ctx.stroke();
        this.ctx.shadowBlur = 0; // reset glow
    }

    drawMidfieldLine() {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([10, 15]);
        this.ctx.beginPath();
        this.ctx.moveTo(this.width / 2, 0);
        this.ctx.lineTo(this.width / 2, this.height);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
    }

    drawBallTrail() {
        if (this.ball.trail.length < 2) return;

        // Choose trail color scheme based on ball speeds / multipliers
        let baseColor = 'rgba(255, 255, 255, ';
        if (this.ball.speedMultiplier > 2.0) {
            baseColor = 'rgba(255, 183, 0, '; // Gold trail for perfect speed
        } else if (this.ball.vx > 0) {
            baseColor = 'rgba(0, 240, 255, '; // Cyan trail moving right
        } else {
            baseColor = 'rgba(255, 0, 127, '; // Magenta trail moving left
        }

        this.ctx.lineWidth = this.ball.radius * 1.5;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // Draw trail segmented transparency
        for (let i = 1; i < this.ball.trail.length; i++) {
            const p1 = this.ball.trail[i - 1];
            const p2 = this.ball.trail[i];
            const opacity = (i / this.ball.trail.length) * 0.35;
            
            this.ctx.strokeStyle = `${baseColor}${opacity})`;
            this.ctx.beginPath();
            this.ctx.moveTo(p1.x, p1.y);
            this.ctx.lineTo(p2.x, p2.y);
            this.ctx.stroke();
        }
    }

    drawBall() {
        // Determine core ball color
        let glowColor = 'rgba(255, 255, 255, 0.8)';
        let shadowBlurVal = 12;

        if (this.ball.speedMultiplier > 2.0) {
            glowColor = 'var(--color-gold)';
            shadowBlurVal = 24;
        } else if (this.ball.vx > 0) {
            glowColor = 'var(--color-p1)';
        } else {
            glowColor = 'var(--color-p2)';
        }

        this.ctx.save();
        this.ctx.shadowColor = glowColor;
        this.ctx.shadowBlur = shadowBlurVal;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.beginPath();
        this.ctx.arc(this.ball.x, this.ball.y, this.ball.radius, 0, Math.PI * 2);
        this.ctx.fill();

        // Inner core border
        this.ctx.strokeStyle = glowColor;
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
        this.ctx.restore();
    }

    drawParticles() {
        this.ctx.save();
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            this.ctx.fillStyle = p.color;
            this.ctx.globalAlpha = p.alpha;
            
            // Add a subtle glow for perfect particles
            if (p.perfect) {
                this.ctx.shadowColor = p.color;
                this.ctx.shadowBlur = 6;
            } else {
                this.ctx.shadowBlur = 0;
            }

            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            this.ctx.fill();
        }
        this.ctx.restore();
    }

    // --- Primary Game Loop ---
    loop(time) {
        if (!this.lastTime) this.lastTime = time;
        const dt = time - this.lastTime;
        this.lastTime = time;

        if (this.state === this.STATE_PLAYING) {
            // Cap dt to prevent massive jumps when switching tabs
            const cappedDt = Math.min(dt, 30);
            
            // Sub-stepping for precise physics at high speed
            const steps = Math.ceil(this.ball.currentSpeed / 8); 
            this.ballWasReset = false; // Reset the flag for this frame

            for (let step = 0; step < steps; step++) {
                if (this.ballWasReset) break; // Stop physics processing if ball has reset during steps

                // Temporarily divide velocity for step fraction
                const origVx = this.ball.vx;
                const origVy = this.ball.vy;
                this.ball.vx = origVx / steps;
                this.ball.vy = origVy / steps;

                this.updateBallPhysics();

                // Restore velocity only if ball wasn't reset (e.g. scored a point)
                if (!this.ballWasReset) {
                    this.ball.vx = origVx;
                    this.ball.vy = origVy;
                }
            }

            // Update particle lists, trail logs, screen shake decay once per frame
            this.updateVisuals();
        }

        this.draw();
        
        requestAnimationFrame((t) => this.loop(t));
    }
}

// Instantiate and start requestAnimationFrame loops
window.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    requestAnimationFrame((t) => game.loop(t));
});
