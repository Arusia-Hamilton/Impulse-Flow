(function() {
    // --- 設定項目 ---
    const BALL_COUNT = 10;          // 画面に表示されるメインオブジェクト（球体）の数
    const MIN_SPEED = 5;           // オブジェクトの最低速度（常にこの速さ以上で動く）
    const MAX_BOOST_SPEED = 15;    // 通常の衝突時に加速する際の最高速度
    const EMERGENCY_SPEED = 25;    // 壁とマウスに挟まれた際などの緊急回避速度
    const FRICTION = 0.97;         // 摩擦（加速した後に徐々に元の速度へ戻る減衰率）
    const HITBOX_SCALE = 1.3;      // 当たり判定の倍率（1.0で見た目通り、大きいほど離れていても衝突する）
    
    const BALL_SIZE_MIN = 8;       // オブジェクトの最小半径
    const BALL_SIZE_MAX = 25;      // オブジェクトの最大半径
    
    const TRAIL_ALPHA = 0.2;       // 残像の濃さ（小さいほど長い尾を引く）
    const PARTICLE_COUNT = 8;      // 1回の衝突で発生する火花の数
    const PARTICLE_DECAY = 0.94;   // 火花の消えやすさ（小さいほど早く消える）

    const LINK_DISTANCE = 180;     // オブジェクト同士が線で繋がる最大距離
    const LINK_WIDTH = 1;          // 繋がる線の太さ

    // 衝撃波（クリック時）の設定
    const MOUSE_RADIUS = 50;       // 通常時のマウスの当たり判定半径
    const SHOCKWAVE_MAX_RADIUS = 250; // 衝撃波が広がる最大の半径
    const SHOCKWAVE_SPEED = 12;    // 衝撃波が広がる速さ
    const SHOCKWAVE_FORCE = 35;    // 衝撃波がオブジェクトを弾き飛ばす力
    const SHOCKWAVE_THICKNESS = 20; // 衝撃波の当たり判定の「波の厚み」
    // ----------------

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.zIndex = '-1';
    canvas.style.pointerEvents = 'none'; 
    document.body.appendChild(canvas);

    let balls = [];
    let particles = [];
    let shockwaves = []; 
    
    let mouse = { x: -1000, y: -1000, radius: MOUSE_RADIUS };

    window.addEventListener('mousemove', (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
    });

    window.addEventListener('mousedown', (e) => {
        shockwaves.push({
            x: e.clientX,
            y: e.clientY,
            currentRadius: 0,
            alpha: 1,
            affectedBalls: new Set()
        });
    });

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    function getRandomColor() {
        return `hsla(${Math.floor(Math.random() * 360)}, 80%, 60%, 0.8)`;
    }

    class Particle {
        constructor(x, y, color) {
            this.x = x; this.y = y; this.color = color;
            this.radius = Math.random() * 2 + 1;
            const angle = Math.random() * Math.PI * 2;
            const force = Math.random() * 8 + 2;
            this.vx = Math.cos(angle) * force;
            this.vy = Math.sin(angle) * force;
            this.alpha = 1;
        }
        update() { this.x += this.vx; this.y += this.vy; this.alpha *= PARTICLE_DECAY; }
        draw() {
            ctx.save(); ctx.globalAlpha = this.alpha;
            ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
            ctx.fillStyle = this.color; ctx.fill(); ctx.restore();
        }
    }

    class Ball {
        constructor() {
            this.baseRadius = Math.random() * (BALL_SIZE_MAX - BALL_SIZE_MIN) + BALL_SIZE_MIN;
            this.radius = this.baseRadius;
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            const angle = Math.random() * Math.PI * 2;
            this.vx = Math.cos(angle) * MIN_SPEED;
            this.vy = Math.sin(angle) * MIN_SPEED;
            this.color = getRandomColor();
            this.effectTimer = 0;
            this.id = Math.random().toString(36).substr(2, 9);
        }

        onCollide(x, y, isEmergency = false) {
            this.color = getRandomColor();
            this.effectTimer = isEmergency ? 20 : 10;
            for (let i = 0; i < (isEmergency ? PARTICLE_COUNT * 2 : PARTICLE_COUNT); i++) {
                particles.push(new Particle(x || this.x, y || this.y, this.color));
            }
        }

        draw() {
            let displayRadius = this.radius;
            if (this.effectTimer > 0) { displayRadius += this.effectTimer * 1.0; this.effectTimer--; }
            ctx.beginPath(); ctx.arc(this.x, this.y, displayRadius, 0, Math.PI * 2);
            ctx.fillStyle = this.color; ctx.fill(); ctx.closePath();
        }

        update() {
            this.x += this.vx; this.y += this.vy;
            if (this.x + this.baseRadius > canvas.width || this.x - this.baseRadius < 0) {
                this.vx *= -1; this.x = this.x < this.baseRadius ? this.baseRadius : canvas.width - this.baseRadius;
                this.onCollide();
            }
            if (this.y + this.baseRadius > canvas.height || this.y - this.baseRadius < 0) {
                this.vy *= -1;
                this.y = this.y < this.baseRadius ? this.baseRadius : canvas.height - this.baseRadius;
                this.onCollide();
            }
            let currentSpeed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
            if (currentSpeed > MIN_SPEED) { this.vx *= FRICTION; this.vy *= FRICTION; }
            if (currentSpeed < MIN_SPEED) {
                let ratio = MIN_SPEED / (currentSpeed || 1);
                this.vx *= ratio; this.vy *= ratio;
            }
        }
    }

    function updateAndDrawShockwaves() {
        for (let i = shockwaves.length - 1; i >= 0; i--) {
            const sw = shockwaves[i];
            
            ctx.save();
            ctx.beginPath();
            ctx.arc(sw.x, sw.y, sw.currentRadius, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 255, 255, ${sw.alpha})`;
            ctx.lineWidth = 4;
            ctx.stroke();
            ctx.restore();

            balls.forEach(ball => {
                if (sw.affectedBalls.has(ball.id)) return;

                const dx = ball.x - sw.x;
                const dy = ball.y - sw.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (Math.abs(dist - sw.currentRadius) < SHOCKWAVE_THICKNESS) {
                    const angle = Math.atan2(dy, dx);

                    ball.vx = Math.cos(angle) * SHOCKWAVE_FORCE;
                    ball.vy = Math.sin(angle) * SHOCKWAVE_FORCE;
                    ball.onCollide(null, null, true);
                    sw.affectedBalls.add(ball.id);
                }
            });

            sw.currentRadius += SHOCKWAVE_SPEED;
            sw.alpha -= 0.02;

            if (sw.alpha <= 0 || sw.currentRadius > SHOCKWAVE_MAX_RADIUS) {
                shockwaves.splice(i, 1);
            }
        }
    }

    function handleMouseCollision(ball) {
        let dx = ball.x - mouse.x;
        let dy = ball.y - mouse.y;
        let distance = Math.sqrt(dx * dx + dy * dy);
        let minDistance = (ball.baseRadius + mouse.radius) * HITBOX_SCALE;
        if (distance < minDistance) {
            const margin = 60;
            const isNearWall = (ball.x < margin || ball.x > canvas.width - margin || ball.y < margin || ball.y > canvas.height - margin);
            let angle = Math.atan2(dy, dx);
            let pushForce = isNearWall ? EMERGENCY_SPEED : MAX_BOOST_SPEED;
            ball.vx = Math.cos(angle) * pushForce;
            ball.vy = Math.sin(angle) * pushForce;
            ball.onCollide(mouse.x + Math.cos(angle) * mouse.radius, mouse.y + Math.sin(angle) * mouse.radius, isNearWall);
            let overlap = minDistance - distance;
            ball.x += Math.cos(angle) * (overlap + (isNearWall ? 20 : 0));
            ball.y += Math.sin(angle) * (overlap + (isNearWall ? 20 : 0));
        }
    }

    function animate() {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = `rgba(255, 255, 255, ${TRAIL_ALPHA})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-over';

        for (let i = 0; i < balls.length; i++) {
            for (let j = i + 1; j < balls.length; j++) {
                let b1 = balls[i], b2 = balls[j];
                let dx = b2.x - b1.x, dy = b2.y - b1.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                let minDist = (b1.baseRadius + b2.baseRadius) * HITBOX_SCALE;
                if (dist < minDist) {
                    let angle = Math.atan2(dy, dx);
                    b1.vx = -Math.cos(angle) * MAX_BOOST_SPEED; b1.vy = -Math.sin(angle) * MAX_BOOST_SPEED;
                    b2.vx = Math.cos(angle) * MAX_BOOST_SPEED; b2.vy = Math.sin(angle) * MAX_BOOST_SPEED;
                    b1.onCollide(); b2.onCollide();
                    let overlap = minDist - dist;
                    b1.x -= Math.cos(angle) * (overlap / 2); b1.y -= Math.sin(angle) * (overlap / 2);
                    b2.x += Math.cos(angle) * (overlap / 2); b2.y += Math.sin(angle) * (overlap / 2);
                }
            }
            handleMouseCollision(balls[i]);
        }

        updateAndDrawShockwaves();

        for (let i = 0; i < balls.length; i++) {
            for (let j = i + 1; j < balls.length; j++) {
                const b1 = balls[i], b2 = balls[j];
                const dx = b2.x - b1.x, dy = b2.y - b1.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < LINK_DISTANCE) {
                    const alpha = (1 - dist / LINK_DISTANCE) * 0.4;
                    ctx.beginPath(); ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y);
                    ctx.strokeStyle = b1.color.replace('0.8)', `${alpha})`);
                    ctx.lineWidth = LINK_WIDTH; ctx.stroke();
                }
            }
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            particles[i].update(); particles[i].draw();
            if (particles[i].alpha < 0.01) particles.splice(i, 1);
        }
        balls.forEach(ball => { ball.update(); ball.draw(); });
        requestAnimationFrame(animate);
    }

    balls = [];
    for (let i = 0; i < BALL_COUNT; i++) balls.push(new Ball());
    animate();
})();
