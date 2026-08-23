import { perp, lerp, clamp } from './vec2.js';

// ---------------------------------------------------------------------------
// Camera: follows the car horizontally with a look-ahead bias, and
// vertically with smoothing so hills/loops don't whip the view around.
// ---------------------------------------------------------------------------
export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
  }

  update(target, dt, canvasW, canvasH) {
    const lookAhead = clamp(target.vx * 0.35, -140, 220);
    const desiredX = target.x + lookAhead;
    const desiredY = target.y - canvasH * 0.08;
    const smooth = 1 - Math.pow(0.001, dt);
    this.x = lerp(this.x, desiredX, smooth);
    this.y = lerp(this.y, desiredY, smooth * 0.8);
  }

  worldToScreen(p, canvasW, canvasH) {
    return { x: p.x - this.x + canvasW / 2, y: p.y - this.y + canvasH / 2 };
  }
}

// Asphalt is drawn as molded orange/red Hot Wheels plastic track (seam
// ticks + blue support pylons); dirt/grass/ice stay natural off-road
// terrain colors, which is what actually carries the "grip differs by
// surface" gameplay signal.
const SURFACE_COLORS = {
  asphalt: { top: '#ff7a1a', body: '#c2440d', line: '#7a2600' },
  dirt: { top: '#a9713c', body: '#7a4f28', line: '#5c3a1c' },
  grass: { top: '#5cb84f', body: '#3d8a34', line: '#2c6425' },
  ice: { top: '#bfe9f7', body: '#8fc9e0', line: '#ffffff' },
  boost: { top: '#8be84a', body: '#4f9e2a', line: '#e8ffb0' },
};

const THEMES = {
  day: { sky: ['#7ec8f2', '#cdeeff'], hills: ['#8fd9a8', '#6bc48c'], city: true },
  desert: { sky: ['#f3c66b', '#ffe3a3'], hills: ['#d99a53', '#c07f3c'] },
  meadow: { sky: ['#a9e3c4', '#eafff0'], hills: ['#6fbf6f', '#4f9e51'] },
  carnival: { sky: ['#f79fd0', '#ffe1f2'], hills: ['#f5c04a', '#e89b3c'], city: true },
  canyon: { sky: ['#f0955a', '#ffd9a8'], hills: ['#b5583a', '#8e3f28'] },
  snow: { sky: ['#cfe6f7', '#f2fbff'], hills: ['#e8f4fb', '#c9e4f2'] },
  volcano: { sky: ['#3a2233', '#7a3049'], hills: ['#4a1f2a', '#2c1119'], city: true },
};

export function drawBackground(ctx, camera, canvasW, canvasH, theme) {
  const t = THEMES[theme] || THEMES.day;
  const sky = ctx.createLinearGradient(0, 0, 0, canvasH);
  sky.addColorStop(0, t.sky[0]);
  sky.addColorStop(1, t.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvasW, canvasH);

  if (t.city) drawSkyline(ctx, camera, canvasW, canvasH);

  for (let layer = 0; layer < 2; layer++) {
    const parallax = layer === 0 ? 0.15 : 0.3;
    const baseY = canvasH * (0.62 + layer * 0.08);
    const amp = 40 + layer * 30;
    const freq = 0.0035 - layer * 0.001;
    const offset = -camera.x * parallax;
    ctx.fillStyle = t.hills[layer];
    ctx.beginPath();
    ctx.moveTo(0, canvasH);
    for (let x = 0; x <= canvasW; x += 20) {
      const worldX = x - offset;
      const y = baseY - Math.sin(worldX * freq) * amp - Math.sin(worldX * freq * 2.3) * amp * 0.4;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(canvasW, canvasH);
    ctx.closePath();
    ctx.fill();
  }
}

// A distant, deterministic city skyline (buildings sized/spaced from their
// world x so it doesn't shimmer as the camera scrolls).
function drawSkyline(ctx, camera, canvasW, canvasH) {
  const parallax = 0.06;
  const offset = -camera.x * parallax;
  const baseY = canvasH * 0.58;
  const spacing = 90;
  const firstIndex = Math.floor((-offset) / spacing) - 1;
  const lastWorldX = canvasW - offset;
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = firstIndex; offset + i * spacing <= lastWorldX + spacing; i++) {
    const seed = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    const h = 60 + seed * 150;
    const w = spacing * 0.55;
    const x = offset + i * spacing;
    ctx.fillRect(x, baseY - h, w, h + canvasH);
    // A few lit windows for texture.
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    for (let wy = baseY - h + 12; wy < baseY - 10; wy += 18) {
      ctx.fillRect(x + w * 0.2, wy, 4, 4);
      ctx.fillRect(x + w * 0.6, wy, 4, 4);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
  }
}

const GROUND_THICKNESS = 46;
const PYLON_SPACING = 320;

export function drawTrack(ctx, camera, canvasW, canvasH, track) {
  for (const chain of track.chains) {
    if (chain.length < 2) continue;
    ctx.beginPath();
    for (let i = 0; i < chain.length; i++) {
      const p = camera.worldToScreen(chain[i], canvasW, canvasH);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    for (let i = chain.length - 1; i >= 0; i--) {
      const tangent = chainTangent(chain, i);
      const off = perp(tangent);
      const bx = chain[i].x + off.x * GROUND_THICKNESS;
      const by = chain[i].y + off.y * GROUND_THICKNESS;
      const p = camera.worldToScreen({ x: bx, y: by }, canvasW, canvasH);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fillStyle = '#5c4632';
    ctx.fill();

    drawPylons(ctx, camera, canvasW, canvasH, chain);

    // Surface-colored top stroke, drawn per same-surface run.
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let runStart = 0;
    for (let i = 1; i <= chain.length; i++) {
      const changed = i === chain.length || chain[i].surface !== chain[runStart].surface;
      if (!changed) continue;
      const surface = chain[runStart].surface;
      const colors = SURFACE_COLORS[surface] || SURFACE_COLORS.asphalt;
      ctx.beginPath();
      for (let j = runStart; j < i; j++) {
        const p = camera.worldToScreen(chain[j], canvasW, canvasH);
        if (j === runStart) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = colors.top;
      ctx.lineWidth = 14;
      ctx.stroke();

      if (surface === 'asphalt' || surface === 'boost') {
        drawSeamTicks(ctx, camera, canvasW, canvasH, chain, runStart, i, colors.line);
      } else {
        ctx.beginPath();
        for (let j = runStart; j < i; j++) {
          const p = camera.worldToScreen(chain[j], canvasW, canvasH);
          if (j === runStart) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        }
        ctx.strokeStyle = colors.line;
        ctx.lineWidth = 3;
        ctx.setLineDash([16, 14]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      runStart = i;
    }
  }
}

// Molded-plastic-track look: short perpendicular ticks where track segments
// would snap together, instead of a painted road stripe.
function drawSeamTicks(ctx, camera, canvasW, canvasH, chain, from, to, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  const step = 34;
  let sinceLast = 0;
  for (let i = from; i < to; i++) {
    sinceLast += i > from ? Math.hypot(chain[i].x - chain[i - 1].x, chain[i].y - chain[i - 1].y) : 0;
    if (sinceLast < step) continue;
    sinceLast = 0;
    const tangent = chainTangent(chain, i);
    const n = perp(tangent);
    const a = camera.worldToScreen({ x: chain[i].x - n.x * 6, y: chain[i].y - n.y * 6 }, canvasW, canvasH);
    const b = camera.worldToScreen({ x: chain[i].x + n.x * 6, y: chain[i].y + n.y * 6 }, canvasW, canvasH);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

// Blue support struts under asphalt sections, like the elevated orange
// track's stands.
function drawPylons(ctx, camera, canvasW, canvasH, chain) {
  ctx.strokeStyle = '#2f6fb0';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  let sinceLast = 0;
  for (let i = 1; i < chain.length; i++) {
    sinceLast += Math.hypot(chain[i].x - chain[i - 1].x, chain[i].y - chain[i - 1].y);
    if (sinceLast < PYLON_SPACING || chain[i].surface !== 'asphalt') continue;
    sinceLast = 0;
    const tangent = chainTangent(chain, i);
    const n = perp(tangent);
    const topPt = { x: chain[i].x + n.x * GROUND_THICKNESS, y: chain[i].y + n.y * GROUND_THICKNESS };
    const botPt = { x: topPt.x + n.x * 160, y: topPt.y + n.y * 160 };
    const a = camera.worldToScreen(topPt, canvasW, canvasH);
    const b = camera.worldToScreen(botPt, canvasW, canvasH);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function chainTangent(chain, i) {
  const a = chain[Math.max(0, i - 1)];
  const b = chain[Math.min(chain.length - 1, i + 1)];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { x: dx / len, y: dy / len };
}

// ---------------------------------------------------------------------------
// Coins: small spinning discs collected for the persistent wallet.
// ---------------------------------------------------------------------------
export function drawCoins(ctx, camera, canvasW, canvasH, coins) {
  const t = performance.now() / 1000;
  for (const coin of coins) {
    if (coin.taken) continue;
    const screen = camera.worldToScreen(coin, canvasW, canvasH);
    if (screen.x < -30 || screen.x > canvasW + 30) continue;
    const squash = Math.abs(Math.cos(t * 3 + coin.x * 0.01));
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.scale(0.4 + squash * 0.6, 1);
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#a3790a';
    ctx.stroke();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Car: a simple chunky toy silhouette -- rounded body + two wheels -- drawn
// in the car's own color, oriented to car.angle.
// ---------------------------------------------------------------------------
export function drawCar(ctx, camera, canvasW, canvasH, car) {
  const screen = camera.worldToScreen(car.pos, canvasW, canvasH);
  const stats = car.stats;
  const r = stats.wheelRadius;
  const half = stats.wheelBase / 2;

  ctx.save();
  ctx.translate(screen.x, screen.y);
  ctx.rotate(car.angle);

  // Shadow shift so the body reads as sitting above the wheel axle line.
  const bodyLift = r * 1.15;

  // Wheels
  ctx.fillStyle = '#232323';
  for (const wx of [-half, half]) {
    ctx.beginPath();
    ctx.arc(wx, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a5a5a';
    ctx.beginPath();
    ctx.arc(wx, 0, r * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#232323';
  }

  // Body
  const bw = half * 2 + r * 0.8;
  const bh = r * 1.7;
  ctx.beginPath();
  roundedRect(ctx, -bw / 2, -bodyLift - bh * 0.55, bw, bh, bh * 0.4);
  ctx.fillStyle = stats.color;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = stats.accent;
  ctx.stroke();

  // Cabin
  ctx.beginPath();
  roundedRect(ctx, -bw * 0.22, -bodyLift - bh * 1.05, bw * 0.46, bh * 0.6, bh * 0.25);
  ctx.fillStyle = stats.accent;
  ctx.globalAlpha = 0.85;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.restore();
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Lightweight particle system: dust/sparks kicked up while driving, used for
// surface feedback and landing impacts.
// ---------------------------------------------------------------------------
export class Particles {
  constructor() {
    this.items = [];
  }

  spawnDust(x, y, color, count = 3) {
    for (let i = 0; i < count; i++) {
      this.items.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 60,
        vy: -Math.random() * 60 - 20,
        life: 0.5 + Math.random() * 0.3,
        age: 0,
        size: 3 + Math.random() * 3,
        color,
      });
    }
  }

  update(dt) {
    for (const p of this.items) {
      p.age += dt;
      p.vy += 400 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.items = this.items.filter((p) => p.age < p.life);
  }

  draw(ctx, camera, canvasW, canvasH) {
    for (const p of this.items) {
      const t = p.age / p.life;
      const screen = camera.worldToScreen(p, canvasW, canvasH);
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, p.size * (1 - t * 0.5), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
