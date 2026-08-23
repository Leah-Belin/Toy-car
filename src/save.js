const KEY = 'toycar-save-v1';

function defaults() {
  return {
    coins: 0,
    unlockedCars: ['red-racer'],
    selectedCar: 'red-racer',
    // trackId -> { bestTime, stars }
    trackProgress: {},
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
  recordResult(trackId, timeSeconds, stars) {
    const prev = state.trackProgress[trackId];
    const best = prev && prev.bestTime < timeSeconds ? prev.bestTime : timeSeconds;
    const bestStars = prev ? Math.max(prev.stars, stars) : stars;
    state.trackProgress[trackId] = { bestTime: best, stars: bestStars };
    persist();
  },
  progressFor(trackId) {
    return state.trackProgress[trackId] || null;
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
