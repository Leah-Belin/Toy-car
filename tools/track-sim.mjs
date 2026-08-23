import { Car } from '../src/car.js';
import { CARS, getCar } from '../src/data/cars.js';
import { TRACKS } from '../src/data/tracks.js';

function autopilotInput(car) {
  // Full throttle, with a simple proportional leveling controller while airborne.
  let angle = car.angle % (Math.PI * 2);
  if (angle > Math.PI) angle -= Math.PI * 2;
  if (angle < -Math.PI) angle += Math.PI * 2;
  const airTilt = car.isGrounded() ? 0 : Math.max(-1, Math.min(1, -angle * 1.5));
  return { throttle: 1, airTilt };
}

function simulateTrack(track, carStats, maxSeconds = 40) {
  const car = new Car(carStats);
  car.reset(track.startX + 90, track.startY - 60, 0);
  const dt = 1 / 120;
  const steps = Math.round(maxSeconds / dt);
  const fallY = track.bounds.maxY + 500;
  let respawns = 0;
  let lastProgress = car.progressX;
  let stuckTimer = 0;

  for (let i = 0; i < steps; i++) {
    car.step(dt, track, autopilotInput(car));
    if (!Number.isFinite(car.pos.x) || !Number.isFinite(car.pos.y)) {
      return { ok: false, reason: 'NaN', time: i * dt };
    }
    if (car.pos.y > fallY) {
      respawns++;
      if (respawns > 30) return { ok: false, reason: 'too many falls', time: i * dt };
      // crude respawn: back to start of current chain area (just restart run for the sim)
      car.reset(track.startX + 90, track.startY - 60, 0);
      car.progressX = lastProgress; // keep displayed progress from resetting the stuck check
    }
    if (car.finished) {
      return { ok: true, time: i * dt, respawns };
    }
    if (i % 240 === 0) {
      if (car.progressX <= lastProgress + 5) {
        stuckTimer += 2;
        if (stuckTimer > 10) return { ok: false, reason: 'stuck', time: i * dt, x: car.pos.x };
      } else {
        stuckTimer = 0;
      }
      lastProgress = car.progressX;
    }
  }
  return { ok: false, reason: 'timeout', time: maxSeconds, x: car.pos.x, finishX: track.finishX };
}

for (const track of TRACKS) {
  console.log(`\n=== ${track.name} (finishX=${track.finishX.toFixed(0)}) ===`);
  for (const carId of ['red-racer', 'dune-digger', 'sky-jumper', 'muscle-bomber']) {
    const stats = getCar(carId);
    const result = simulateTrack(track, stats);
    console.log(
      `  ${stats.name.padEnd(14)} ok=${result.ok} time=${result.time.toFixed(2)}s ${
        result.reason ? 'reason=' + result.reason : ''
      } respawns=${result.respawns ?? 0}`
    );
  }
}
