// Solara Bay — tuning constants, names and small shared helpers.
// Every file is a classic script; SB is the single global namespace.
(function (SB) {
  'use strict';

  SB.FIELD = { width: 1280, height: 720 };
  SB.STEP = 1 / 60;

  // City geometry: road centre lines sit on multiples of GRID.
  SB.GRID = 300;
  SB.ROAD = 76;
  SB.SIDEWALK = 24;
  SB.NODES = 6;                       // grid lines 0 .. 1500
  SB.WORLD = { minX: -240, minY: -80, maxX: 1538, maxY: 1538, waterX: -196 };

  SB.CITY_NAME = 'Solara Bay';
  SB.DISTRICTS = ['Sunset Strand', 'Palm Row', 'Vista Heights', 'Old Harbor', 'Neon Mile'];
  SB.STREETS_H = ['Harbor Way', 'Cedar Avenue', 'Sunset Boulevard', 'Palm Street', 'Coral Road', 'Bay Boulevard'];
  SB.STREETS_V = ['Ocean Boulevard', 'Marina Drive', 'Granada Avenue', 'Central Avenue', 'Dolphin Drive', 'Pier Road'];
  SB.CHARACTERS = {
    fixer: { name: 'Marisol Vega', role: 'Mission fixer' },
    marina: { name: 'Dorian Kestrel', role: 'Crooked marina owner' },
    driver: { name: 'Rico Sandoval', role: 'Wheel man' },
    rival: { name: 'Nico "Nightjar" Serrano', role: 'Rival crew leader' },
    detective: { name: 'Det. Mara Vale', role: 'Internal Affairs' },
    mayor: { name: 'Mayor Celeste Ruiz', role: 'City Hall' }
  };

  SB.PLAYER = {
    speed: 166, sprint: 244, radius: 11, maxHealth: 100,
    fireRate: 0.20, punchRate: 0.42, punchRange: 36, punchDamage: 34,
    hotwireTime: 1.05, ammo: 36, respawnX: 600, respawnY: 600
  };
  SB.CAR = {
    accel: 320, reverse: 170, maxSpeed: 268, brake: 460,
    grip: 7.6, driftGrip: 1.5, steer: 2.55, drag: 0.55,
    radius: 22, health: 200, collisionDamage: 0.04
  };
  SB.TRAFFIC = { cars: 40, peds: 30, speed: 96, fleeingSpeed: 158 };
  SB.POLICE = {
    maxCars: 8, spawnEvery: 12, sight: 560, decayTime: 15,
    arrestTime: 2.0, officerRange: 380, officerShot: 2.05,
    carDamage: 9, footDamage: 8
  };
  SB.DAY = { start: 8 * 60 + 20, minutesPerSecond: 5.5 };
  // One master gain shared by the WebAudio graph and its mute toggle, so they never disagree.
  // A little more headroom keeps stacked sirens, engines and gunfire from clipping.
  SB.AUDIO = { masterVolume: 0.28 };
  SB.SAVE_KEY = 'solara-bay.save.v1';

  SB.PALETTE = {
    asphalt: '#a98560', asphaltDark: '#977250', roadLine: '#f4ddb0',
    sand: '#e7c998', sandDark: '#d9b680', water: '#2799a1', waterDeep: '#1d7f8b',
    foam: '#d7f3e8', grass: '#6fa85e', grassDark: '#548944',
    sidewalk: '#e3cb9e', shadow: 'rgba(43,32,22,0.24)',
    ink: '#17232a', panel: 'rgba(15,26,33,0.80)', panelLight: 'rgba(22,38,45,0.90)',
    text: '#fff4df', muted: '#b9c5c0', gold: '#ffc857', red: '#e8564b',
    teal: '#37c5b6', blue: '#6cbfe8', green: '#6bd07a'
  };
  SB.FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

  // mulberry32: the same seed rebuilds the exact same city and traffic.
  SB.rng = function (seed) {
    let a = seed | 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  const u = SB.u = {};
  u.clamp = (v, lo, hi) => v < lo ? lo : v > hi ? hi : v;
  u.lerp = (a, b, t) => a + (b - a) * t;
  u.dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
  u.rand = (r, lo, hi) => lo + r() * (hi - lo);
  u.pick = (r, list) => list[Math.floor(r() * list.length) % list.length];
  u.angleDiff = function (a, b) {
    let d = (a - b + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    return d;
  };
  u.turnToward = function (from, to, maxStep) {
    const d = u.angleDiff(to, from);
    return from + u.clamp(d, -maxStep, maxStep);
  };
  u.approach = function (value, target, step) {
    return value < target ? Math.min(target, value + step) : Math.max(target, value - step);
  };
  u.circleRect = function (cx, cy, r, rect) {
    const nx = u.clamp(cx, rect.x, rect.x + rect.w);
    const ny = u.clamp(cy, rect.y, rect.y + rect.h);
    const dx = cx - nx, dy = cy - ny;
    return dx * dx + dy * dy < r * r;
  };
  u.money = function (n) {
    return '$' + Math.max(0, Math.round(n)).toLocaleString('en-US');
  };
  u.clock = function (minutes) {
    const m = ((Math.floor(minutes) % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  };
})(window.SB = window.SB || {});
