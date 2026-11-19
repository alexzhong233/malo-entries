// SOLARA BAY save system: a small, validated localStorage record of the player's life in the city.
// Everything is wrapped in try/catch so private browsing, disabled storage or a corrupt record
// can never stop the game from running. save.js is loaded before the systems that call it.
(function (SB) {
  'use strict';
  const u = SB.u, P = SB.PLAYER, KEY = SB.SAVE_KEY, SAVE_VERSION = 1;

  function storage() {
    try { return window.localStorage; } catch (err) { return null; }
  }
  function number(value, fallback, lo, hi) {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return fallback;
    return u.clamp(n, lo, hi);
  }

  const SAVE = SB.save = {};

  SAVE.capture = function (w) {
    return {
      version: SAVE_VERSION,
      seed: w.seed,
      x: Math.round(w.player.x), y: Math.round(w.player.y),
      money: Math.round(w.money),
      wanted: w.wanted,
      health: Math.round(w.player.health),
      ammo: Math.round(w.player.ammo),
      gun: !!w.player.gun,
      clock: Math.round(w.clock),
      missionIndex: w.mission.index,
      missionDone: !!w.mission.done,
      stats: {
        kills: w.stats.kills | 0,
        cars: w.stats.cars | 0,
        missions: w.stats.missions | 0
      },
      savedAt: Date.now()
    };
  };

  SAVE.write = function (w) {
    const store = storage();
    if (!store) return false;
    try {
      store.setItem(KEY, JSON.stringify(SAVE.capture(w)));
      return true;
    } catch (err) { return false; }
  };

  SAVE.read = function () {
    const store = storage();
    if (!store) return null;
    try {
      const data = JSON.parse(store.getItem(KEY) || 'null');
      if (!data || typeof data !== 'object' || data.version !== SAVE_VERSION) return null;
      if (!Number.isFinite(Number(data.money))) return null;
      return {
        seed: number(data.seed, 0, 0, 4294967295),
        x: number(data.x, P.respawnX, SB.WORLD.minX + 20, SB.WORLD.maxX - 20),
        y: number(data.y, P.respawnY, SB.WORLD.minY + 20, SB.WORLD.maxY - 20),
        money: number(data.money, 280, 0, 100000000),
        wanted: Math.floor(number(data.wanted, 0, 0, 5)),
        health: number(data.health, P.maxHealth, 1, P.maxHealth),
        ammo: Math.floor(number(data.ammo, P.ammo, 0, 999)),
        gun: data.gun !== false,
        clock: number(data.clock, SB.DAY.start, 0, 1440),
        missionIndex: Math.floor(number(data.missionIndex, 0, 0, 99)),
        missionDone: !!data.missionDone,
        stats: {
          kills: Math.floor(number(data.stats && data.stats.kills, 0, 0, 100000)),
          cars: Math.floor(number(data.stats && data.stats.cars, 0, 0, 100000)),
          missions: Math.floor(number(data.stats && data.stats.missions, 0, 0, 100000))
        }
      };
    } catch (err) { return null; }
  };

  // Only offer CONTINUE when the record actually parses; a corrupt save cannot be resumed.
  SAVE.has = function () {
    return SAVE.read() !== null;
  };

  SAVE.clear = function () {
    const store = storage();
    if (!store) return;
    try { store.removeItem(KEY); } catch (err) { /* storage disabled */ }
  };

  // Put a validated save straight onto a freshly reset world. The mission list itself is data,
  // so an index from an older build is clamped to the current chain by missions.resume().
  SAVE.apply = function (w, data) {
    if (!data) return false;
    w.player.x = data.x; w.player.y = data.y;
    w.player.health = data.health;
    w.player.ammo = data.ammo;
    w.player.gun = data.gun;
    w.money = data.money;
    w.wanted = data.wanted;
    w.clock = data.clock;
    w.copTimer = data.wanted >= 4 ? 1 : 2.5; // saved heat brings backup quickly
    w.stats = { kills: data.stats.kills, cars: data.stats.cars, missions: data.stats.missions };
    w.camera.x = data.x; w.camera.y = data.y;
    SB.missions.resume(w, data.missionIndex, data.missionDone);
    if (data.wanted > 0) {
      SB.say(w, 'WANTED ' + '★'.repeat(data.wanted), 'The heat followed you home.', 3.2);
    }
    return true;
  };
})(window.SB = window.SB || {});
