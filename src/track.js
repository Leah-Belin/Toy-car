import { smoothstep } from './vec2.js';

// ---------------------------------------------------------------------------
// Track building.
//
// A car in this game rides the track like a real Hot Wheels car rides a
// track groove: position is an arc-length `s` along a polyline "chain",
// not a free rigid body. This guarantees loops and curves are always
// followed correctly. The car only leaves the rail (real 2D projectile
// physics) in two situations: it drives off the end of a chain (a 'gap'
// segment split the road), or it loses contact inside a loop because it
// isn't going fast enough (real centripetal-force physics, see car.js).
//
// A track is described as a sequence of human-readable segments (flat,
// hill, bumps, ramp, gap, loop, boost, checkpoint), turned here into:
//  - chains: arrays of {x, y, surface, arc} points (arc = cumulative
//    distance from the start of that chain, used to place a car by s).
//  - segments: a flat list of collision segments (for landing sweeps),
//    each tagged with the chain/arc-length it belongs to.
//  - loopRegions: {chainIndex, sStart, sEnd, centerX, centerY, radius}
//    used for the minimum-loop-speed check.
//  - checkpoints: {x, y, chainIndex, s} respawn points.
// ---------------------------------------------------------------------------

export function buildTrack(startX, startY, segments, stepSize = 10) {
  let cx = startX;
  let cy = startY;
  const chains = [];
  let chain = [{ x: cx, y: cy, surface: 'asphalt', arc: 0 }];
  const checkpoints = [{ x: cx, y: cy, chainIndex: 0, s: 0 }];
  const boostZones = [];
  const decals = []; // {type:'gap'|'loop', ...} for background art
  const loopRegions = [];

  const push = (x, y, surface) => {
    const prev = chain[chain.length - 1];
    const arc = prev.arc + Math.hypot(x - prev.x, y - prev.y);
    chain.push({ x, y, surface, arc });
    cx = x;
    cy = y;
  };

  const endChain = () => {
    if (chain.length > 1) chains.push(chain);
    chain = [];
  };

  for (const seg of segments) {
    const surface = seg.surface || 'asphalt';
    switch (seg.type) {
      case 'flat': {
        const n = Math.max(1, Math.round(seg.length / stepSize));
        for (let i = 1; i <= n; i++) push(cx + seg.length / n, cy, surface);
        break;
      }
      case 'hill': {
        const n = Math.max(2, Math.round(seg.length / stepSize));
        const x0 = cx;
        const y0 = cy;
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          push(x0 + seg.length * t, y0 - seg.height * smoothstep(t), surface);
        }
        break;
      }
      case 'bumps': {
        const n = Math.max(2, Math.round(seg.length / stepSize));
        const x0 = cx;
        const y0 = cy;
        const amp = seg.amplitude ?? 10;
        const freq = seg.frequency ?? 3;
        for (let i = 1; i <= n; i++) {
          const t = i / n;
          const envelope = Math.sin(t * Math.PI); // fades in/out at seams
          push(x0 + seg.length * t, y0 - Math.sin(t * Math.PI * 2 * freq) * amp * envelope, surface);
        }
        break;
      }
      case 'ramp': {
        const rad = (seg.angle * Math.PI) / 180;
        const n = Math.max(1, Math.round(seg.length / stepSize));
        const dx = Math.cos(rad);
        const dy = -Math.sin(rad); // positive angle lifts the ramp up
        for (let i = 1; i <= n; i++) push(cx + dx * (seg.length / n), cy + dy * (seg.length / n), surface);
        break;
      }
      case 'gap': {
        const x1 = cx;
        endChain();
        cx += seg.length;
        cy += seg.drop ?? 0;
        chain = [{ x: cx, y: cy, surface: seg.landingSurface || surface, arc: 0 }];
        decals.push({ type: 'gap', x1, x2: cx, y: cy });
        break;
      }
      case 'loop': {
        const r = seg.radius;
        const centerX = cx;
        const centerY = cy - r;
        const steps = seg.steps || 96;
        const sStart = chain[chain.length - 1].arc;
        const chainIndex = chains.length;
        // Start at the bottom of the circle (th=+90deg, matching the entry
        // point) and sweep backwards through decreasing theta so the car
        // climbs the right wall first, over the top, down the left wall,
        // and back to the bottom -- with no discontinuity at the seam.
        for (let i = 1; i <= steps; i++) {
          const th = Math.PI / 2 - (i / steps) * Math.PI * 2;
          push(centerX + r * Math.cos(th), centerY + r * Math.sin(th), surface);
        }
        const sEnd = chain[chain.length - 1].arc;
        loopRegions.push({ chainIndex, sStart, sEnd, centerX, centerY, radius: r });
        decals.push({ type: 'loop', x1: centerX - r, x2: centerX + r, cy: centerY, r });
        break;
      }
      case 'boost': {
        boostZones.push({ x1: cx, x2: cx + seg.length });
        const n = Math.max(1, Math.round(seg.length / stepSize));
        for (let i = 1; i <= n; i++) push(cx + seg.length / n, cy, 'boost');
        break;
      }
      case 'checkpoint': {
        const last = chain[chain.length - 1];
        checkpoints.push({ x: last.x, y: last.y, chainIndex: chains.length, s: last.arc });
        break;
      }
      default:
        break;
    }
  }
  endChain();

  const segList = buildCollisionSegments(chains);
  const bounds = computeBounds(chains, startX, startY, cx);

  return {
    chains,
    segments: segList,
    checkpoints,
    boostZones,
    decals,
    loopRegions,
    // Stashed so extendTrack() can rebuild from the full segment history
    // (including everything procedurally appended so far) in one shot.
    segmentList: segments,
    stepSize,
    startX,
    startY,
    finishX: cx,
    bounds,
  };
}

function buildCollisionSegments(chains) {
  const segs = [];
  for (let c = 0; c < chains.length; c++) {
    const chain = chains[c];
    for (let i = 0; i < chain.length - 1; i++) {
      const p0 = chain[i];
      const p1 = chain[i + 1];
      segs.push({
        p0,
        p1,
        surface: p1.surface,
        chainIndex: c,
        sStart: p0.arc,
        minX: Math.min(p0.x, p1.x),
        maxX: Math.max(p0.x, p1.x),
        minY: Math.min(p0.y, p1.y),
        maxY: Math.max(p0.y, p1.y),
      });
    }
  }
  return segs;
}

function computeBounds(chains, startX, startY, endX) {
  let minX = startX;
  let maxX = endX;
  let minY = startY;
  let maxY = startY;
  for (const chain of chains) {
    for (const p of chain) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return { minX, maxX, minY, maxY };
}

// Position, tangent and surface at arc-length `s` along a chain (clamped to
// the chain's own range). Chain arc values are monotonically increasing, so
// this is a simple binary search.
export function pointAtS(chain, s) {
  const n = chain.length;
  const clamped = Math.max(0, Math.min(chain[n - 1].arc, s));
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (chain[mid].arc <= clamped) lo = mid;
    else hi = mid;
  }
  const p0 = chain[lo];
  const p1 = chain[hi];
  const segLen = p1.arc - p0.arc;
  const t = segLen > 1e-9 ? (clamped - p0.arc) / segLen : 0;
  const x = p0.x + (p1.x - p0.x) * t;
  const y = p0.y + (p1.y - p0.y) * t;
  const tl = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1;
  return {
    x,
    y,
    tangent: { x: (p1.x - p0.x) / tl, y: (p1.y - p0.y) / tl },
    surface: p1.surface,
  };
}

// Cast a ray (origin + normalized dir, up to maxDist) against the track's
// collision segments. Returns the nearest hit {dist, point, normal, surface,
// chainIndex, s} or null. Used both for the classic raycast use-case and as
// a swept origin->target landing check while a car is airborne.
export function castRay(track, origin, dir, maxDist) {
  const padding = 4;
  const rx0 = Math.min(origin.x, origin.x + dir.x * maxDist) - padding;
  const rx1 = Math.max(origin.x, origin.x + dir.x * maxDist) + padding;
  const ry0 = Math.min(origin.y, origin.y + dir.y * maxDist) - padding;
  const ry1 = Math.max(origin.y, origin.y + dir.y * maxDist) + padding;

  let best = null;
  const segs = track.segments;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (s.maxX < rx0 || s.minX > rx1 || s.maxY < ry0 || s.minY > ry1) continue;

    const ex = s.p1.x - s.p0.x;
    const ey = s.p1.y - s.p0.y;
    const denom = dir.x * ey - dir.y * ex;
    if (Math.abs(denom) < 1e-9) continue;

    const dx = s.p0.x - origin.x;
    const dy = s.p0.y - origin.y;
    const t = (dx * ey - dy * ex) / denom;
    // t<=eps excludes self-hits: a ray cast from a point that lies exactly
    // on (or at the endpoint of) a track segment -- e.g. right after
    // launching off the end of a chain -- would otherwise immediately
    // "land" back at distance 0 on the segment it just left.
    if (t <= 1e-3 || t > maxDist) continue;
    const sParam = (dx * dir.y - dy * dir.x) / denom;
    if (sParam < 0 || sParam > 1) continue;

    if (!best || t < best.dist) {
      let nx = -ey;
      let ny = ex;
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl;
      ny /= nl;
      if (nx * dir.x + ny * dir.y > 0) {
        nx = -nx;
        ny = -ny;
      }
      const segLen = Math.hypot(ex, ey) || 1;
      best = {
        dist: t,
        point: { x: origin.x + dir.x * t, y: origin.y + dir.y * t },
        normal: { x: nx, y: ny },
        surface: s.surface,
        chainIndex: s.chainIndex,
        s: s.sStart + sParam * segLen,
      };
    }
  }
  return best;
}

// Append more segments to a track and rebuild. Because we always rebuild
// from the full segment history (not an incremental patch), the regenerated
// chains up to the old end are byte-for-byte the same shape as before --
// just a new array -- so a car's existing {chainIndex, s} stays valid
// across the swap; the caller just needs to start using the returned
// object.
export function extendTrack(track, newSegments) {
  const fullSegments = [...track.segmentList, ...newSegments];
  return buildTrack(track.startX, track.startY, fullSegments, track.stepSize);
}

// Nearest checkpoint at or before the given progress (max x reached).
export function checkpointFor(track, progressX) {
  let best = track.checkpoints[0];
  for (const cp of track.checkpoints) {
    if (cp.x <= progressX + 1) best = cp;
  }
  return best;
}
