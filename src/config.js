// Tuning constants + the terrain height field everything else agrees on.

export const R_VILLAGE = 11;   // dry land / auto-bank radius
export const R_SHORE = 14;     // where the seabed starts sloping
export const R_MAX = 46;       // outer edge of walkable seabed
export const R_OCEAN = 260;    // visual ocean plane radius
export const MAX_DEPTH = 8.5;  // seabed depth at R_MAX
export const LAND_Y = 0.9;     // village plateau height

export const TIDE_OUT = R_MAX + 4;    // waterline radius at full ebb
export const TIDE_IN = R_VILLAGE + 1.5; // waterline radius at full flood

/** Monotonically decreasing seabed height. r -> y */
export function terrainHeight(r) {
  if (r <= R_VILLAGE) return LAND_Y;
  if (r >= R_MAX) return -MAX_DEPTH - (r - R_MAX) * 0.35;
  const t = (r - R_VILLAGE) / (R_MAX - R_VILLAGE);
  return LAND_Y - (LAND_Y + MAX_DEPTH) * Math.pow(t, 1.35);
}

export const PLAYER = {
  scale: 1.75,
  speed: 11.5,
  accel: 62,
  turn: 13,
  dashSpeed: 30,
  dashTime: 0.19,
  dashCd: 1.25,
  pickupRadius: 1.9,
  baseCapacity: 8,
  struggleBase: 3.4,   // seconds you can survive fully submerged
  throwBase: 9,        // tiles at zero charge
  throwCharge: 9,      // extra tiles at full charge
  chargeTime: 0.62,
};

/**
 * weight -> speed multiplier. Greed is literally slow.
 * Absolute weight, not weight/capacity: a bigger sack must cost speed too,
 * otherwise upgrading capacity cancels the whole point of the mechanic.
 */
export function loadPenalty(weight) {
  return 1 / (1 + weight / 9);
}

/**
 * `ring` is the faint disc every piece of loot sits on: [colour, radius, opacity].
 * It marks what is pickable (the village is full of identical decorative crates)
 * and its colour climbs the value ladder, so you can read worth at a glance
 * without a label cluttering the screen.
 */
export const LOOT = {
  coin:   { model: 'coin',        w: 1, v: 3,   s: 0.028, y: 0.22, label: '금화',      band: [0, 0.34], spin: 3.4,
            ring: [0xfff4d6, 0.62, 0.34] },
  crate:  { model: 'crate',       w: 2, v: 10,  s: 0.062, y: 0.00, label: '나무 상자',  band: [0.10, 0.55],
            ring: [0x8fe8b8, 0.82, 0.40] },
  barrel: { model: 'barrel',      w: 3, v: 18,  s: 0.048, y: 0.32, label: '럼 통',      band: [0.24, 0.70],
            ring: [0x66d0f0, 0.95, 0.46] },
  gold:   { model: 'goldbag',     w: 4, v: 35,  s: 0.026, y: 0.00, label: '금 자루',    band: [0.42, 0.86],
            ring: [0xb894ff, 1.1, 0.52] },
  chest:  { model: 'chest',       w: 5, v: 70,  s: 0.040, y: 0.00, label: '보물상자',   band: [0.55, 0.95],
            ring: [0xff9d4d, 1.28, 0.6] },
  relic:  { model: 'mysterybag',  w: 8, v: 190, s: 0.030, y: 0.00, label: '심해 유물',  band: [0.78, 1.0],
            ring: [0xffd033, 1.5, 0.72] },
};

/** How many of each type spawn on tide n (1-based). */
export function lootPlan(n) {
  const g = Math.min(n - 1, 8);
  return {
    coin: 22 + g * 2,
    crate: 20 + g * 2,
    barrel: 14 + g,
    gold: 9 + Math.floor(g * 1.1),
    chest: 7 + g,
    relic: 3 + Math.floor(g * 0.7),
  };
}

/** Per-tide pacing. Gets meaner, floors out so it stays playable. */
export function tidePlan(n, up) {
  const ebb = Math.max(26, 42 - (n - 1) * 1.6) + (up.charts || 0) * 4;
  const flood = Math.max(10.5, 15 - (n - 1) * 0.45);
  return {
    ebb,
    flood,
    deepOnes: Math.min(7, 1 + Math.floor(n * 0.7)),
    sharks: Math.min(6, Math.floor(n * 0.6)),
  };
}

export const UPGRADES = [
  { id: 'boots',  name: '물갈퀴 부츠', desc: '이동 속도 +12%',            max: 5, cost: n => 90 + n * 85 },
  { id: 'sack',   name: '큰 자루',     desc: '적재 무게 +4',              max: 5, cost: n => 110 + n * 105 },
  { id: 'arms',   name: '강철 팔',     desc: '던지기 거리 +30%',          max: 4, cost: n => 120 + n * 110 },
  { id: 'lens',   name: '등대 렌즈',   desc: '미니맵에 보물 등급 표시',    max: 1, cost: () => 210 },
  { id: 'charts', name: '조수 예보',   desc: '썰물 시간 +4초',            max: 4, cost: n => 160 + n * 150 },
  { id: 'lungs',  name: '잠수 훈련',   desc: '물속 버티는 시간 +1.5초',    max: 3, cost: n => 130 + n * 125 },
];

export const REPAIR_COST = [180, 360, 640, 1000, 1420];

/** The ship's berth is only paid up this long. Finish the repair or lose it. */
export const MAX_TIDES = 12;

export const PALETTE = {
  sky: 0x9fd8e8,
  fogNear: 58,
  fogFar: 185,
  sunColor: 0xfff3d6,
  ambTop: 0xbfe4f2,
  ambBot: 0x6d8996,
};
