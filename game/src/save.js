/* SOLARA BAY - localStorage persistence for cash, story progress and location. */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const C = SB.C;

  const Save = {
    data: null,

    fresh: function () {
      return {
        cash: 350,
        mission: 0,
        x: C.ROAD_X[0] + 100,
        y: C.ROAD_Y[4],
        health: 100,
        seconds: 0,
        version: 1
      };
    },

    load: function () {
      if (this.data) return this.data;
      try {
        const raw = window.localStorage.getItem(C.SAVE_KEY);
        if (!raw) return null;
        const d = JSON.parse(raw);
        if (!d || d.version !== 1 || typeof d.cash !== 'number' ||
            typeof d.mission !== 'number' || typeof d.x !== 'number' || typeof d.y !== 'number') return null;
        d.cash = Math.max(0, Math.floor(d.cash));
        d.mission = SB.U.clamp(Math.floor(d.mission), 0, 7);
        d.health = SB.U.clamp(typeof d.health === 'number' ? d.health : 100, 1, 100);
        d.x = SB.U.clamp(d.x, 40, C.WORLD - 40);
        d.y = SB.U.clamp(d.y, 40, C.WORLD - 40);
        d.seconds = typeof d.seconds === 'number' ? d.seconds : 0;
        this.data = d;
        return d;
      } catch (e) { return null; }
    },

    hasSave: function () { return !!this.load(); },

    write: function (state) {
      if (!state || !SB.Player) return;
      const p = SB.Player.state;
      const d = {
        cash: state.cash,
        mission: SB.Missions ? SB.Missions.index : 0,
        x: Math.round(p.x), y: Math.round(p.y),
        health: Math.round(Math.max(1, p.health)),
        seconds: Math.round(state.elapsed || 0),
        version: 1
      };
      this.data = d;
      try { window.localStorage.setItem(C.SAVE_KEY, JSON.stringify(d)); } catch (e) { /* private mode */ }
    },

    clear: function () {
      this.data = null;
      try { window.localStorage.removeItem(C.SAVE_KEY); } catch (e) { /* ignore */ }
    }
  };

  SB.Save = Save;
})();
