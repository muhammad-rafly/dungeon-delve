// DUNGEON DELVE — configuration. Every number the sim uses lives here so tuning is one edit.
// Palette: dark dungeon stone, warm torch gold, neon accents for magic and loot.
export const VIEW = { width: 1280, height: 720 };
export const STEP = 1 / 60;
export const TILE = 40;
export const COLS = 32;
export const ROWS = 18;
export const TOTAL_FLOORS = 3;

export const FLOOR_NAMES = [
  'THE SUNKEN GATE',
  'THE DEEP HALLS',
  "THE WARDEN'S THRONE",
];

export const COLORS = {
  bg: '#0a0812',
  floorA: '#1b1626',
  floorB: '#211a30',
  floorCrack: '#14101f',
  wallTop: '#4a3f66',
  wallFace: '#2c2440',
  wallEdge: '#171226',
  torch: '#ffb347',
  torchCore: '#ffe9a8',
  crystalCyan: '#37e6ff',
  crystalMag: '#ff5ce1',
  lava: '#ff6a00',
  lavaCore: '#ffd23f',
  spike: '#9aa3b8',
  gold: '#ffd166',
  goldCore: '#fff3c4',
  potion: '#ff5c8a',
  potionCore: '#ffb3cd',
  key: '#ffe066',
  door: '#8a6d3b',
  doorGlow: '#ffd166',
  player: '#7fb2ff',
  playerCore: '#eaf3ff',
  playerTrim: '#ffd166',
  bolt: '#8ef6ff',
  boltCore: '#ffffff',
  enemyBolt: '#ff7ad9',
  slime: '#4ade80',
  slimeDark: '#166534',
  bat: '#a78bfa',
  batDark: '#4c1d95',
  skeleton: '#e5e7eb',
  skeletonDark: '#6b7280',
  mage: '#c084fc',
  mageDark: '#581c87',
  elite: '#f97316',
  boss: '#94a3b8',
  bossCore: '#ff3355',
  text: '#f1f5f9',
  dim: '#94a3b8',
  hpBar: '#ef4444',
  hpBarBg: '#1e293b',
  bossBar: '#ff3355',
};

export const PLAYER = {
  radius: 15,
  speed: 235,
  maxHp: 100,
  slashRange: 88,
  slashArc: 1.9, // radians, half-angle of the swing
  slashDamage: 14,
  slashCooldown: 0.32,
  boltDamage: 8,
  boltSpeed: 540,
  boltCooldown: 0.45,
  boltRadius: 5,
  dodgeSpeed: 560,
  dodgeTime: 0.22,
  dodgeCooldown: 1.1,
  invuln: 0.6,
  potionHeal: 45,
  potionStart: 3,
  potionMax: 4,
  magnet: 110,
};

export const ENEMIES = {
  slime: { hp: 22, speed: 72, radius: 15, damage: 8, score: 10, gold: 6, color: COLORS.slime, dark: COLORS.slimeDark },
  bat: { hp: 12, speed: 158, radius: 11, damage: 6, score: 10, gold: 4, color: COLORS.bat, dark: COLORS.batDark },
  skeleton: { hp: 34, speed: 96, radius: 14, damage: 12, score: 20, gold: 10, color: COLORS.skeleton, dark: COLORS.skeletonDark },
  mage: { hp: 26, speed: 82, radius: 14, damage: 8, score: 25, gold: 12, color: COLORS.mage, dark: COLORS.mageDark },
  elite: { hp: 110, speed: 78, radius: 22, damage: 14, score: 60, gold: 30, color: COLORS.elite, dark: '#7c2d12' },
  boss: { hp: 580, speed: 56, radius: 40, damage: 20, score: 500, gold: 100, color: COLORS.boss, dark: '#1e293b' },
};

// How many enemies each floor spawns (elite is extra, one per floor 1-2).
export const FLOOR_SPAWNS = [
  { slime: 6, bat: 4, skeleton: 0, mage: 0 },
  { slime: 5, bat: 4, skeleton: 4, mage: 2 },
  { slime: 4, bat: 3, skeleton: 5, mage: 3 },
];

export const TRAPS = {
  spikeDamage: 6,
  spikeTick: 0.5,
  lavaDamage: 10,
  lavaTick: 0.5,
  spikesPerFloor: [3, 4, 4],
  lavaPatches: [0, 1, 2],
  chestsPerFloor: [3, 3, 2],
  torchesPerRoom: 2,
};

export const PICKUPS = {
  coinMagnet: 420,
  heartHeal: 15,
  heartChance: 0.12,
  chestGoldMin: 20,
  chestGoldMax: 45,
};

export const BOSS = {
  chargeTelegraph: 0.7,
  chargeTime: 0.55,
  chargeSpeed: 430,
  burstEvery: 6.0,
  burstCount: 8,
  burstSpeed: 175,
  summonAt: 0.5, // fraction of max HP: summons 3 slimes once
};
