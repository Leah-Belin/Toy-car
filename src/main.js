import { Car } from './car.js';
import { checkpointFor } from './track.js';
import { CARS, getCar } from './data/cars.js';
import { TRACKS, getTrack } from './data/tracks.js';
import { Save } from './save.js';
import { Input } from './input.js';
import { Camera, drawBackground, drawTrack, drawCar, Particles } from './render.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let canvasW = 0;
let canvasH = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvasW = window.innerWidth;
  canvasH = window.innerHeight;
  canvas.width = Math.round(canvasW * dpr);
  canvas.height = Math.round(canvasH * dpr);
  canvas.style.width = canvasW + 'px';
  canvas.style.height = canvasH + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

const input = new Input();
const camera = new Camera();
const particles = new Particles();

const screens = {
  menu: document.getElementById('screen-menu'),
  garage: document.getElementById('screen-garage'),
  select: document.getElementById('screen-select'),
  pause: document.getElementById('screen-pause'),
  results: document.getElementById('screen-results'),
};
const hud = document.getElementById('hud');
const touchControls = document.getElementById('touch-controls');
const hudTimer = document.getElementById('hud-timer');
const hudToast = document.getElementById('hud-toast');

let state = 'menu';
let raceTrack = null;
let raceCar = null;
let raceStats = null;
let elapsed = 0;
let penaltySeconds = 0;
let finishedResult = null;
let toastTimer = 0;

function showScreen(name) {
  for (const key of Object.keys(screens)) {
    screens[key].classList.toggle('hidden', key !== name);
  }
}

function setState(next) {
  state = next;
  hud.classList.toggle('hidden', next !== 'race');
  touchControls.classList.toggle('armed', next === 'race');
  // showScreen hides every known screen and shows only the one matching
  // `next` -- for next === 'race' (not a key in `screens`), everything
  // ends up hidden, leaving just the canvas + HUD, which is what we want.
  showScreen(next);
}

// ---------------------------------------------------------------------------
// Menu
// ---------------------------------------------------------------------------
function refreshCoinDisplays() {
  const coins = Save.get().coins;
  document.getElementById('coin-display').textContent = `🪙 ${coins}`;
  document.getElementById('garage-coin-display').textContent = `🪙 ${coins}`;
}

document.getElementById('btn-play').addEventListener('click', () => {
  refreshCoinDisplays();
  buildTrackList();
  setState('select');
});
document.getElementById('btn-garage').addEventListener('click', () => {
  refreshCoinDisplays();
  buildCarGrid();
  setState('garage');
});
document.getElementById('btn-reset').addEventListener('click', () => {
  if (confirm('Reset all progress and coins?')) {
    Save.reset();
    refreshCoinDisplays();
    buildCarGrid();
    buildTrackList();
  }
});
document.getElementById('btn-garage-back').addEventListener('click', () => setState('menu'));
document.getElementById('btn-select-back').addEventListener('click', () => setState('menu'));

// ---------------------------------------------------------------------------
// Garage
// ---------------------------------------------------------------------------
function statBar(label, value) {
  return `<div class="stat-row"><span>${label}</span><div class="stat-bar"><div class="stat-fill" style="width:${(value / 5) * 100}%"></div></div></div>`;
}

function buildCarGrid() {
  const grid = document.getElementById('car-grid');
  grid.innerHTML = '';
  const save = Save.get();
  for (const car of CARS) {
    const unlocked = Save.isUnlocked(car.id);
    const selected = save.selectedCar === car.id;
    const card = document.createElement('div');
    card.className = 'card' + (unlocked ? '' : ' locked') + (selected ? ' selected' : '');
    card.innerHTML = `
      <div class="card-swatch" style="background:${car.color}"></div>
      <div class="card-name">${car.name}</div>
      <div class="card-tagline">${car.tagline}</div>
      ${statBar('Speed', car.rating.speed)}
      ${statBar('Accel', car.rating.accel)}
      ${statBar('Grip', car.rating.grip)}
      ${statBar('Jump', car.rating.jump)}
      <div class="card-price">${unlocked ? (selected ? 'Selected ✓' : 'Select') : `Unlock 🪙 ${car.price}`}</div>
    `;
    card.addEventListener('click', () => {
      if (unlocked) {
        Save.selectCar(car.id);
        buildCarGrid();
      } else if (Save.spendCoins(car.price)) {
        Save.unlockCar(car.id);
        Save.selectCar(car.id);
        refreshCoinDisplays();
        buildCarGrid();
      } else {
        flashToastOnGrid(card, "Not enough coins!");
      }
    });
    grid.appendChild(card);
  }
}

function flashToastOnGrid(card, msg) {
  const prev = card.querySelector('.card-price').textContent;
  card.querySelector('.card-price').textContent = msg;
  setTimeout(() => {
    card.querySelector('.card-price').textContent = prev;
  }, 900);
}

// ---------------------------------------------------------------------------
// Track select
// ---------------------------------------------------------------------------
function isTrackUnlocked(track) {
  if (!track.unlockRequires) return true;
  return !!Save.progressFor(track.unlockRequires);
}

function buildTrackList() {
  const list = document.getElementById('track-list');
  list.innerHTML = '';
  const carId = Save.get().selectedCar;
  const car = getCar(carId) || CARS[0];
  document.getElementById('selected-car-chip').textContent = `🚗 ${car.name}`;

  for (const track of TRACKS) {
    const unlocked = isTrackUnlocked(track);
    const progress = Save.progressFor(track.id);
    const card = document.createElement('div');
    card.className = 'card' + (unlocked ? '' : ' locked');
    const dots = Array.from({ length: 5 }, (_, i) => `<span class="${i < track.difficulty ? 'on' : ''}">●</span>`).join('');
    card.innerHTML = `
      <div class="card-swatch" style="background:linear-gradient(135deg,#8fd9a8,#4ec8f2)"></div>
      <div class="card-name">${track.name}</div>
      <div class="card-tagline">${track.tagline}</div>
      <div class="diff-dots">${dots}</div>
      <div class="track-stars">${progress ? starString(progress.stars) : (unlocked ? '☆☆☆' : '🔒 Locked')}</div>
      <div class="track-best">${progress ? `Best: ${progress.bestTime.toFixed(2)}s` : (unlocked ? 'Not raced yet' : `Clear previous track first`)}</div>
    `;
    card.addEventListener('click', () => {
      if (!unlocked) return;
      startRace(track.id);
    });
    list.appendChild(card);
  }
}

function starString(n) {
  return '★'.repeat(n) + '☆'.repeat(3 - n);
}

// ---------------------------------------------------------------------------
// Race
// ---------------------------------------------------------------------------
function startRace(trackId) {
  raceTrack = getTrack(trackId);
  raceStats = getCar(Save.get().selectedCar) || CARS[0];
  raceCar = new Car(raceStats);
  const start = raceTrack.checkpoints[0];
  raceCar.placeOnTrack(raceTrack, start.chainIndex, start.s, 40);
  elapsed = 0;
  penaltySeconds = 0;
  finishedResult = null;
  particles.items.length = 0;
  camera.x = raceCar.pos.x;
  camera.y = raceCar.pos.y;
  setState('race');
}

function showToast(msg) {
  hudToast.textContent = msg;
  hudToast.classList.add('show');
  toastTimer = 1.6;
}

function respawnAtCheckpoint() {
  const cp = checkpointFor(raceTrack, raceCar.progressX);
  raceCar.placeOnTrack(raceTrack, cp.chainIndex, cp.s, 40);
  penaltySeconds += 3;
  showToast('Ouch! +3s penalty');
}

function computeStars(track, time) {
  if (time <= track.parTimes.gold) return 3;
  if (time <= track.parTimes.silver) return 2;
  if (time <= track.parTimes.bronze) return 1;
  return 0;
}

function finishRace() {
  const finalTime = elapsed + penaltySeconds;
  const stars = computeStars(raceTrack, finalTime);
  const coinRewards = [4, 10, 18, 28];
  const coins = coinRewards[stars];
  Save.addCoins(coins);
  Save.recordResult(raceTrack.id, finalTime, stars);
  finishedResult = { time: finalTime, stars, coins };

  document.getElementById('results-time').textContent = `${finalTime.toFixed(2)}s`;
  document.getElementById('results-stars').textContent = starString(stars);
  document.getElementById('results-coins').textContent = `+${coins} 🪙`;
  const nextBtn = document.getElementById('btn-next-track');
  const idx = TRACKS.findIndex((t) => t.id === raceTrack.id);
  const next = TRACKS[idx + 1];
  nextBtn.style.display = next ? '' : 'none';
  setState('results');
}

document.getElementById('btn-pause').addEventListener('click', () => setState('pause'));
document.getElementById('btn-resume').addEventListener('click', () => setState('race'));
document.getElementById('btn-restart').addEventListener('click', () => startRace(raceTrack.id));
document.getElementById('btn-pause-menu').addEventListener('click', () => setState('menu'));
document.getElementById('btn-retry').addEventListener('click', () => startRace(raceTrack.id));
document.getElementById('btn-next-track').addEventListener('click', () => {
  const idx = TRACKS.findIndex((t) => t.id === raceTrack.id);
  const next = TRACKS[idx + 1];
  if (next) startRace(next.id);
});
document.getElementById('btn-results-menu').addEventListener('click', () => setState('menu'));

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (state === 'race') setState('pause');
    else if (state === 'pause') setState('race');
  }
});

// Touch controls
input.bindTouchButton(
  document.getElementById('touch-gas'),
  () => (input.touchGas = true),
  () => (input.touchGas = false)
);
input.bindTouchButton(
  document.getElementById('touch-brake'),
  () => (input.touchBrake = true),
  () => (input.touchBrake = false)
);
input.bindTouchButton(
  document.getElementById('touch-tilt-up'),
  () => (input.touchTiltDir = -1),
  () => (input.touchTiltDir = input.touchTiltDir === -1 ? 0 : input.touchTiltDir)
);
input.bindTouchButton(
  document.getElementById('touch-tilt-down'),
  () => (input.touchTiltDir = 1),
  () => (input.touchTiltDir = input.touchTiltDir === 1 ? 0 : input.touchTiltDir)
);

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
const PHYSICS_DT = 1 / 120;
let accumulator = 0;
let lastTime = performance.now();

function stepRace(dt) {
  elapsed += dt;
  accumulator += dt;
  let steps = 0;
  while (accumulator >= PHYSICS_DT && steps < 8) {
    raceCar.step(PHYSICS_DT, raceTrack, input.read());
    accumulator -= PHYSICS_DT;
    steps++;

    if (raceCar.isGrounded()) {
      const surface = surfaceAt(raceCar);
      if ((surface === 'dirt' || surface === 'grass') && Math.random() < 0.3) {
        particles.spawnDust(raceCar.pos.x, raceCar.pos.y + 10, surface === 'dirt' ? '#a9713c' : '#5cb84f', 1);
      }
    }

    if (raceCar.pos.y > raceTrack.bounds.maxY + 500) {
      respawnAtCheckpoint();
    }
  }

  if (raceCar.finished && !finishedResult) {
    finishRace();
  }
}

function surfaceAt(car) {
  const chain = raceTrack.chains[car.chainIndex];
  if (!chain) return null;
  let closest = chain[0];
  let bestD = Infinity;
  for (const p of chain) {
    const d = Math.abs(p.arc - car.s);
    if (d < bestD) {
      bestD = d;
      closest = p;
    }
  }
  return closest.surface;
}

function render(dt) {
  ctx.clearRect(0, 0, canvasW, canvasH);
  if (state !== 'race' && state !== 'pause') return;
  const theme = raceTrack ? raceTrack.theme : 'day';
  drawBackground(ctx, camera, canvasW, canvasH, theme);
  drawTrack(ctx, camera, canvasW, canvasH, raceTrack);
  particles.update(dt);
  particles.draw(ctx, camera, canvasW, canvasH);
  drawCar(ctx, camera, canvasW, canvasH, raceCar);

  hudTimer.textContent = (elapsed + penaltySeconds).toFixed(2);
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) hudToast.classList.remove('show');
  }
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (state === 'race') {
    stepRace(dt);
    camera.update({ x: raceCar.pos.x, y: raceCar.pos.y, vx: raceCar.vel.x }, dt, canvasW, canvasH);
  }
  render(dt);
  requestAnimationFrame(frame);
}

refreshCoinDisplays();
setState('menu');
requestAnimationFrame(frame);
