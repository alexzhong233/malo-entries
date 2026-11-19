/* SOLARA BAY - world state, surfaces and collision. */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const C = SB.C, U = SB.U;
  const HASH_CELL = 165;

  const World = {
    city: null,
    grid: {},
    time: 0,

    init: function () {
      this.city = SB.City.generate(C.SEED);
      this.grid = {};
      const self = this;
      this.city.buildings.forEach(function (b) {
        const k = self.key(b.x + b.w / 2, b.y + b.h / 2);
        (self.grid[k] || (self.grid[k] = [])).push(b);
      });
    },

    key: function (x, y) {
      return Math.floor(x / HASH_CELL) + ',' + Math.floor(y / HASH_CELL);
    },

    shore: function (y) {
      return C.SHORE_BASE + 26 * Math.sin(y / 430) + 14 * Math.sin(y / 137);
    },

    isWater: function (x, y) {
      if (x < this.shore(y)) return true;
      return y > C.INLET_Y0 && y < C.INLET_Y1 && x < C.INLET_X;
    },

    onPier: function (x, y, pad) {
      pad = pad || 0;
      const piers = this.city.piers;
      for (let i = 0; i < piers.length; i++) {
        const p = piers[i];
        if (x > p.x - pad && x < p.x + p.w + pad && y > p.y - pad && y < p.y + p.h + pad) return true;
      }
      return false;
    },

    nearbyBuildings: function (x, y) {
      const gx = Math.floor(x / HASH_CELL), gy = Math.floor(y / HASH_CELL);
      const out = [];
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          const list = this.grid[(gx + i) + ',' + (gy + j)];
          if (list) out.push.apply(out, list);
        }
      }
      return out;
    },

    solid: function (x, y, r) {
      if (x < r || y < r || x > C.WORLD - r || y > C.WORLD - r) return true;
      if (this.isWater(x, y) && !this.onPier(x, y, -r * 0.5)) return true;
      const list = this.nearbyBuildings(x, y);
      for (let i = 0; i < list.length; i++) {
        if (U.circleRect(x, y, r, list[i])) return true;
      }
      return false;
    },

    // Axis-separated movement with substeps keeps fast cars from tunnelling.
    move: function (ent, dx, dy, r) {
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 7));
      let hitX = false, hitY = false;
      for (let s = 0; s < steps; s++) {
        const sx = dx / steps, sy = dy / steps;
        if (sx && !this.solid(ent.x + sx, ent.y, r)) ent.x += sx; else if (sx) hitX = true;
        if (sy && !this.solid(ent.x, ent.y + sy, r)) ent.y += sy; else if (sy) hitY = true;
      }
      return { x: hitX, y: hitY };
    },

    surface: function (x, y) {
      if (this.isWater(x, y)) return 'water';
      if (this.onPier(x, y)) return 'pier';
      if (x < C.SAND_END && y < C.INLET_Y0) return 'sand';
      const p = this.city.park;
      if (U.pointRect(x, y, p)) return 'park';
      const rx = this.nearestRoadLine(x, C.ROAD_X);
      const ry = this.nearestRoadLine(y, C.ROAD_Y);
      if (Math.abs(rx.d) < C.HALF || Math.abs(ry.d) < C.HALF) return 'road';
      if (Math.abs(rx.d) < C.HALF + 12 || Math.abs(ry.d) < C.HALF + 12) return 'sidewalk';
      return 'lot';
    },

    nearestRoadLine: function (v, lines) {
      let best = lines[0], bd = Math.abs(v - best);
      for (let i = 1; i < lines.length; i++) {
        const d = Math.abs(v - lines[i]);
        if (d < bd) { bd = d; best = lines[i]; }
      }
      return { v: best, d: v - best };
    },

    nearestRoad: function (x, y) {
      const nx = this.nearestRoadLine(x, C.ROAD_X);
      const ny = this.nearestRoadLine(y, C.ROAD_Y);
      if (Math.abs(nx.d) < Math.abs(ny.d)) return { x: nx.v, y: y, axis: 'v', d: Math.abs(nx.d) };
      return { x: x, y: ny.v, axis: 'h', d: Math.abs(ny.d) };
    },

    lineClear: function (x1, y1, x2, y2) {
      const d = U.dist(x1, y1, x2, y2);
      const steps = Math.ceil(d / 28);
      for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const x = U.lerp(x1, x2, t), y = U.lerp(y1, y2, t);
        const list = this.nearbyBuildings(x, y);
        for (let j = 0; j < list.length; j++) {
          if (U.pointRect(x, y, list[j])) return false;
        }
      }
      return true;
    },

    roadPoint: function (ix, iy, ox, oy) {
      return { x: C.ROAD_X[ix] + (ox || 0), y: C.ROAD_Y[iy] + (oy || 0) };
    }
  };

  SB.World = World;
})();
