import { Car } from './car.js';
import { extendTrack } from './track.js';
import { generateChunk, placeCoins } from './data/endless.js';
import { CARS, getCar } from './data/cars.js';
import { TRACKS, getTrack } from './data/tracks.js';
import { UPGRADE_STATS, MAX_LEVEL, costForNextLevel, applyUpgrades } from './data/upgrades.js';
import { Save } from './save.js';
import { Input } from './input.js';
import { Camera, drawBackground, drawTrack, drawCar, drawCoins, Particles } from './render.js';

const PX_PER_METER = 15;
const EXTEND_MARGIN = 1600;
const FALL_MARGIN = 500;
const COIN_RADIUS = 30;

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
const hudDistance = document.getElementById('hud-distance');
const hudPb = document.getElementById('hud-pb');
const hudCoins = document.getElementById('hud-coins');
const hudToast = document.getElementById('hud-toast');

let state = 'menu';
let raceTrack = null;
let raceCar = null;
let raceCoins = [];
let runCoinsCollected = 0;
let bestMetersAtStart = 0;
let milestoneAnnounced = false;
let bestAnnounced = false;
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

const STAT_LABELS = { speed: 'Speed', grip: 'Grip', handling: 'Handling' };

function upgradeRow(carId, stat, coins) {
  const level = Save.upgradeLevel(carId, stat);
  const cost = costForNextLevel(level);
  const dots = Array.from({ length: MAX_LEVEL }, (_, i) => `<div class="upgrade-dot${i < level ? ' filled' : ''}"></div>`).join('');
  const buyLabel = cost === null ? 'MAX' : `🪙${cost}`;
  const disabled = cost === null || coins < cost ? 'disabled' : '';
  return `
    <div class="upgrade-row" data-stat="${stat}">
      <span class="upgrade-label">${STAT_LABELS[stat]}</span>
      <div class="upgrade-dots">${dots}</div>
      <button class="upgrade-buy" data-car="${carId}" data-stat="${stat}" ${disabled}>${buyLabel}</button>
    </div>`;
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
    const body = unlocked
      ? UPGRADE_STATS.map((stat) => upgradeRow(car.id, stat, save.coins)).join('')
      : `${statBar('Speed', car.rating.speed)}${statBar('Accel', car.rating.accel)}${statBar('Grip', car.rating.grip)}${statBar('Jump', car.rating.jump)}`;
    card.innerHTML = `
      <span class="category-badge">${car.category || ''}</span>
      <div class="card-swatch" style="background:${car.color}"></div>
      <div class="card-name">${car.name}</div>
      <div class="card-tagline">${car.tagline}</div>
      ${body}
      <div class="card-price">${unlocked ? (selected ? 'Selected ✓' : 'Select') : `Unlock 🪙 ${car.price}`}</div>
    `;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.upgrade-buy')) return; // handled below
      if (unlocked) {
        Save.selectCar(car.id);
        buildCarGrid();
      } else if (Save.spendCoins(car.price)) {
        Save.unlockCar(car.id);
        Save.selectCar(car.id);
        refreshCoinDisplays();
        buildCarGrid();
      } else {
        flashToastOnGrid(card, 'Not enough coins!');
      }
    });
    for (const btn of card.querySelectorAll('.upgrade-buy')) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const stat = btn.dataset.stat;
        const level = Save.upgradeLevel(car.id, stat);
        const cost = costForNextLevel(level);
        if (cost === null || !Save.spendCoins(cost)) return;
        Save.bumpUpgrade(car.id, stat);
        refreshCoinDisplays();
        buildCarGrid();
      });
    }
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
  const req = getTrack(track.unlockRequires);
  const progress = Save.progressFor(track.unlockRequires);
  return !!progress && progress.bestMeters >= (req.milestoneMeters || 0);
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
    const bestLine = progress
      ? `Best: ${progress.bestMeters.toFixed(0)}m`
      : unlocked
        ? 'Not raced yet'
        : 'Locked';
    const goalLine = unlocked
      ? `Reach ${track.milestoneMeters}m to unlock next`
      : `Reach ${track.milestoneMeters}m on ${getTrack(track.unlockRequires)?.name || 'previous track'}`;
    card.innerHTML = `
      <div class="card-swatch" style="background:linear-gradient(135deg,#8fd9a8,#4ec8f2)"></div>
      <div class="card-name">${track.name}</div>
      <div class="card-tagline">${track.tagline}</div>
      <div class="diff-dots">${dots}</div>
      <div class="track-stars">${unlocked ? '' : '🔒 '}${bestLine}</div>
      <div class="track-best">${goalLine}</div>
    `;
    card.addEventListener('click', () => {
      if (!unlocked) return;
      startRace(track.id);
    });
    list.appendChild(card);
  }
}

// ---------------------------------------------------------------------------
// Race
// ---------------------------------------------------------------------------
function startRace(trackId) {
  raceTrack = getTrack(trackId);
  const baseStats = getCar(Save.get().selectedCar) || CARS[0];
  const raceStats = applyUpgrades(baseStats, Save.upgradesFor(baseStats.id));
  raceCar = new Car(raceStats);
  raceCar.placeOnTrack(raceTrack, 0, 0, 60);
  raceCoins = placeCoins(raceTrack, 0, 0);
  runCoinsCollected = 0;
  bestMetersAtStart = Save.progressFor(trackId)?.bestMeters || 0;
  milestoneAnnounced = false;
  bestAnnounced = false;
  particles.items.length = 0;
  camera.x = raceCar.pos.x;
  camera.y = raceCar.pos.y;
  setState('race');
}

function showToast(msg) {
  hudToast.textContent = msg;
  hudToast.classList.add('show');
  toastTimer = 1.8;
}

function endRun() {
  particles.spawnDust(raceCar.pos.x, raceCar.pos.y, '#e8433a', 10);
  const meters = Math.max(0, (raceCar.progressX - raceTrack.startX) / PX_PER_METER);
  const isNewBest = Save.recordDistance(raceTrack.id, meters);
  const bestNow = Math.max(meters, bestMetersAtStart);
  const milestone = raceTrack.milestoneMeters || Infinity;
  const newlyUnlocked = bestNow >= milestone && bestMetersAtStart < milestone;

  document.getElementById('results-title').textContent = isNewBest ? 'New Personal Best!' : 'Run Over!';
  document.getElementById('results-distance').textContent = `${meters.toFixed(0)}m`;
  document.getElementById('results-pb').textContent = `Best: ${bestNow.toFixed(0)}m`;
  document.getElementById('results-coins').textContent = `+${runCoinsCollected} 🪙`;
  document.getElementById('results-unlock').classList.toggle('hidden', !newlyUnlocked);
  setState('results');
}

document.getElementById('btn-pause').addEventListener('click', () => setState('pause'));
document.getElementById('btn-resume').addEventListener('click', () => setState('race'));
document.getElementById('btn-restart').addEventListener('click', () => startRace(raceTrack.id));
document.getElementById('btn-pause-menu').addEventListener('click', () => setState('menu'));
document.getElementById('btn-retry').addEventListener('click', () => startRace(raceTrack.id));
document.getElementById('btn-change-track').addEventListener('click', () => {
  buildTrackList();
  setState('select');
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

    collectCoins();

    const metersNow = (raceCar.progressX - raceTrack.startX) / PX_PER_METER;
    if (!milestoneAnnounced && metersNow >= (raceTrack.milestoneMeters || Infinity)) {
      milestoneAnnounced = true;
      showToast('🔓 Next track unlocked!');
    }
    if (!bestAnnounced && bestMetersAtStart > 0 && metersNow >= bestMetersAtStart) {
      bestAnnounced = true;
      showToast('🏆 New personal best!');
    }

    if (raceCar.progressX > raceTrack.finishX - EXTEND_MARGIN) {
      extendRaceTrack();
    }

    if (raceCar.pos.y > raceTrack.bounds.maxY + FALL_MARGIN) {
      endRun();
      return;
    }
  }
}

function extendRaceTrack() {
  const fromChain = raceTrack.chains.length - 1;
  const fromArc = raceTrack.chains[fromChain][raceTrack.chains[fromChain].length - 1].arc;
  const chunk = generateChunk(raceTrack.endlessSurface, raceTrack.finishX, raceTrack.chunkWeights);
  const extended = extendTrack(raceTrack, chunk);
  const newCoins = placeCoins(extended, fromChain, fromArc);
  raceTrack = extended;
  raceCoins.push(...newCoins);
}

function collectCoins() {
  for (const coin of raceCoins) {
    if (coin.taken) continue;
    const dx = coin.x - raceCar.pos.x;
    const dy = coin.y - raceCar.pos.y;
    if (dx * dx + dy * dy < COIN_RADIUS * COIN_RADIUS) {
      coin.taken = true;
      runCoinsCollected++;
      Save.addCoins(1);
    }
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
  drawCoins(ctx, camera, canvasW, canvasH, raceCoins);
  particles.update(dt);
  particles.draw(ctx, camera, canvasW, canvasH);
  drawCar(ctx, camera, canvasW, canvasH, raceCar);

  const metersNow = Math.max(0, (raceCar.progressX - raceTrack.startX) / PX_PER_METER);
  hudDistance.textContent = `${metersNow.toFixed(0)}m`;
  hudPb.textContent = `PB ${Math.max(bestMetersAtStart, metersNow).toFixed(0)}m`;
  hudCoins.textContent = `🪙 ${Save.get().coins}`;
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
