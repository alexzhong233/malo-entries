/* SOLARA BAY - ambient civilian traffic, lanes, lights and following behaviour. */
(function () {
  'use strict';
  const SB = (window.SB = window.SB || {});
  const C = SB.C, U = SB.U;

  const cars = [];
  const rng = U.makeRng(C.SEED + 991);

  function laneFor(axis, dir) {
    if (axis === 'h') return dir > 0 ? 11 : -11;
    return dir > 0 ? -11 : 11;
  }

  function assignAI(v, axis, line, dir) {
    v.ai = {
      axis: axis, line: line, dir: dir, lane: laneFor(axis, dir),
      desire: 92 + rng() * 70, stuck: 0, greenOffset: rng() * 12
    };
    if (axis === 'h') {
      v.a = dir > 0 ? 0 : Math.PI;
      v.y = line + v.ai.lane;
      v.vx = Math.cos(v.a) * 70; v.vy = 0;
    } else {
      v.a = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      v.x = line + v.ai.lane;
      v.vx = 0; v.vy = Math.sin(v.a) * 70;
    }
  }

  function nextIntersection(pos, lines, dir) {
    let best = null, bd = Infinity;
    for (let i = 0; i < lines.length; i++) {
      const d = (lines[i] - pos) * dir;
      if (d > 4 && d < bd) { bd = d; best = lines[i]; }
    }
    return { line: best, d: bd };
  }

  function lightGreen(axis, ix, iy, offset) {
    const phase = (SB.World.time * 1.05 + offset + U.hash(ix * 31 + iy * 17) * 12) % 20;
    const horizontal = phase < 9.2;
    return axis === 'h' ? horizontal : !horizontal;
  }

  function respawn(v) {
    const axis = rng() < 0.55 ? 'h' : 'v';
    const line = U.pick(rng, axis === 'h' ? C.ROAD_Y : C.ROAD_X);
    const dir = rng() < 0.5 ? 1 : -1;
    if (axis === 'h') v.x = dir > 0 ? -70 : C.WORLD + 70;
    else v.y = dir > 0 ? -70 : C.WORLD + 70;
    assignAI(v, axis, line, dir);
  }

  const Traffic = {
    cars: cars,
    assign: function (v, axis, line, dir) { assignAI(v, axis, line, dir); },

    init: function () {
      cars.length = 0;
      for (let i = 0; i < 62; i++) {
        const axis = rng() < 0.55 ? 'h' : 'v';
        const line = U.pick(rng, axis === 'h' ? C.ROAD_Y : C.ROAD_X);
        const dir = rng() < 0.5 ? 1 : -1;
        const cross = 100 + rng() * (C.WORLD - 200);
        const opts = { kind: 'civilian', maxSpeed: 180 + rng() * 90, accel: 175 + rng() * 70 };
        const v = (axis === 'h')
          ? SB.Vehicles.spawn(cross, line + laneFor(axis, dir), dir > 0 ? 0 : Math.PI, opts)
          : SB.Vehicles.spawn(line + laneFor(axis, dir), cross, dir > 0 ? Math.PI / 2 : -Math.PI / 2, opts);
        assignAI(v, axis, line, dir);
        cars.push(v);
      }
    },

    makePatrol: function (x, y) {
      const nr = SB.World.nearestRoad(x, y);
      const v = SB.Vehicles.spawn(x, y, nr.axis === 'h' ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2),
        { kind: 'police', maxSpeed: 330, accel: 300 });
      assignAI(v, nr.axis, nr.axis === 'h' ? nr.y : nr.x, rng() < 0.5 ? 1 : -1);
      v.x = x; v.y = y;
      return v;
    },

    reassign: function (v) {
      if (!v || v.wrecked || v.occupied) return;
      const axis = rng() < 0.5 ? 'h' : 'v';
      const line = U.pick(rng, axis === 'h' ? C.ROAD_Y : C.ROAD_X);
      const dir = rng() < 0.5 ? 1 : -1;
      if (axis === 'h') v.x = U.clamp(100 + rng() * (C.WORLD - 200), 40, C.WORLD - 40);
      else v.y = U.clamp(100 + rng() * (C.WORLD - 200), 40, C.WORLD - 40);
      assignAI(v, axis, line, dir);
      if (this.cars.indexOf(v) < 0) this.cars.push(v);
    },

    update: function (dt) {
      for (let i = 0; i < cars.length; i++) {
        const v = cars[i];
        if (v.occupied || v.wrecked || !v.ai) continue;
        const ai = v.ai;
        const ctl = v.controls;

        // Aim at a point down the lane: smooth steering through intersections.
        const tx = ai.axis === 'h' ? v.x + ai.dir * 170 : ai.line + ai.lane;
        const ty = ai.axis === 'h' ? ai.line + ai.lane : v.y + ai.dir * 170;
        const desired = Math.atan2(ty - v.y, tx - v.x);
        ctl.steer = U.clamp(U.normAngle(desired - v.a) * 2.6, -1, 1);

        let brake = 0;
        const cross = ai.axis === 'h' ? v.x : v.y;
        const lines = ai.axis === 'h' ? C.ROAD_X : C.ROAD_Y;
        const inter = nextIntersection(cross, lines, ai.dir);
        if (inter.line !== null && inter.d < 155 && inter.d > 6) {
          const gx = ai.axis === 'h' ? lines.indexOf(inter.line) : Math.round(v.x / C.GRID);
          const gy = ai.axis === 'h' ? Math.round(v.y / C.GRID) : lines.indexOf(inter.line);
          if (!lightGreen(ai.axis, gx, gy, ai.greenOffset) && inter.d < 85) brake = 1;
        }
        // Yield to the car ahead in this lane.
        for (let j = 0; j < cars.length; j++) {
          const o = cars[j];
          if (o === v || o.wrecked || !o.ai || o.ai.axis !== ai.axis || o.ai.line !== ai.line || o.ai.dir !== ai.dir) continue;
          const ahead = ((o.x - v.x) * (ai.axis === 'h' ? ai.dir : 0) + (o.y - v.y) * (ai.axis === 'v' ? ai.dir : 0));
          if (ahead > 0 && ahead < 115) {
            const gap = Math.abs(ai.axis === 'h' ? o.y - v.y : o.x - v.x);
            if (gap < 26) { brake = Math.max(brake, U.clamp((115 - ahead) / 62, 0, 1)); }
          }
        }
        ctl.throttle = brake > 0.05 ? 0 : (v.speed() < ai.desire ? 0.75 : 0);
        ctl.brake = brake;
        if (v.speed() < 7 && !brake) ai.stuck += dt; else ai.stuck = 0;
        if (ai.stuck > 6 || v.x < -150 || v.y < -150 || v.x > C.WORLD + 150 || v.y > C.WORLD + 150) respawn(v);
      }
    }
  };

  SB.Traffic = Traffic;
})();
