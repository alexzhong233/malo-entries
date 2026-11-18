// Tuning, palette and layout for STAR SIPHON. Fixed 1600x900 logical playfield scaled to fit.

export const FIELD = { width: 1600, height: 900, cx: 800, cy: 450 };
export const STEP = 1 / 60;

export const CORE = {
  radius: 46,
  collectRadius: 58,
  pullRadius: 180,
  pullStrength: 120,
  chargePerMote: 1,
  chargePerPhase: 10,
  maxPhase: 5,
};

export const DRONE = {
  radius: 16,
  speed: 520,
  accel: 2200,
  friction: 0.88,
  hull: 3,
  invulnerable: 1.6,
  attractRadius: 240,
  repelRadius: 210,
  attractForce: 520,
  repelForce: 620,
};

export const MOTE = {
  radius: 9,
  countBase: 9,
  countPerPhase: 2,
  maxSpeed: 235,
  drift: 18,
  friction: 0.985,
  value: 20,
  trailLength: 14,
};

export const RIFT = {
  radius: 34,
  countBase: 1,
  countPerPhase: 1,
  speedBase: 55,
  speedPerPhase: 10,
  pullRadius: 230,
  pullStrength: 260,
  turnRate: 1.2,
};

export const PARTICLE_LIMIT = 460;

export const PALETTE = {
  bg0: '#050a22',
  bg1: '#0a1035',
  bg2: '#170b38',
  bg3: '#240a3a',
  star: '#cfe8ff',
  grid: 'rgba(96, 150, 255, 0.055)',
  core: '#53fff1',
  core2: '#6a7cff',
  coreHot: '#fff3a6',
  drone: '#e8fbff',
  droneGlow: '#46d9ff',
  moteA: '#55ffd6',
  moteB: '#ffd166',
  moteC: '#7cf7ff',
  rift: '#ff4fd8',
  riftCore: '#120018',
  attract: 'rgba(85, 255, 214, 0.22)',
  repel: 'rgba(255, 209, 102, 0.20)',
  text: '#eaf6ff',
  muted: '#8fb3d9',
  danger: '#ff5d8f',
  panel: 'rgba(6, 14, 34, 0.80)',
  panelEdge: 'rgba(120, 210, 255, 0.38)',
  hudBg: 'rgba(5, 12, 30, 0.62)',
  nebulaBlue: '#1d4dff',
  nebulaTeal: '#00ffd5',
  nebulaPink: '#ff3fcf',
  nebulaViolet: '#7a3dff',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
export const BEST_KEY = 'star-siphon.best';
