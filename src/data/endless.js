// Procedural continuation for endless tracks. Each hand-authored track (see
// tracks.js) has a curated intro; once the car gets near the end of what's
// been generated so far, we append another randomly-picked "chunk" here and
// rebuild. Every chunk is height-neutral (ends at the same y it started at)
// so an endless run never drifts the baseline off into space -- hills come
// in up/down pairs, ramp climbs are paid back with a matching descent, and
// loops/bumps are neutral by construction.

const lerp = (a, b, t) => a + (b - a) * t;

function buffer(rng, surface, lo = 70, hi = 120) {
  return { type: 'flat', length: lerp(lo, hi, rng()), surface };
}

function rollingHills(rng, surface, difficulty) {
  const h = lerp(25, 85, difficulty) * (0.7 + rng() * 0.6);
  const len = lerp(180, 260, rng());
  return [
    buffer(rng, surface),
    { type: 'hill', length: len, height: h, surface },
    { type: 'hill', length: len, height: -h, surface },
  ];
}

function bumpyPatch(rng, surface, difficulty) {
  return [
    buffer(rng, surface),
    {
      type: 'bumps',
      length: lerp(220, 380, rng()),
      amplitude: lerp(6, 17, difficulty),
      frequency: Math.round(lerp(3, 6, rng())),
      surface,
    },
  ];
}

function gapJump(rng, surface, difficulty) {
  const angle = lerp(13, 22, difficulty) * (0.85 + rng() * 0.3);
  const rampLen = lerp(60, 110, rng());
  const climb = rampLen * Math.sin((angle * Math.PI) / 180);
  const gapLen = lerp(45, 130, difficulty) * (0.8 + rng() * 0.4);
  return [
    buffer(rng, surface),
    { type: 'ramp', length: rampLen, angle, surface },
    { type: 'gap', length: gapLen },
    buffer(rng, surface, 90, 150),
    { type: 'hill', length: 160, height: -climb, surface }, // pay back the climb
  ];
}

function loopChunk(rng, surface, difficulty) {
  const radius = lerp(105, 150, rng());
  return [
    buffer(rng, surface),
    { type: 'boost', length: 100 + rng() * 40 },
    { type: 'loop', radius, surface: 'asphalt' },
    buffer(rng, surface),
  ];
}

const KINDS = [
  { key: 'hills', build: rollingHills, minDifficulty: 0, weight: 3 },
  { key: 'bumps', build: bumpyPatch, minDifficulty: 0, weight: 3 },
  { key: 'gap', build: gapJump, minDifficulty: 0.15, weight: 2.5 },
  { key: 'loop', build: loopChunk, minDifficulty: 0.3, weight: 1.5 },
];

// distancePx: how far into the run this chunk starts (used to ramp difficulty).
export function generateChunk(surface, distancePx, weights = {}, rng = Math.random) {
  const difficulty = Math.min(1, distancePx / 9000);
  const options = KINDS.filter((k) => difficulty >= k.minDifficulty);
  const totalWeight = options.reduce((sum, k) => sum + k.weight * (weights[k.key] ?? 1), 0);
  let roll = rng() * totalWeight;
  let chosen = options[0];
  for (const k of options) {
    roll -= k.weight * (weights[k.key] ?? 1);
    if (roll <= 0) {
      chosen = k;
      break;
    }
  }
  return chosen.build(rng, surface, difficulty);
}

// Coin trail: sprinkle small clusters of coins along the newly-added chain
// points, skipping loop interiors so they stay reachable and visible.
export function placeCoins(track, fromChain, fromArc, rng = Math.random) {
  const coins = [];
  for (let ci = fromChain; ci < track.chains.length; ci++) {
    const chain = track.chains[ci];
    const startArc = ci === fromChain ? fromArc : 0;
    const inLoop = (arc) =>
      track.loopRegions.some((r) => r.chainIndex === ci && arc >= r.sStart && arc <= r.sEnd);

    const step = 55;
    let sinceGroup = 0;
    let groupLeft = 0;
    for (let s = startArc; s < chain[chain.length - 1].arc; s += step) {
      if (inLoop(s)) continue;
      sinceGroup += step;
      if (groupLeft <= 0) {
        if (sinceGroup > 220 + rng() * 200) {
          groupLeft = 3 + Math.floor(rng() * 3);
          sinceGroup = 0;
        } else {
          continue;
        }
      }
      groupLeft--;
      const pt = pointNear(chain, s);
      if (!pt) continue;
      coins.push({ x: pt.x + pt.nx * 26, y: pt.y + pt.ny * 26, taken: false });
    }
  }
  return coins;
}

function pointNear(chain, s) {
  let lo = 0;
  let hi = chain.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (chain[mid].arc <= s) lo = mid;
    else hi = mid;
  }
  const p0 = chain[lo];
  const p1 = chain[hi];
  const t = p1.arc > p0.arc ? (s - p0.arc) / (p1.arc - p0.arc) : 0;
  const x = p0.x + (p1.x - p0.x) * t;
  const y = p0.y + (p1.y - p0.y) * t;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy) || 1;
  // Same convention as the car's "up off the surface" normal (car.js/render.js).
  return { x, y, nx: dy / len, ny: -dx / len };
}
