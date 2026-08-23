import { buildTrack } from '../src/track.js';
import { Car } from '../src/car.js';
import { CARS, getCar } from '../src/data/cars.js';

function simulate(track, carStats, seconds, input, log = false) {
  const car = new Car(carStats);
  car.reset(track.startX + 100, track.startY - 60, 0);
  const dt = 1 / 120;
  const steps = Math.round(seconds / dt);
  let maxSpeed = 0;
  for (let i = 0; i < steps; i++) {
    car.step(dt, track, input(i * dt, car));
    const speed = Math.hypot(car.vel.x, car.vel.y);
    if (speed > maxSpeed) maxSpeed = speed;
    if (log && i % 24 === 0) {
      console.log(
        `t=${(i * dt).toFixed(2)} x=${car.pos.x.toFixed(1)} y=${car.pos.y.toFixed(1)} ` +
          `vx=${car.vel.x.toFixed(1)} vy=${car.vel.y.toFixed(1)} ang=${car.angle.toFixed(2)} ` +
          `grounded=${car.isGrounded()}`
      );
    }
    if (!Number.isFinite(car.pos.x) || !Number.isFinite(car.pos.y)) {
      console.error('NaN/Infinity detected at t=', i * dt);
      return { car, maxSpeed, exploded: true };
    }
  }
  return { car, maxSpeed, exploded: false };
}

console.log('=== Test 1: flat straight, full throttle ===');
{
  const track = buildTrack(0, 400, [{ type: 'flat', length: 4000, surface: 'asphalt' }]);
  const { car, maxSpeed, exploded } = simulate(track, getCar('red-racer'), 6, () => ({
    throttle: 1,
    airTilt: 0,
  }), true);
  console.log('exploded:', exploded, 'final x:', car.pos.x.toFixed(1), 'maxSpeed:', maxSpeed.toFixed(1));
}

console.log('\n=== Test 2: ramp + gap jump ===');
{
  const track = buildTrack(0, 400, [
    { type: 'flat', length: 300, surface: 'asphalt' },
    { type: 'ramp', length: 90, angle: 22, surface: 'asphalt' },
    { type: 'gap', length: 220 },
    { type: 'flat', length: 400, surface: 'asphalt' },
  ]);
  const { car, exploded } = simulate(track, getCar('sky-jumper'), 5, () => ({
    throttle: 1,
    airTilt: 0,
  }), true);
  console.log('exploded:', exploded, 'final x:', car.pos.x.toFixed(1), 'fell:', car.pos.y > 900);
}

console.log('\n=== Test 3: loop-the-loop ===');
{
  const track = buildTrack(0, 400, [
    { type: 'flat', length: 250, surface: 'asphalt' },
    { type: 'loop', radius: 90, surface: 'asphalt' },
    { type: 'flat', length: 400, surface: 'asphalt' },
  ]);
  const { car, exploded } = simulate(track, getCar('loop-king'), 6, (t) => ({
    throttle: 1,
    airTilt: 0,
  }), true);
  console.log('exploded:', exploded, 'final x:', car.pos.x.toFixed(1), 'final y:', car.pos.y.toFixed(1));
}

console.log('\n=== Test 4: all cars complete a medium track ===');
{
  const track = buildTrack(0, 400, [
    { type: 'flat', length: 200, surface: 'asphalt' },
    { type: 'hill', length: 200, height: 60, surface: 'asphalt' },
    { type: 'hill', length: 200, height: -60, surface: 'asphalt' },
    { type: 'bumps', length: 300, amplitude: 14, frequency: 4, surface: 'dirt' },
    { type: 'ramp', length: 80, angle: 18, surface: 'asphalt' },
    { type: 'gap', length: 150 },
    { type: 'flat', length: 600, surface: 'asphalt' },
  ]);
  for (const stats of CARS) {
    const { car, exploded } = simulate(track, stats, 12, () => ({ throttle: 1, airTilt: 0 }));
    console.log(
      `${stats.name.padEnd(14)} exploded=${exploded} finished=${car.finished} x=${car.pos.x.toFixed(0)} y=${car.pos.y.toFixed(0)}`
    );
  }
}
