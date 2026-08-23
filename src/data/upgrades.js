// Per-car upgrade shop: three stats (Speed, Grip, Handling), five levels
// each, purchased with coins earned from runs. Levels apply as multipliers
// on top of a car's base stats -- see applyUpgrades().

export const UPGRADE_STATS = ['speed', 'grip', 'handling'];
export const MAX_LEVEL = 5;
export const LEVEL_COSTS = [60, 110, 180, 280, 420]; // cost to buy level i+1

export function costForNextLevel(currentLevel) {
  if (currentLevel >= MAX_LEVEL) return null;
  return LEVEL_COSTS[currentLevel];
}

// Returns a new stats object with upgrade multipliers baked in -- the base
// CARS entry is never mutated.
export function applyUpgrades(baseStats, levels) {
  const speed = levels.speed || 0;
  const grip = levels.grip || 0;
  const handling = levels.handling || 0;
  return {
    ...baseStats,
    enginePower: baseStats.enginePower * (1 + 0.07 * speed),
    drag: baseStats.drag * (1 - 0.03 * speed),
    gripAsphalt: baseStats.gripAsphalt * (1 + 0.05 * grip),
    gripDirt: baseStats.gripDirt * (1 + 0.05 * grip),
    gripGrass: baseStats.gripGrass * (1 + 0.05 * grip),
    gripIce: baseStats.gripIce * (1 + 0.05 * grip),
    jumpPower: baseStats.jumpPower * (1 + 0.04 * handling),
    airControl: baseStats.airControl * (1 + 0.08 * handling),
  };
}
