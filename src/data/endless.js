// Coin placement for a fixed, hand-authored track: a deterministic trail of
// small coin clusters along the chain, skipping loop interiors so they stay
// reachable and visible. No randomness -- coins land in the exact same spot
// every run, same as the track itself.
const GROUP_SPACING = 320;
const GROUP_SIZE = 4;
const COIN_STEP = 30;

export function placeCoins(track, fromChain = 0, fromArc = 0) {
  const coins = [];
  for (let ci = fromChain; ci < track.chains.length; ci++) {
    const chain = track.chains[ci];
    const startArc = ci === fromChain ? fromArc : 0;
    const inLoop = (arc) =>
      track.loopRegions.some((r) => r.chainIndex === ci && arc >= r.sStart && arc <= r.sEnd);

    const chainLen = chain[chain.length - 1].arc;
    for (let groupStart = startArc + GROUP_SPACING / 2; groupStart < chainLen; groupStart += GROUP_SPACING) {
      for (let i = 0; i < GROUP_SIZE; i++) {
        const s = groupStart + i * COIN_STEP;
        if (s >= chainLen || inLoop(s)) continue;
        const pt = pointNear(chain, s);
        if (!pt) continue;
        coins.push({ x: pt.x + pt.nx * 26, y: pt.y + pt.ny * 26, taken: false });
      }
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
