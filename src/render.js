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

const SURFACE_COLORS = {
  asphalt: { top: '#4a4f5c', body: '#33363f', line: '#e8e8e8' },
  dirt: { top: '#a9713c', body: '#7a4f28', line: '#5c3a1c' },
  grass: { top: '#5cb84f', body: '#3d8a34', line: '#2c6425' },
  ice: { top: '#bfe9f7', body: '#8fc9e0', line: '#ffffff' },
  boost: { top: '#ff9d33', body: '#d9711a', line: '#ffe08a' },
};

const THEMES = {
  day: { sky: ['#7ec8f2', '#cdeeff'], hills: ['#8fd9a8', '#6bc48c'] },
  desert: { sky: ['#f3c66b', '#ffe3a3'], hills: ['#d99a53', '#c07f3c'] },
  meadow: { sky: ['#a9e3c4', '#eafff0'], hills: ['#6fbf6f', '#4f9e51'] },
  carnival: { sky: ['#f79fd0', '#ffe1f2'], hills: ['#f5c04a', '#e89b3c'] },
  canyon: { sky: ['#f0955a', '#ffd9a8'], hills: ['#b5583a', '#8e3f28'] },
  snow: { sky: ['#cfe6f7', '#f2fbff'], hills: ['#e8f4fb', '#c9e4f2'] },
  volcano: { sky: ['#3a2233', '#7a3049'], hills: ['#4a1f2a', '#2c1119'] },
};

export function drawBackground(ctx, camera, canvasW, canvasH, theme) {
  const t = THEMES[theme] || THEMES.day;
  const sky = ctx.createLinearGradient(0, 0, 0, canvasH);
  sky.addColorStop(0, t.sky[0]);
  sky.addColorStop(1, t.sky[1]);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvasW, canvasH);

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

const GROUND_THICKNESS = 46;

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

    // Surface-colored top stroke, drawn per same-surface run for the
    // road's driving line (dashed center line for asphalt/boost).
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let runStart = 0;
    for (let i = 1; i <= chain.length; i++) {
      const changed = i === chain.length || chain[i].surface !== chain[runStart].surface;
      if (!changed) continue;
      const colors = SURFACE_COLORS[chain[runStart].surface] || SURFACE_COLORS.asphalt;
      ctx.beginPath();
      for (let j = runStart; j < i; j++) {
        const p = camera.worldToScreen(chain[j], canvasW, canvasH);
        if (j === runStart) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = colors.top;
      ctx.lineWidth = 14;
      ctx.stroke();
      ctx.strokeStyle = colors.line;
      ctx.lineWidth = 3;
      ctx.setLineDash(chain[runStart].surface === 'grass' || chain[runStart].surface === 'ice' ? [] : [16, 14]);
      ctx.stroke();
      ctx.setLineDash([]);
      runStart = i;
    }
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
