import { clamp } from './vec2.js';
import { castRay, pointAtS } from './track.js';

const GRAVITY = 1600; // px/s^2

// A car rides the track's arc-length coordinate `s` like a real Hot Wheels
// car rides a track groove ("rail" mode) -- this guarantees it always
// follows curves and loops correctly, with no risk of flying off tangent to
// a curve the way a free rigid body under raycast suspension can. It only
// leaves the rail for genuine 2D projectile motion ("air" mode) in two
// situations: driving off the end of a chain (a 'gap' segment), or losing
// contact inside a loop by real centripetal-force physics (see
// _stepRail's loop check). Landing sweeps a ray back onto the track and
// snaps back into rail mode.
export class Car {
  constructor(stats) {
    this.stats = stats;
    this.reset(0, 0, 0);
  }

  reset(x, y, angle = 0) {
    this.mode = 'air';
    this.pos = { x, y };
    this.vel = { x: 0, y: 0 };
    this.angle = angle;
    this.angVel = 0;
    this.chainIndex = 0;
    this.s = 0;
    this.speed = 0;
    this.progressX = x;
    this.finished = false;
    this.boostTimer = 0;
    this.grounded = false;
  }

  // Snap directly onto the rail at a given chain/arc-length -- used for race
  // starts and checkpoint respawns.
  placeOnTrack(track, chainIndex, s, speed = 0) {
    const chain = track.chains[chainIndex];
    const pt = pointAtS(chain, s);
    this.mode = 'rail';
    this.chainIndex = chainIndex;
    this.s = s;
    this.speed = speed;
    this.pos = { x: pt.x, y: pt.y };
    this.angle = Math.atan2(pt.tangent.y, pt.tangent.x);
    this.angVel = 0;
    this.vel = { x: pt.tangent.x * speed, y: pt.tangent.y * speed };
    this.grounded = true;
    if (this.pos.x > this.progressX) this.progressX = this.pos.x;
  }

  isGrounded() {
    return this.grounded;
  }

  step(dt, track, input) {
    if (this.mode === 'rail') this._stepRail(dt, track, input);
    else this._stepAir(dt, track, input);

    if (this.pos.x > this.progressX) this.progressX = this.pos.x;
    if (this.boostTimer > 0) this.boostTimer -= dt;
    if (!this.finished && this.progressX >= track.finishX) this.finished = true;
  }

  applyBoost(seconds) {
    this.boostTimer = Math.max(this.boostTimer, seconds);
  }

  _stepRail(dt, track, input) {
    const st = this.stats;
    const chain = track.chains[this.chainIndex];
    const pt = pointAtS(chain, this.s);
    const tangent = pt.tangent;

    if (pt.surface === 'boost') this.applyBoost(0.8);

    const gAlong = GRAVITY * tangent.y; // gravity=(0,GRAVITY) . tangent
    const grip = gripForSurface(st, pt.surface);
    const maxTraction = grip * GRAVITY; // accel units, normal force ~= m*g
    const boostMul = this.boostTimer > 0 ? st.boostMultiplier : 1;
    const driveAccel = clamp((input.throttle * st.enginePower) / st.mass, -maxTraction, maxTraction) * boostMul;
    const dragAccel = (-Math.sign(this.speed) * st.drag * this.speed * this.speed) / st.mass;

    this.speed += (gAlong + driveAccel + dragAccel) * dt;

    // Minimum-loop-speed check: on the upper half of a loop the track can
    // only push, not pull, so if v^2/r + g*cos(phi) goes negative the car
    // physically cannot stay on the curve and launches into the air.
    const loop = findLoopRegion(track, this.chainIndex, this.s);
    if (loop) {
      const cosPhi = (pt.y - loop.centerY) / loop.radius;
      const normalForce = (this.speed * this.speed) / loop.radius + GRAVITY * cosPhi;
      if (normalForce < 0) {
        this._launch(tangent, this.speed);
        return;
      }
    }

    this.s += this.speed * dt;
    const chainLen = chain[chain.length - 1].arc;

    if (this.s >= chainLen) {
      const exitPt = pointAtS(chain, chainLen);
      this.pos = { x: exitPt.x, y: exitPt.y };
      this._launch(exitPt.tangent, this.speed);
      return;
    }
    if (this.s <= 0 && this.speed < 0) {
      const exitPt = pointAtS(chain, 0);
      this.pos = { x: exitPt.x, y: exitPt.y };
      this._launch(exitPt.tangent, this.speed);
      return;
    }

    const np = pointAtS(chain, this.s);
    this.pos = { x: np.x, y: np.y };
    this.vel = { x: np.tangent.x * this.speed, y: np.tangent.y * this.speed };
    this.angle = Math.atan2(np.tangent.y, np.tangent.x);
    this.angVel = 0;
    this.grounded = true;
  }

  _launch(tangent, speed) {
    this.mode = 'air';
    // Real projectile motion is mass-independent, so without a per-car
    // launch boost every car would jump identically -- jumpPower is the
    // arcade stand-in for "this car's suspension springs it further."
    const launchSpeed = speed * this.stats.jumpPower;
    this.vel = { x: tangent.x * launchSpeed, y: tangent.y * launchSpeed };
    this.angle = Math.atan2(tangent.y, tangent.x);
    this.grounded = false;
  }

  _stepAir(dt, track, input) {
    const st = this.stats;
    const prevPos = { x: this.pos.x, y: this.pos.y };

    this.vel.y += GRAVITY * dt;
    this.pos = { x: this.pos.x + this.vel.x * dt, y: this.pos.y + this.vel.y * dt };
    this.angVel += input.airTilt * st.airControl * dt;
    this.angVel *= 0.98;
    this.angle += this.angVel * dt;
    this.grounded = false;

    const dx = this.pos.x - prevPos.x;
    const dy = this.pos.y - prevPos.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-6) return;

    const dir = { x: dx / dist, y: dy / dist };
    const hit = castRay(track, prevPos, dir, dist);
    if (!hit) return;
    // Only land if actually moving into the surface (not skimming past it
    // from the wrong side, which the bounding-box scan can occasionally hand
    // us near a chain seam).
    if (hit.normal.x * this.vel.x + hit.normal.y * this.vel.y >= 0) return;

    this.mode = 'rail';
    this.chainIndex = hit.chainIndex;
    this.s = hit.s;
    const chainPt = pointAtS(track.chains[hit.chainIndex], hit.s);
    this.pos = { x: chainPt.x, y: chainPt.y };
    this.speed = this.vel.x * chainPt.tangent.x + this.vel.y * chainPt.tangent.y;
    this.angle = Math.atan2(chainPt.tangent.y, chainPt.tangent.x);
    this.angVel = 0;
    this.grounded = true;
  }
}

function findLoopRegion(track, chainIndex, s) {
  for (const region of track.loopRegions) {
    if (region.chainIndex === chainIndex && s >= region.sStart && s <= region.sEnd) return region;
  }
  return null;
}

function gripForSurface(stats, surface) {
  switch (surface) {
    case 'dirt':
      return stats.gripDirt;
    case 'grass':
      return stats.gripGrass;
    case 'ice':
      return stats.gripIce;
    case 'boost':
    case 'asphalt':
    default:
      return stats.gripAsphalt;
  }
}
