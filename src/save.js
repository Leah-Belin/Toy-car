const KEY = 'toycar-save-v2';

function defaults() {
  return {
    coins: 0,
    unlockedCars: ['red-racer'],
    selectedCar: 'red-racer',
    // trackId -> { bestMeters }
    trackProgress: {},
    // carId -> { speed, grip, handling } upgrade levels (0-5 each)
    carUpgrades: {},
    muted: false,
  };
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    const parsed = JSON.parse(raw);
    return { ...defaults(), ...parsed };
  } catch {
    return defaults();
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable (private mode, quota) -- progress just won't persist.
  }
}

export const Save = {
  get() {
    return state;
  },
  addCoins(n) {
    state.coins += n;
    persist();
  },
  spendCoins(n) {
    if (state.coins < n) return false;
    state.coins -= n;
    persist();
    return true;
  },
  unlockCar(id) {
    if (!state.unlockedCars.includes(id)) state.unlockedCars.push(id);
    persist();
  },
  isUnlocked(id) {
    return state.unlockedCars.includes(id);
  },
  selectCar(id) {
    state.selectedCar = id;
    persist();
  },
  // Returns true if this run set a new personal best.
  recordDistance(trackId, meters) {
    const prev = state.trackProgress[trackId];
    const isNewBest = !prev || meters > prev.bestMeters;
    state.trackProgress[trackId] = { bestMeters: isNewBest ? meters : prev.bestMeters };
    persist();
    return isNewBest;
  },
  progressFor(trackId) {
    return state.trackProgress[trackId] || null;
  },
  upgradesFor(carId) {
    return state.carUpgrades[carId] || { speed: 0, grip: 0, handling: 0 };
  },
  upgradeLevel(carId, stat) {
    return (state.carUpgrades[carId] && state.carUpgrades[carId][stat]) || 0;
  },
  bumpUpgrade(carId, stat) {
    if (!state.carUpgrades[carId]) state.carUpgrades[carId] = { speed: 0, grip: 0, handling: 0 };
    state.carUpgrades[carId][stat] = (state.carUpgrades[carId][stat] || 0) + 1;
    persist();
  },
  setMuted(m) {
    state.muted = m;
    persist();
  },
  reset() {
    state = defaults();
    persist();
  },
};
