(function (SB) {
  'use strict';

  var CFG = SB.CFG, U = SB.U;
  var CELL = CFG.BLOCK_CELL;

  // The bay curls inland around the marina, so the west shore is never a straight line.
  function shorelineAt(y) {
    var s = CFG.WATER_BASE + 28 * Math.sin(y * 0.0031) + 12 * Math.sin(y * 0.0107 + 1.3);
    if (y > 3450 && y < 5150) {
      s += 196 * Math.sin(Math.PI * (y - 3450) / 1700);
    }
    return s;
  }

  function inPark(x, y) {
    var p = SB.City.park;
    return x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h;
  }

  function isWater(x, y, city) {
    if (x < shorelineAt(y)) return true;
    if (city && city.ponds) {
      for (var i = 0; i < city.ponds.length; i++) {
        var p = city.ponds[i];
        if (U.dist2(x, y, p.x, p.y) < p.r * p.r) return true;
      }
    }
    return false;
  }

  function onRoad(x, y, city) {
    var half = CFG.ROAD_W * 0.5 + 5, i;
    for (i = 0; i < city.roadXs.length; i++) if (Math.abs(x - city.roadXs[i]) < half) return true;
    for (i = 0; i < city.roadYs.length; i++) if (Math.abs(y - city.roadYs[i]) < half) return true;
    return false;
  }

  function buildingsNear(city, x, y, r) {
    var out = [];
    var cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    for (var ix = cx - 1; ix <= cx + 1; ix++) {
      for (var iy = cy - 1; iy <= cy + 1; iy++) {
        var bucket = city.cellMap.get(ix + ',' + iy);
        if (bucket) for (var k = 0; k < bucket.length; k++) out.push(bucket[k]);
      }
    }
    return out;
  }

  function blocked(city, x, y, r) {
    if (x < r || y < r || x > CFG.WORLD_W - r || y > CFG.WORLD_H - r) return true;
    if (isWater(x, y, city)) return true;
    var list = buildingsNear(city, x, y, r);
    for (var i = 0; i < list.length; i++) {
      var b = list[i];
      if (U.circleRect(x, y, r, b.x, b.y, b.w, b.h)) return true;
    }
    return false;
  }

  function clearLine(city, x1, y1, x2, y2) {
    var steps = Math.ceil(U.dist(x1, y1, x2, y2) / 34);
    for (var s = 1; s < steps; s++) {
      var t = s / steps;
      if (isWater(U.lerp(x1, x2, t), U.lerp(y1, y2, t), city)) return false;
    }
    var cx0 = Math.floor(Math.min(x1, x2) / CELL), cx1 = Math.floor(Math.max(x1, x2) / CELL);
    var cy0 = Math.floor(Math.min(y1, y2) / CELL), cy1 = Math.floor(Math.max(y1, y2) / CELL);
    for (var cx = cx0; cx <= cx1; cx++) {
      for (var cy = cy0; cy <= cy1; cy++) {
        var bucket = city.cellMap.get(cx + ',' + cy);
        if (!bucket) continue;
        for (var i = 0; i < bucket.length; i++) {
          var b = bucket[i];
          if (U.segmentRect(x1, y1, x2, y2, b.x - 2, b.y - 2, b.w + 4, b.h + 4)) return false;
        }
      }
    }
    return true;
  }

  function indexBuilding(city, b) {
    var x0 = Math.floor(b.x / CELL), x1 = Math.floor((b.x + b.w) / CELL);
    var y0 = Math.floor(b.y / CELL), y1 = Math.floor((b.y + b.h) / CELL);
    for (var x = x0; x <= x1; x++) {
      for (var y = y0; y <= y1; y++) {
        var key = x + ',' + y;
        if (!city.cellMap.has(key)) city.cellMap.set(key, []);
        city.cellMap.get(key).push(b);
      }
    }
  }

  function addBuilding(city, x, y, w, h, rng) {
    var pal = U.pick(rng, CFG.BUILDING_PALETTES);
    var b = {
      x: x, y: y, w: w, h: h,
      height: U.range(rng, 10, 54),
      top: pal[0], side: pal[1], edge: pal[2],
      roof: Math.floor(rng() * 4),
      seed: rng(),
      windows: rng() > 0.25
    };
    city.buildings.push(b);
    indexBuilding(city, b);
  }

  function generate(seed) {
    var rng = U.rng(seed || 77123);
    var city = {
      seed: seed || 77123,
      roadXs: [], roadYs: [],
      buildings: [], trees: [], ponds: [], props: [], piers: [],
      cellMap: new Map(),
      park: { x: 3970, y: 1680, w: 880, h: 580 }
    };
    SB.City.park = city.park;

    for (var x = 300; x <= 5700; x += CFG.ROAD_STEP) city.roadXs.push(x);
    for (var y = 300; y <= 5700; y += CFG.ROAD_STEP) city.roadYs.push(y);

    city.ponds.push({ x: 4410, y: 1960, r: 132 });
    city.ponds.push({ x: 4670, y: 2110, r: 62 });

    var half = CFG.ROAD_W * 0.5, sw = CFG.SIDEWALK;
    for (var i = 0; i < city.roadXs.length - 1; i++) {
      for (var j = 0; j < city.roadYs.length - 1; j++) {
        var bx0 = city.roadXs[i] + half + sw, bx1 = city.roadXs[i + 1] - half - sw;
        var by0 = city.roadYs[j] + half + sw, by1 = city.roadYs[j + 1] - half - sw;
        var mx = (bx0 + bx1) * 0.5, my = (by0 + by1) * 0.5;
        if (isWater(mx, my, city)) continue;
        if (inPark(mx, my)) continue;

        var cols = bx1 - bx0 > 190 ? 2 : 1;
        var rows = by1 - by0 > 190 ? 2 : 1;
        for (var c = 0; c < cols; c++) {
          for (var r = 0; r < rows; r++) {
            if (rng() < 0.09) continue; // parking lots and plazas
            var lw = (bx1 - bx0) / cols, lh = (by1 - by0) / rows;
            var pad = U.range(rng, 7, 14);
            var wx = bx0 + c * lw + pad, wy = by0 + r * lh + pad;
            var ww = lw - pad * 2 - U.range(rng, 0, 9);
            var hh = lh - pad * 2 - U.range(rng, 0, 9);
            if (ww > 28 && hh > 28) addBuilding(city, wx, wy, ww, hh, rng);
          }
        }
      }
    }

    // Palm promenade along the bay and waterfront road.
    for (var py = 260; py < 5780; py += 84) {
      var sx = shorelineAt(py);
      if (!isWater(sx + 46, py, city)) {
        city.trees.push({ x: sx + 44 + U.range(rng, -10, 14), y: py + U.range(rng, -22, 22),
          kind: 'palm', scale: U.range(rng, 0.82, 1.28), lean: U.range(rng, -0.25, 0.25), seed: rng() });
      }
      if (!isWater(sx + 128, py, city) && rng() > 0.55) {
        city.trees.push({ x: sx + 128, y: py + U.range(rng, -18, 18),
          kind: 'palm', scale: U.range(rng, 0.8, 1.1), lean: U.range(rng, -0.2, 0.2), seed: rng() });
      }
      if (rng() > 0.62) {
        city.props.push({ x: sx + U.range(rng, 18, 120), y: py + U.range(rng, -30, 30),
          kind: rng() > 0.5 ? 'umbrella' : 'chair', color: U.pick(rng, ['#f6efe0', '#ff8d72', '#76c9cf', '#f2c85c']) });
      }
    }

    for (var tx = city.park.x + 55; tx < city.park.x + city.park.w; tx += 92) {
      for (var ty = city.park.y + 55; ty < city.park.y + city.park.h; ty += 92) {
        if (isWater(tx, ty, city)) continue;
        if (Math.abs(tx - 4430) < 48 || Math.abs(ty - 1940) < 48) continue;
        city.trees.push({ x: tx + U.range(rng, -18, 18), y: ty + U.range(rng, -18, 18),
          kind: 'oak', scale: U.range(rng, 0.85, 1.3), lean: 0, seed: rng() });
      }
    }
    // Occasional street trees soften the downtown grid.
    for (var si = 0; si < city.roadXs.length; si += 2) {
      for (var sj = 1; sj < city.roadYs.length; sj += 3) {
        var gx = city.roadXs[si] + half + 26, gy = city.roadYs[sj] + half + 28;
        if (!isWater(gx, gy, city) && !blocked(city, gx, gy, 8) && !inPark(gx, gy)) {
          city.trees.push({ x: gx, y: gy, kind: 'palm', scale: U.range(rng, 0.7, 0.95),
            lean: U.range(rng, -0.2, 0.2), seed: rng() });
        }
      }
    }

    for (var pi = 0; pi < 3; pi++) {
      var pyp = 4380 + pi * 210, psx = shorelineAt(pyp);
      city.piers.push({ x: psx - 165, y: pyp, w: 205, h: 30 });
    }
    return city;
  }

  function nearestRoadPoint(city, x, y) {
    var best = null, bd = Infinity, i, d;
    for (i = 0; i < city.roadXs.length; i++) {
      d = Math.abs(x - city.roadXs[i]);
      if (d < bd && !isWater(city.roadXs[i], y, city)) { bd = d; best = { x: city.roadXs[i], y: y }; }
    }
    for (i = 0; i < city.roadYs.length; i++) {
      d = Math.abs(y - city.roadYs[i]);
      if (d < bd && !isWater(x, city.roadYs[i], city)) { bd = d; best = { x: x, y: city.roadYs[i] }; }
    }
    return best || { x: x, y: y };
  }

  function randomRoadPoint(city, rng) {
    for (var tries = 0; tries < 30; tries++) {
      var vert = rng() > 0.5;
      var px = vert ? U.pick(rng, city.roadXs) : U.range(rng, 380, CFG.WORLD_W - 380);
      var py = vert ? U.range(rng, 380, CFG.WORLD_H - 380) : U.pick(rng, city.roadYs);
      if (!isWater(px, py, city)) return { x: px, y: py, vertical: vert };
    }
    return { x: 1200, y: 1200, vertical: false };
  }

  SB.City = {
    generate: generate, shorelineAt: shorelineAt, isWater: isWater, blocked: blocked,
    onRoad: onRoad, clearLine: clearLine, nearestRoadPoint: nearestRoadPoint,
    randomRoadPoint: randomRoadPoint, buildingsNear: buildingsNear, park: null
  };
})(window.SB = window.SB || {});
