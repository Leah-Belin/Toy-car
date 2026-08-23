// Minimal 2D vector helpers. Plain {x,y} objects, not a class, to keep the
// hot physics loop allocation-cheap.

export const v = (x = 0, y = 0) => ({ x, y });

export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a, s) => ({ x: a.x * s, y: a.y * s });
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const cross = (a, b) => a.x * b.y - a.y * b.x;
export const len = (a) => Math.hypot(a.x, a.y);
export const lenSq = (a) => a.x * a.x + a.y * a.y;

export function norm(a) {
  const l = len(a);
  if (l < 1e-9) return { x: 0, y: 0 };
  return { x: a.x / l, y: a.y / l };
}

// Rotate a local-space offset by angle (radians) into world space.
export function rotate(a, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}

// Perpendicular (rotate 90deg clockwise in screen space, y-down).
export const perp = (a) => ({ x: -a.y, y: a.x });

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
export const smoothstep = (t) => t * t * (3 - 2 * t);
