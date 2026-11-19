(function (SB) {
  'use strict';

  var KEY = 'solarabay.save.v1';
  var memory = null;

  function safeGet() {
    try {
      if (window.localStorage) return window.localStorage.getItem(KEY);
    } catch (e) {}
    return memory;
  }

  function read() {
    var raw = safeGet();
    if (!raw) return null;
    try {
      var data = JSON.parse(raw);
      if (!data || typeof data !== 'object') return null;
      if (typeof data.cash !== 'number') return null;
      return data;
    } catch (e) { return null; }
  }

  function has() { return !!read(); }

  function write(world) {
    if (!world || !world.player) return;
    var p = world.player;
    var data = {
      version: 1,
      cash: Math.floor(world.cash),
      missionIndex: world.missionIndex,
      completed: world.completed.slice(),
      position: { x: Math.round(p.x), y: Math.round(p.y) },
      stats: {
        stolen: world.stats.stolen, shots: world.stats.shots,
        distance: Math.round(world.stats.distance), jobs: world.stats.jobs
      },
      clock: Math.round(world.clock * 100) / 100,
      savedAt: Date.now()
    };
    memory = JSON.stringify(data);
    try {
      if (window.localStorage) window.localStorage.setItem(KEY, memory);
    } catch (e) {}
    return data;
  }

  function clear() {
    memory = null;
    try { if (window.localStorage) window.localStorage.removeItem(KEY); } catch (e) {}
  }

  function describe() {
    var d = read();
    if (!d) return 'NO SAVE FILE';
    var jobs = d.completed ? d.completed.filter(Boolean).length : 0;
    return 'JOB ' + Math.min(7, (d.missionIndex || 0) + 1) + ' / 7   ' + SB.U.cash(d.cash) + '   ' + jobs + ' DONE';
  }

  SB.Save = { read: read, has: has, write: write, clear: clear, describe: describe, KEY: KEY };
})(window.SB = window.SB || {});
